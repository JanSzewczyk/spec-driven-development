// Reads a project into a Snapshot for runChecks. Everything goes through `Io`, so the same code
// runs in the doctor tool (mods API) and in the sdd-check GitHub Action (node:fs).
import { flowRefs, needs, parseCapabilities } from './check.ts'
import type { FeatureFiles, Mode, Snapshot } from './check.ts'
import { WORKFLOW_PATH } from './formats.ts'

export type Io = {
  read(path: string): Promise<string | null> // null: absent or unreadable
  exists(path: string): Promise<boolean>
  list(dir: string): Promise<{ name: string; dir: boolean }[]> // [] when the directory is absent
  run(argv: string[]): Promise<{ exitCode: number; stdout: string } | null> // null: could not start
}
export type GatherOptions = { mode?: Mode; offline?: boolean }

async function readFeatures(io: Io): Promise<FeatureFiles[]> {
  const out: FeatureFiles[] = []
  for (const entry of await io.list('specs')) {
    if (!entry.dir) continue
    const base = 'specs/' + entry.name + '/'
    const [spec, plan, tasks, review] = await Promise.all(['spec', 'plan', 'tasks', 'review'].map((n) => io.read(base + n + '.md')))
    if (spec === null && plan === null && tasks === null && review === null) continue
    out.push({ slug: entry.name, spec, plan, tasks, review })
  }
  return out
}

async function toolResolves(io: Io, exe: string, dir: string | null): Promise<boolean> {
  const bases = [dir ?? '.', '.']
  if (exe.includes('/')) {
    for (const b of bases) if (await io.exists(b === '.' ? exe : b + '/' + exe)) return true
    return false
  }
  const found = await io.run(['which', exe])
  if (found && found.exitCode === 0) return true
  for (const b of bases) if (await io.exists((b === '.' ? '' : b + '/') + 'node_modules/.bin/' + exe)) return true
  return false
}

// Plugins installed for this user: name -> install path, read from ~/.claude/plugins/installed_plugins.json.
// null when the registry cannot be read (then plugin-provided skills and agents are not judged).
async function installedPlugins(io: Io, home: string): Promise<{ name: string; path: string }[] | null> {
  const text = await io.read(home + '/.claude/plugins/installed_plugins.json')
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
    const manifest = await io.read(path + '/.claude-plugin/plugin.json')
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
async function flowResolves(io: Io, kind: 'skill' | 'agent', name: string, home: string, plugins: { name: string; path: string }[] | null): Promise<boolean | null> {
  if (!home) return null
  const [prefix, local] = name.includes(':') ? [name.slice(0, name.indexOf(':')), name.slice(name.indexOf(':') + 1)] : [null, name]
  const file = (base: string) => (kind === 'skill' ? base + '/skills/' + local + '/SKILL.md' : base + '/agents/' + local + '.md')
  const bases: string[] = []
  if (prefix === null) bases.push('.claude', home + '/.claude')
  for (const p of plugins ?? []) if (prefix === null || p.name === prefix) bases.push(p.path)
  for (const b of bases) if (await io.exists(file(b))) return true
  return plugins === null ? null : false
}

export async function gather(io: Io, options: GatherOptions = {}): Promise<Snapshot> {
  const mode: Mode = options.mode ?? 'session'
  const offline = options.offline === true
  const constitution = await io.read('specs/constitution.md')
  const template = await io.read('specs/template.md')
  const capabilities = await io.read('specs/capabilities.md')
  const legacy: string[] = []
  for (const p of ['specs/_constitution.md', 'specs/_template.md', '.claude/capabilities.md']) if (await io.exists(p)) legacy.push(p)

  const base: Snapshot = {
    mode,
    workflow: await io.read(WORKFLOW_PATH),
    constitution,
    template,
    capabilities,
    legacy,
    features: await readFeatures(io),
    settings: await io.read('.claude/settings.json'),
    git: { isRepo: true, clean: null, gh: null, ghAuth: null },
    paths: {},
    tools: {},
    flows: {},
  }
  if (mode === 'ci') return base // git, tools, sibling repos and installed skills are not judged in CI

  const isRepo = await io.exists('.git')
  let clean: boolean | null = null
  if (isRepo) {
    const st = await io.run(['git', 'status', '--porcelain'])
    clean = st ? st.exitCode === 0 && st.stdout.trim() === '' : null
  }
  let gh: boolean | null = null
  let ghAuth: boolean | null = null
  if (!offline) {
    const found = await io.run(['which', 'gh'])
    gh = found !== null && found.exitCode === 0
    if (gh) {
      const auth = await io.run(['gh', 'auth', 'status'])
      ghAuth = auth !== null && auth.exitCode === 0
    }
  }

  const wanted = needs(constitution, capabilities)
  for (const p of wanted.paths) base.paths[p] = await io.exists(p)
  for (const t of wanted.tools) base.tools[t.key] = await toolResolves(io, t.exe, t.dir)

  if (capabilities) {
    const refs = flowRefs(parseCapabilities(capabilities)).filter((r) => r.kind !== 'command')
    if (refs.length > 0) {
      const home = (await io.run(['sh', '-c', 'printf %s "$HOME"']))?.stdout.trim() ?? ''
      const plugins = home ? await installedPlugins(io, home) : null
      for (const r of refs) {
        const key = r.kind + ':' + r.name
        if (!(key in base.flows)) base.flows[key] = await flowResolves(io, r.kind as 'skill' | 'agent', r.name, home, plugins)
      }
    }
  }
  base.git = { isRepo, clean, gh, ghAuth }
  return base
}
