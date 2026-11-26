// The Ctx of a real run (see command.ts): the repository the CLI runs in, node:fs relative to its
// root, git for the branch. The rules live in ../core (shared with the mod).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { featureOf, featureOfBranch, featurePath } from '../core/features.ts'
import type { FeatureFiles } from '../core/features.ts'
import { CAPABILITIES_PATH, LEGACY_CAPABILITIES_PATH } from '../core/formats.ts'
import type { Ctx } from './command.ts'

export class Context implements Ctx {
  readonly root: string
  readonly changed: string[] = []
  private cache = new Map<string, unknown>()

  constructor(cwd: string) {
    const top = this.run(['git', 'rev-parse', '--show-toplevel'], cwd)
    this.root = top && top.exitCode === 0 && top.stdout.trim() ? top.stdout.trim() : cwd
  }

  run(argv: string[], cwd = this.root): { exitCode: number; stdout: string } | null {
    const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8' })
    return r.error ? null : { exitCode: r.status ?? 1, stdout: r.stdout ?? '' }
  }

  read(rel: string): string | null {
    const path = join(this.root, rel)
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  }

  write(rel: string, text: string): void {
    if (this.read(rel) === text) return
    writeFileSync(join(this.root, rel), text)
    if (!this.changed.includes(rel)) this.changed.push(rel)
  }

  private once<T>(key: string, load: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, load())
    return this.cache.get(key) as T
  }

  branch(): string {
    return this.once('branch', () => this.run(['git', 'branch', '--show-current'])?.stdout.trim() ?? '')
  }

  capabilities(): { yml: string | null; md: string | null } {
    return this.once('caps', () => {
      const yml = this.read(CAPABILITIES_PATH)
      return { yml, md: yml === null ? this.read(LEGACY_CAPABILITIES_PATH) : null }
    })
  }

  features(): FeatureFiles[] {
    return this.once('features', () => {
      const dir = join(this.root, 'specs')
      if (!existsSync(dir)) return []
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => featureOf(e.name, (doc) => this.read(featurePath(e.name, doc))))
        .filter((f): f is FeatureFiles => f !== null)
    })
  }

  feature(): FeatureFiles | null {
    return featureOfBranch(this.features(), this.branch())
  }
}
