// Registers the `doctor_check` tool (seen by Claude as mcp__sdd__doctor_check): it gathers the
// facts about the project in the session's working directory and hands them to the pure rules in
// core/check.ts. /sdd:doctor check renders the result.
import { needs, runChecks } from './core/check.ts'
import type { FeatureFiles, Snapshot } from './core/check.ts'

const TOOL = 'mcp__sdd__doctor_check'

async function readText($: any, path: string): Promise<string | null> {
  try {
    if (!(await $.fs.exists(path))) return null
    return String(await $.fs.read(path))
  } catch {
    return null
  }
}

async function exists($: any, path: string): Promise<boolean> {
  try {
    return Boolean(await $.fs.exists(path))
  } catch {
    return false
  }
}

async function run($: any, argv: string[]): Promise<{ exitCode: number; stdout: string } | null> {
  try {
    const r = await $.process.run(argv)
    return { exitCode: r.exitCode, stdout: String(r.stdout ?? '') }
  } catch {
    return null
  }
}

async function readFeatures($: any): Promise<FeatureFiles[]> {
  const out: FeatureFiles[] = []
  try {
    if (!(await $.fs.exists('specs'))) return out
    const entries: any[] = await $.fs.list('specs')
    for (const entry of entries) {
      if (entry.kind !== 'directory' && entry.kind !== 'dir') continue
      const base = 'specs/' + entry.name + '/'
      const spec = await readText($, base + 'spec.md')
      const plan = await readText($, base + 'plan.md')
      const tasks = await readText($, base + 'tasks.md')
      const review = await readText($, base + 'review.md')
      if (spec === null && plan === null && tasks === null && review === null) continue
      out.push({ slug: entry.name, spec, plan, tasks, review })
    }
  } catch {
    // report what was read
  }
  return out
}

async function toolResolves($: any, exe: string, dir: string | null): Promise<boolean> {
  const bases = [dir ?? '.', '.']
  if (exe.includes('/')) {
    for (const b of bases) if (await exists($, b === '.' ? exe : b + '/' + exe)) return true
    return false
  }
  const found = await run($, ['which', exe])
  if (found && found.exitCode === 0) return true
  for (const b of bases) if (await exists($, (b === '.' ? '' : b + '/') + 'node_modules/.bin/' + exe)) return true
  return false
}

async function gather($: any, offline: boolean): Promise<Snapshot> {
  const constitution = await readText($, 'specs/constitution.md')
  const template = await readText($, 'specs/template.md')
  const capabilities = await readText($, 'specs/capabilities.md')
  const legacy: string[] = []
  for (const p of ['specs/_constitution.md', 'specs/_template.md', '.claude/capabilities.md']) if (await exists($, p)) legacy.push(p)

  const isRepo = await exists($, '.git')
  let clean: boolean | null = null
  if (isRepo) {
    const st = await run($, ['git', 'status', '--porcelain'])
    clean = st ? st.exitCode === 0 && st.stdout.trim() === '' : null
  }
  let gh: boolean | null = null
  let ghAuth: boolean | null = null
  if (!offline) {
    const found = await run($, ['which', 'gh'])
    gh = found !== null && found.exitCode === 0
    if (gh) {
      const auth = await run($, ['gh', 'auth', 'status'])
      ghAuth = auth !== null && auth.exitCode === 0
    }
  }

  const wanted = needs(constitution, capabilities)
  const paths: Record<string, boolean> = {}
  for (const p of wanted.paths) paths[p] = await exists($, p)
  const tools: Record<string, boolean> = {}
  for (const t of wanted.tools) tools[t.key] = await toolResolves($, t.exe, t.dir)

  return {
    constitution,
    template,
    capabilities,
    legacy,
    features: await readFeatures($),
    settings: await readText($, '.claude/settings.json'),
    git: { isRepo, clean, gh, ghAuth },
    paths,
    tools,
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      await $.tool.register({
        name: 'doctor_check',
        description: 'Read-only SDD readiness check of the project in the working directory: constitution, spec template, capabilities, git and gh, tooling, sibling repositories and every feature under specs/. Returns JSON with a verdict and one result per check. Used by /sdd:doctor check.',
        inputSchema: { type: 'object', properties: { offline: { type: 'boolean', description: 'Skip the gh lookups (no network)' } } },
        isDeferred: false,
      })
    } catch (error) {
      $.ui.log('sdd: could not register doctor_check: ' + String(error), { to: 'debug' })
    }
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    try {
      const report = runChecks(await gather($, e.offline === true))
      return { result: JSON.stringify(report) }
    } catch (error) {
      return { result: JSON.stringify({ error: String(error) }) }
    }
  })
}
