// Registers the `doctor_check` tool (seen by Claude as mcp__sdd__doctor_check): it gathers the
// facts about the project in the session's working directory and hands them to the pure rules in
// core/check.ts. /sdd:doctor check renders the result.
import { flowRefs, needs, parseCapabilities, runChecks } from './core/check.ts'
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

// Plugins installed for this user: name -> install path, read from ~/.claude/plugins/installed_plugins.json.
// null when the registry cannot be read (then plugin-provided skills and agents are not judged).
async function installedPlugins($: any, home: string): Promise<{ name: string; path: string }[] | null> {
  const text = await readText($, home + '/.claude/plugins/installed_plugins.json')
  if (text === null) return null
  const paths: string[] = []
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      if (typeof v.installPath === 'string') paths.push(v.installPath)
      Object.values(v).forEach(walk)
    }
  }
  try {
    walk(JSON.parse(text))
  } catch {
    return null
  }
  const out: { name: string; path: string }[] = []
  for (const path of paths) {
    const manifest = await readText($, path + '/.claude-plugin/plugin.json')
    try {
      const name = manifest ? JSON.parse(manifest).name : null
      if (typeof name === 'string') out.push({ name, path })
    } catch {
      // skip a plugin with a broken manifest
    }
  }
  return out
}

// Is `skill:<name>` / `agent:<name>` installed? `plugin:name` limits the search to that plugin.
// null: cannot tell (no home directory, or no plugin registry and the name is not a local file).
async function flowResolves($: any, kind: 'skill' | 'agent', name: string, home: string, plugins: { name: string; path: string }[] | null): Promise<boolean | null> {
  if (!home) return null
  const [prefix, local] = name.includes(':') ? [name.slice(0, name.indexOf(':')), name.slice(name.indexOf(':') + 1)] : [null, name]
  const file = (base: string) => (kind === 'skill' ? base + '/skills/' + local + '/SKILL.md' : base + '/agents/' + local + '.md')
  const bases: string[] = []
  if (prefix === null) bases.push('.claude', home + '/.claude')
  for (const p of plugins ?? []) if (prefix === null || p.name === prefix) bases.push(p.path)
  for (const b of bases) if (await exists($, file(b))) return true
  return plugins === null ? null : false
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

  const flows: Record<string, boolean | null> = {}
  if (capabilities) {
    const refs = flowRefs(parseCapabilities(capabilities)).filter((r) => r.kind !== 'command')
    if (refs.length > 0) {
      const home = (await run($, ['sh', '-c', 'printf %s "$HOME"']))?.stdout.trim() ?? ''
      const plugins = home ? await installedPlugins($, home) : null
      for (const r of refs) {
        const key = r.kind + ':' + r.name
        if (!(key in flows)) flows[key] = await flowResolves($, r.kind as 'skill' | 'agent', r.name, home, plugins)
      }
    }
  }

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
    flows,
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
