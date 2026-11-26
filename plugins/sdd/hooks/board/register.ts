import { loadCapabilities } from '../../core/capabilities.ts'
import { effectiveConfig } from '../../core/config.ts'
import type { Config } from '../../core/config.ts'
import { FEATURE_DOCS, featurePath, readFeatures } from '../../core/features.ts'
import type { FeatureDoc } from '../../core/features.ts'
import { CAPABILITIES_PATH, LEGACY_CAPABILITIES_PATH } from '../../core/formats.ts'
import { ioOf } from '../io.ts'
import { currentSlug, featureFrom, sortFeatures } from './model.ts'
import type { Feature } from './model.ts'
import { renderConfig, renderDoc, renderPane } from './view.ts'

const PANE = 'sdd-board'
const DOC_PANE = 'sdd-board-doc'
const CONFIG_PANE = 'sdd-board-config'
const TITLE = 'Spec-driven Development by Szum-Tech'

// Module state: disposable, rebuilt from disk on every load.
let features: Feature[] = []
let hasSpecs = false
let branch = ''
let signature = ''
let tab: 'current' | 'all' = 'current'
let pinned: string | null = null
let filter = 'all'
let running: string | null = null
let config: Config | null = null
let cmdOpen: string[] | null = null
let docView: { slug: string; kind: string } | null = null
let isClosedByUser = false
let isPolling = false

// Polls specs/ every 4 s, started once the panel is drawn: a session that never shows it does not poll.
function startPolling($: any): void {
  if (isPolling) return
  isPolling = true
  $.clock.every(4000, async () => {
    if (await scan($)) $.ui.invalidate('ui.render')
  })
}

async function modifiedOf($: any, path: string): Promise<number> {
  try {
    const s: any = await $.fs.stat(path)
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

// Reads specs/ and rebuilds the feature list. Returns true when anything changed. A scan that fails
// part-way (a read refused or timing out while a skill is running) changes nothing: the panel keeps
// showing the last good data instead of falling back to the "not set up" card.
async function scan($: any): Promise<boolean> {
  const found: Feature[] = []
  let any: boolean
  let cfg: Config | null = null
  const io = ioOf($, { strict: true })
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
  let next = branch
  try {
    const r = await $.process.run(['git', 'branch', '--show-current'])
    if (r.exitCode === 0) next = String(r.stdout).trim()
  } catch {
    // not a git repo: keep the branch we had
  }
  const sig = JSON.stringify([any, next, found, cfg])
  const isChanged = sig !== signature
  signature = sig
  hasSpecs = any
  branch = next
  features = found
  config = cfg
  return isChanged
}

// The board's part of session start, called from the one session.start hook in ../register.ts (a
// hooks module may register an event once without a matcher). `isAutoOpen` is the show_board option:
// it opens the panel when the project has specs/; /sdd-dashboard opens it either way.
export async function startBoard($: any, isAutoOpen: boolean): Promise<void> {
  isPolling = false
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
    await scan($)
    await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true, columns: 48 })
    return {}
  })

  // A /sdd:* command expanded: show it as running until the turn ends.
  on('skill.prompt', async ($, e, next) => {
    if (e.pluginName === 'sdd') {
      running = '/sdd:' + String(e.skill).replace(/^sdd:/, '')
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Claude wrote a spec artifact: refresh right away instead of waiting for the poll.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const result = await next(e)
    try {
      // A subagent's cwd can differ from the session's, so only the main conversation scans here.
      if (e.agentId === undefined && typeof e.file_path === 'string' && e.file_path.includes('/specs/')) {
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
      if (e.agentId === undefined && /git\s+(checkout|switch|branch)/.test(String(e.command)) && (await scan($))) $.ui.invalidate('ui.render')
    } catch {
      // the poll will catch up
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      running = null
      try {
        await scan($)
      } catch {
        // keep the last data
      }
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
      const text = view ? await ioOf($).read(featurePath(view.slug, view.kind as FeatureDoc)) : null
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
    const actions = {
      tab: (t) => {
        tab = t
        redraw()
        $.store.set('prefs', { tab, filter })
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
      now: Date.now(),
      actions,
    })
  })
}
