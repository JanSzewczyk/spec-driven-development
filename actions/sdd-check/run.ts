// Entry point of the sdd-check GitHub Action: reads the repository with node:fs, runs the shared
// rules (shared/sdd-core) in `ci` mode and writes annotations, a job summary and an exit code.
// Usage: node run.ts [--path <dir>] [--fail-on fail|warn] [--json]
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { runChecks } from '../../shared/sdd-core/check.ts'
import type { CheckResult, Finding, Report } from '../../shared/sdd-core/check.ts'
import { gather } from '../../shared/sdd-core/gather.ts'
import type { Io } from '../../shared/sdd-core/gather.ts'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

export function ioFor(root: string): Io {
  const at = (p: string) => join(root, p)
  return {
    async read(p) {
      try {
        return readFileSync(at(p), 'utf8')
      } catch {
        return null
      }
    },
    async exists(p) {
      return existsSync(at(p))
    },
    async list(dir) {
      try {
        return readdirSync(at(dir), { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }))
      } catch {
        return []
      }
    },
    async run(argv) {
      const r = spawnSync(argv[0], argv.slice(1), { cwd: root, encoding: 'utf8' })
      return r.error ? null : { exitCode: r.status ?? 1, stdout: r.stdout ?? '' }
    },
  }
}

// The file an annotation points at: `specs/<slug>/<file>.md` named in the finding, else the check's file.
function fileOf(check: CheckResult, f: Finding): string | undefined {
  const m = f.text.match(/(specs\/[\w.-]+\/(?:spec|plan|tasks|review)\.md)/)
  if (m) return m[1]
  if (check.id === 1) return 'specs/constitution.md'
  if (check.id === 2) return 'specs/template.md'
  if (check.id === 3) return check.name // specs/capabilities.yml, or the legacy .md it read
  return undefined
}

const ICON = { pass: '✅', warn: '⚠️', fail: '❌' } as const
const cell = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ')

// Short report: verdict, what is missing, what failed, what to run. Markdown for the job summary.
export function summary(r: Report): string {
  const all = r.checks.flatMap((c) => c.findings.map((f) => ({ c, f })))
  const missing = all.filter(({ f }) => /missing|lacks|not set|no `/.test(f.text))
  const repairable = all.filter(({ f }) => f.fix === 'init')
  const manual = all.filter(({ f }) => f.fix !== 'init')
  const out: string[] = [`## SDD Check 🧭 — ${r.status.replace('_', ' ')} (${r.passed}/${r.total} checks passed)`, '']
  if (all.length === 0) return out.concat('Every artifact matches this version of SDD.').join('\n')
  if (missing.length > 0) out.push('### Missing', ...missing.map(({ f }) => `- ${f.text}`), '')
  out.push('### Checks', '', '| # | Check | Level | Finding |', '|---|-------|-------|---------|')
  for (const { c, f } of all) out.push(`| ${c.id} | ${c.name} | ${f.level === 'fail' ? ICON.fail : ICON.warn} | ${cell(f.text)} |`)
  out.push('', '### Repair')
  if (repairable.length > 0) out.push(`- Run \`/sdd:doctor init\` in Claude Code: it repairs ${repairable.length} finding(s) (${[...new Set(repairable.map(({ c }) => c.name))].join(', ')}) and re-checks.`)
  if (manual.length > 0) out.push(`- ${manual.length} finding(s) need your own change; \`/sdd:doctor check\` lists them with the fix.`)
  return out.join('\n')
}

async function main() {
  const root = arg('path', '.')
  const failOn = arg('fail-on', 'fail') === 'warn' ? 'warn' : 'fail'
  if (!existsSync(join(root, 'specs'))) {
    console.log(`::notice::No specs/ directory in '${root}': nothing to check. Run /sdd:doctor init to set SDD up.`)
    return 0
  }
  const report = runChecks(await gather(ioFor(root), { mode: 'ci' }))
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
  for (const c of report.checks) {
    for (const f of c.findings) {
      const file = fileOf(c, f)
      console.log(`::${f.level === 'fail' ? 'error' : 'warning'}${file ? ` file=${file}` : ''}::${f.text.replace(/\n/g, ' ')}`)
    }
  }
  const text = summary(report)
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${report.status}\n`)
  const bad = report.checks.some((c) => c.findings.some((f) => f.level === 'fail' || failOn === 'warn'))
  return bad ? 1 : 0
}

if (import.meta.main ?? process.argv[1]?.endsWith('run.ts')) process.exit(await main())
