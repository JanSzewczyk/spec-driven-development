import { loadCapabilities } from '../../core/capabilities.ts'
import { effectiveConfig } from '../../core/config.ts'
import type { Config } from '../../core/config.ts'
import { FEATURE_DOCS, featurePath, readFeatures } from '../../core/features.ts'
import type { FeatureDoc } from '../../core/features.ts'
import { CAPABILITIES_PATH, LEGACY_CAPABILITIES_PATH } from '../../core/formats.ts'
import type { Io } from '../../core/io.ts'
import { hasTaskTrailer, mergeState, prList, taskBranchBase, taskPrs, worktreeOf } from '../../core/merges.ts'
import type { MergeState, PrInfo, PrState } from '../../core/merges.ts'
import { ioOf } from '../io.ts'
import { emptyLive, isActive, lanesOf, onCommand, onReport, onSpawn, onTool, onTurnComplete, onTurnStart, prune, toolDetail } from './live.ts'
import type { Commit, Live } from './live.ts'
import { currentSlug, freshness, implFlow, reviewFlow, sessionOf, sortFeatures, featureFrom } from './model.ts'
import type { Feature } from './model.ts'
import { renderConfig, renderDoc, renderPane } from './view.ts'
import type { Tab } from './view.ts'

const PANE = 'sdd-board'
const DOC_PANE = 'sdd-board-doc'
const CONFIG_PANE = 'sdd-board-config'
const TITLE = 'Spec-driven Development by Szum-Tech'
const PR_TTL = 60_000 // GitHub is asked about a spec branch's task PRs at most once a minute
const GH_BACKOFF = 600_000 // after gh fails (missing, signed out, offline), wait 10 minutes
// Commands after which statuses, merges or the branch may have changed: scan at once, ask GitHub too.
const REFRESH_COMMAND = /git\s+(checkout|switch|branch|merge|pull|rebase|reset|worktree)\b|gh\s+pr\s+(merge|create|edit|close|reopen)\b/

// Module state: disposable, rebuilt from disk on every load.
let features: Feature[] = []
let hasSpecs = false
let hasScanned = false // a scan finished since this module loaded: until then the panel cannot say specs/ is missing
let branch = ''
let source: string | null = null // spec branch whose checkout specs/ is read from, when not this one
let specsRoot: string | null = null // the checkout specs/ is read from: the project root, or the spec branch's
let startRoot: string | null = null // the session's directory at start, when $.session.root() cannot answer
let mainTurns: string[] = [] // ids of the main loop's turns that started and have not ended
let signature = ''
let tab: Tab = 'current'
let ticketShownFor: string | null = null // the task branch whose session already opened on its Ticket tab
let pinned: string | null = null
let filter = 'all'
let running: string | null = null
let config: Config | null = null
let cmdOpen: string[] | null = null
let docView: { slug: string; kind: string } | null = null
let isClosedByUser = false
let isPolling = false
let isScanning = false
let isForcePending = false
let updatedAt: number | null = null // last successful scan
let checkedAt: number | null = null // last answer from GitHub
let drawnFreshness = ''
let ghRetryAt = 0
let live: Live = emptyLive()
let openKeys: string[] = [] // expanded lanes and task rows

// One task row open at a time; lanes open independently.
function toggled(keys: string[], key: string): string[] {
  if (keys.includes(key)) return keys.filter((k) => k !== key)
  return [...(key.startsWith('task-') ? keys.filter((k) => !k.startsWith('task-')) : keys), key]
}
let taskFilter = 'all'
let commits: Record<string, Commit> = {} // last commit of each running task branch, by task id
const prCache = new Map<string, { at: number; prs: Map<number, PrInfo> }>()

async function now($: any): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

// Polls specs/ every 4 s, started once the panel is drawn: a session that never shows it does not poll.
// It also redraws when the "Updated …" line would read differently, so staleness shows.
function startPolling($: any): void {
  if (isPolling) return
  isPolling = true
  $.clock.every(4000, async () => {
    const isChanged = await scan($)
    // While something runs, the timers of the live strip move: redraw on every tick.
    if (isChanged || isActive(live) || freshness(updatedAt, checkedAt, await now($)) !== drawnFreshness) $.ui.invalidate('ui.render')
  })
}

// The project root, where specs/ lives. Never the shell's directory: a `cd apps/web` in a Bash call moves
// the session's working directory, and relative reads there find no specs/ (the panel flipped to the
// "not set up" card until Claude went back). $.session.root() follows /cd and worktree moves only.
async function rootOf($: any): Promise<string | null> {
  try {
    const r = await $.session.root()
    if (typeof r === 'string' && r) return r
  } catch {
    // older engines: the directory the session started in
  }
  return startRoot
}

async function modifiedOf($: any, path: string): Promise<number> {
  try {
    const s: any = await $.fs.stat(specsRoot ? specsRoot + '/' + path : path)
    const m = s?.mtimeMs ?? s?.modifiedMs ?? s?.mtime ?? s?.modified ?? 0
    return typeof m === 'number' ? m : Date.parse(String(m)) || 0
  } catch {
    return 0
  }
}

// Runs a slash command in this session as if the user typed it (prompt.submit refuses text that
// starts with "/"). If the command cannot run (unknown name, session stopped), leave it in the
// prompt box instead so the user can send it.
async function runCommand($: any, command: string, args: string): Promise<void> {
  try {
    const r = await $.command.run({ command, args })
    if (r && (r.deny || r.drop)) throw new Error('refused')
  } catch {
    try {
      await $.prompt.fill({ text: '/' + command + (args ? ' ' + args : '') })
    } catch {
      // nothing else to try
    }
  }
}

// The state and link of the pull requests into `base`, from a cache of PR_TTL; null when GitHub cannot be
// asked. Asked only while the panel is drawn, one `gh pr list` per spec branch.
async function prListOf(io: Io, base: string, isForced: boolean, at: number): Promise<Map<number, PrInfo> | null> {
  const cached = prCache.get(base)
  if (!isPolling) return cached?.prs ?? null
  if (cached && !isForced && at - cached.at < PR_TTL) return cached.prs
  if (at < ghRetryAt) return cached?.prs ?? null
  const r = await io.run(['gh', 'pr', 'list', '--base', base, '--state', 'all', '--limit', '100', '--json', 'number,state,url'])
  let prs: Map<number, PrInfo> | null = null
  try {
    if (r && r.exitCode === 0) prs = prList(r.stdout)
  } catch {
    // not the JSON we asked for
  }
  if (prs === null) {
    ghRetryAt = at + GH_BACKOFF
    return cached?.prs ?? null
  }
  prCache.set(base, { at, prs })
  checkedAt = at
  return prs
}

// Isolated tasks that reached the SDD branch before Reconcile recorded them: `pr:` tasks from GitHub,
// `branch:` tasks from git (the branch landed on the SDD branch), run in the checkout specs/ is read from.
async function mergesOf(io: Io, f: Feature, prs: Map<number, PrInfo> | null): Promise<Record<string, MergeState> | undefined> {
  const base = f.spec.branch
  const open = (f.tasks ?? []).filter((t) => t.status !== 'review' && t.status !== 'done' && (t.pr || t.branch))
  if (!base || open.length === 0) return undefined
  const states: Map<number, PrState> | null = prs === null ? null : new Map([...prs].map(([n, p]) => [n, p.state]))
  const out: Record<string, MergeState> = {}
  for (const t of open) {
    let landed: boolean | null = null
    if (!t.pr) {
      const r = await io.run(['git', 'merge-base', '--is-ancestor', t.branch, base])
      landed = r === null ? null : r.exitCode === 0 ? true : r.exitCode === 1 ? false : null
      if (landed === true) {
        const tip = await io.run(['git', 'log', '-1', '--format=%B', t.branch])
        landed = tip === null || tip.exitCode !== 0 ? null : hasTaskTrailer(String(tip.stdout), f.epic ? f.epic + '-' + t.id : t.id)
      }
    }
    const m = mergeState(t, states, landed)
    if (m !== null) out[t.id] = m
  }
  return Object.keys(out).length ? out : undefined
}

// The last commit of each task branch still running (in-progress, not merged), for the live strip.
async function commitsOf(io: Io, f: Feature | null): Promise<Record<string, Commit>> {
  const out: Record<string, Commit> = {}
  const running = (f?.tasks ?? []).filter((t) => t.status === 'in-progress' && t.branch).slice(0, 8)
  for (const t of running) {
    const r = await io.run(['git', 'log', '-1', '--format=%ct%x09%s', t.branch])
    const m = r && r.exitCode === 0 ? /^(\d+)\t(.*)$/.exec(String(r.stdout).trim()) : null
    if (m) out[t.id] = { at: Number(m[1]) * 1000, subject: m[2] }
  }
  return out
}

// Reads specs/ and rebuilds the feature list. Returns true when anything changed. A scan that fails
// part-way (a read refused or timing out while a skill is running) changes nothing: the panel keeps
// showing the last good data instead of falling back to the "not set up" card. One scan at a time:
// a forced one that finds another running is done by the next poll.
async function scan($: any, isForced = false): Promise<boolean> {
  if (isScanning) {
    if (isForced) isForcePending = true
    return false
  }
  isScanning = true
  try {
    const force = isForced || isForcePending
    isForcePending = false
    return await scanOnce($, force)
  } finally {
    isScanning = false
  }
}

async function scanOnce($: any, isForced: boolean): Promise<boolean> {
  const home = await rootOf($)
  const inHome = home ? { cwd: home } : undefined
  let next = branch
  try {
    const r = await $.process.run(['git', 'branch', '--show-current'], inHome)
    if (r.exitCode === 0) next = String(r.stdout).trim()
  } catch {
    // not a git repo: keep the branch we had
  }
  // In a task worktree (<spec-branch>--<EPIC>-T<n>) the statuses live in the checkout of the spec
  // branch, where the orchestrating session writes tasks.md: read specs/ there, not this snapshot.
  let root: string | null = null
  const base = taskBranchBase(next)
  if (base) {
    try {
      const r = await $.process.run(['git', 'worktree', 'list', '--porcelain'], inHome)
      if (r.exitCode === 0) root = worktreeOf(String(r.stdout), base)
    } catch {
      // read this checkout
    }
  }
  specsRoot = root ?? home
  const found: Feature[] = []
  let any: boolean
  let cfg: Config | null = null
  const io = ioOf($, { strict: true, root: specsRoot ?? undefined })
  const at = await now($)
  try {
    any = await io.exists('specs')
    if (any) {
      for (const files of await readFeatures(io)) {
        if (files.spec === null) continue // the board shows a feature once it has a spec
        let modified = 0
        for (const doc of FEATURE_DOCS) modified = Math.max(modified, await modifiedOf($, featurePath(files.slug, doc)))
        found.push(featureFrom({ ...files, spec: files.spec }, modified))
      }
      const yml = await io.read(CAPABILITIES_PATH)
      const caps = loadCapabilities(yml, yml === null ? await io.read(LEGACY_CAPABILITIES_PATH) : null)
      if (caps !== null) cfg = effectiveConfig(caps, await io.read('specs/constitution.md'))
    }
  } catch {
    return false
  }
  for (const f of found) {
    // Every task PR, recorded ones too, so an expanded row can link it and say whether it merged.
    const withPr = (f.tasks ?? []).some((t) => t.pr)
    const prs = withPr && f.spec.branch ? await prListOf(io, f.spec.branch, isForced, at) : null
    const merges = await mergesOf(io, f, prs)
    if (merges) f.merges = merges
    if (withPr) f.prs = taskPrs(f.tasks ?? [], prs)
    if (f.tasks !== null) {
      const r = await io.run(['git', 'log', '-1', '--format=%H', '--', 'specs/' + f.slug + '/tasks.md'])
      if (r && r.exitCode === 0) f.tasksCommitted = String(r.stdout).trim() !== ''
      const flow = implFlow(cfg)
      if (flow) f.flow = flow
    }
  }
  const shown = found.find((f) => f.slug === currentSlug(found, next, pinned)) ?? null
  const rflow = reviewFlow(cfg)
  if (shown && rflow) shown.reviewFlow = rflow
  // How old the review's verdict is: when review.md was written, and the commits made after it.
  if (shown && shown.review !== null) {
    const written = await modifiedOf($, featurePath(shown.slug, 'review'))
    if (written) {
      shown.reviewAt = written
      const r = await io.run(['git', 'rev-list', '--count', '--since=' + new Date(written).toISOString(), 'HEAD'])
      if (r && r.exitCode === 0) shown.reviewCommits = Number(String(r.stdout).trim()) || 0
    }
  }
  const last = await commitsOf(io, shown)
  const sig = JSON.stringify([any, next, root, found, cfg, last])
  const isChanged = sig !== signature
  signature = sig
  hasSpecs = any
  hasScanned = true
  branch = next
  source = root === null ? null : base
  features = found
  config = cfg
  commits = last
  updatedAt = at
  return isChanged
}

// The board's part of session start, called from the one session.start hook in ../register.ts (a
// hooks module may register an event once without a matcher). `isAutoOpen` is the show_board option:
// it opens the panel when the project has specs/; /sdd-dashboard opens it either way.
export async function startBoard($: any, isAutoOpen: boolean): Promise<void> {
  isPolling = false
  mainTurns = []
  try {
    startRoot = String(await $.session.cwd())
  } catch {
    startRoot = null
  }
  try {
    const saved = await $.store.get('prefs')
    if (saved && typeof saved === 'object') {
      if (saved.tab === 'all' || saved.tab === 'current') tab = saved.tab
      if (typeof saved.filter === 'string') filter = saved.filter
    }
    await scan($)
  } catch (error) {
    $.ui.log('sdd board: first scan failed: ' + String(error), { to: 'debug' })
  }
  try {
    await $.command.register({ name: 'sdd-dashboard', description: 'Open the SDD side panel', immediate: true })
  } catch (error) {
    $.ui.log('sdd board: could not register /sdd-dashboard: ' + String(error))
  }
  if (isAutoOpen && hasSpecs && !isClosedByUser) {
    try {
      const placed = await $.ui.open({ id: PANE, title: TITLE, columns: 48 })
      if (!placed.isPlaced) $.ui.toast('SDD panel ready: type /sdd-dashboard')
    } catch {
      // the panel can be opened with /sdd-dashboard
    }
  }
}

// The board's other hooks, registered from ../register.ts.
export function registerBoard(on) {
  on('command.run', { command: 'sdd-dashboard' }, async ($) => {
    isClosedByUser = false
    await scan($, true)
    await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true, columns: 48 })
    return {}
  })

  // A /sdd:* command expanded: show it as running until the turn ends.
  on('skill.prompt', async ($, e, next) => {
    if (e.pluginName === 'sdd') {
      running = '/sdd:' + String(e.skill).replace(/^sdd:/, '')
      live = onCommand(live, running)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // The live strip: the main loop's turn, its tool calls and its subagents.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      // A main-loop turn that starts while another runs (an engine fork) does not replace the running one.
      if (mainTurns.length === 0) {
        live = onTurnStart(live, e.turnId, await now($), String(e.text ?? ''))
        running = live.command
      }
      mainTurns = [...mainTurns.filter((id) => id !== e.turnId), e.turnId]
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    try {
      live = onTool(live, String(e.tool), toolDetail(e as Record<string, unknown>), e.agentId, await now($))
      $.ui.invalidate('ui.render')
    } catch {
      // the strip misses one step
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result && result.agentId) {
      const at = await now($)
      live = onSpawn({ ...live, agents: prune(live.agents, at) }, result.agentId, String(e.subagentType || 'agent'), String(e.description || ''), at, e.background === true)
      $.ui.invalidate('ui.render')
    }
    return result
  })


  // Claude wrote a spec artifact: refresh right away instead of waiting for the poll.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const result = await next(e)
    try {
      // Sub-agents too: the scan reads this session's checkout (or the spec branch's), never the agent's cwd.
      if (typeof e.file_path === 'string' && e.file_path.includes('/specs/')) {
        if (await scan($)) $.ui.invalidate('ui.render')
      }
    } catch {
      // the poll will catch up
    }
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    try {
      if (REFRESH_COMMAND.test(String(e.command)) && (await scan($, true))) $.ui.invalidate('ui.render')
    } catch {
      // the poll will catch up
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's loop ends with its own turn.complete: its lane stops.
    if (e.agentId !== undefined) {
      live = onReport(live, e.agentId, e.reason === 'answer' ? 'completed' : e.reason === 'aborted' ? 'stopped' : 'failed', await now($))
      $.ui.invalidate('ui.render')
    }
    // The main loop's turn ends when every turn it heard start has ended: the end of an overlapping turn
    // does not stop the running command. An end whose start was not heard ends what runs.
    const isOwn = mainTurns.includes(e.turnId)
    if (e.agentId === undefined) mainTurns = mainTurns.filter((id) => id !== e.turnId)
    if (e.agentId === undefined && (!isOwn || mainTurns.length === 0)) {
      mainTurns = []
      running = null
      live = onTurnComplete(live, await now($), String(e.reason))
      try {
        await scan($, true)
      } catch {
        // keep the last data
      }
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // A task row on Desktop (board/task-row.ts) posts { toggle: <task id> } when pressed anywhere on it.
  on('ui.message', async ($, e, next) => {
    const id = (e.data as { toggle?: unknown } | null)?.toggle
    if (e.module.endsWith('task-row.ts') && typeof id === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(id)) {
      openKeys = toggled(openKeys, 'task-' + id)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin && e.origin.kind === 'person') isClosedByUser = true
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId === DOC_PANE) {
      const el = $.ui.resolve(e)
      const view = docView
      const text = view ? await ioOf($, { root: specsRoot ?? undefined }).read(featurePath(view.slug, view.kind as FeatureDoc)) : null
      return renderDoc(el, { slug: view ? view.slug : '', kind: view ? view.kind : '', text })
    }
    if (e.requestId === CONFIG_PANE) {
      if (cmdOpen === null && config && config.commands.length) cmdOpen = [config.commands[0].project]
      return renderConfig($.ui.resolve(e), {
        surface: e.surface,
        cols: e.props.bodyColumns ?? 64,
        config,
        open: cmdOpen ?? [],
        actions: {
          toggle: (project) => {
            const cur = cmdOpen ?? []
            cmdOpen = cur.includes(project) ? cur.filter((p) => p !== project) : [...cur, project]
            $.ui.invalidate('ui.render')
          },
          run: (command, args) => {
            runCommand($, command, args)
          },
        },
      })
    }
    if (e.requestId !== PANE) return next(e)
    startPolling($)
    const el = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    const sorted = sortFeatures(features, currentSlug(features, branch, pinned))
    const slug = currentSlug(features, branch, pinned)
    const current = features.find((f) => f.slug === slug) ?? null
    const at = await now($)
    drawnFreshness = freshness(updatedAt, checkedAt, at)
    const session = sessionOf(current, branch)
    // A task session opens on its Ticket tab once; after that the person's choice stands.
    if (session.kind === 'task' && ticketShownFor !== branch) {
      ticketShownFor = branch
      tab = 'ticket'
    }
    const lanes = lanesOf(live, current?.tasks ?? null, current?.epic ?? '', current?.merges, commits, session.kind === 'task' ? session.taskId : null)
    const actions = {
      tab: (t) => {
        tab = t
        redraw()
        if (t !== 'ticket') $.store.set('prefs', { tab, filter })
      },
      toggle: (key) => {
        openKeys = toggled(openKeys, key)
        redraw()
      },
      taskFilter: (v) => {
        taskFilter = v
        redraw()
      },
      fill: (text) => {
        $.prompt.fill({ text })
      },
      run: (command, args) => {
        runCommand($, command, args) // not awaited: it resolves when the command finishes
      },
      pin: (s) => {
        pinned = s
        tab = 'current'
        redraw()
      },
      doc: async (kind) => {
        if (!current) return
        docView = { slug: current.slug, kind }
        let placed: any = null
        try {
          placed = await $.ui.open({ id: DOC_PANE, title: kind + ' · ' + current.slug, focus: true, closeOnEscape: true, columns: 80 })
        } catch {
          // reported below
        }
        if (!placed || !placed.isPlaced) $.ui.toast('No room for the document: widen the window and try again')
        $.ui.invalidate('ui.render')
      },
      config: async () => {
        let placed: any = null
        try {
          placed = await $.ui.open({ id: CONFIG_PANE, title: 'SDD configuration', focus: true, closeOnEscape: true, columns: 64 })
        } catch {
          // reported below
        }
        if (!placed || !placed.isPlaced) $.ui.toast('No room for the configuration: widen the window and try again')
        $.ui.invalidate('ui.render')
      },
      filter: (v) => {
        filter = v
        redraw()
        $.store.set('prefs', { tab, filter })
      },
    }
    return renderPane(el, {
      surface: e.surface,
      cols: e.props.bodyColumns ?? 48,
      tab,
      features: sorted,
      current,
      branch,
      running,
      filter,
      hasSpecs,
      isLoading: !hasScanned,
      now: at,
      freshness: drawnFreshness,
      source,
      session,
      live,
      lanes,
      open: openKeys,
      taskFilter,
      actions,
    })
  })
}
