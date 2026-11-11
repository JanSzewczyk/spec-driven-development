import { parsePlanStatus, parseReview, parseSpec, parseTasks } from './parse.ts'
import { currentSlug, sortFeatures } from './model.ts'
import type { Feature } from './model.ts'
import { renderPane } from './view.ts'

const PANE = 'sdd-board'

// Module state: disposable, rebuilt from disk on every load.
let features: Feature[] = []
let hasSpecs = false
let branch = ''
let signature = ''
let tab: 'current' | 'all' = 'current'
let pinned: string | null = null
let filter = 'all'
let running: string | null = null
let doc: { kind: string; text: string } | null = null
let expanded: Record<string, boolean> = {}
let isClosedByUser = false

async function readText($: any, path: string): Promise<string | null> {
  try {
    if (!(await $.fs.exists(path))) return null
    return String(await $.fs.read(path))
  } catch {
    return null
  }
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

// Reads specs/ and rebuilds the feature list. Returns true when anything changed.
async function scan($: any): Promise<boolean> {
  const found: Feature[] = []
  let any = false
  try {
    any = await $.fs.exists('specs')
    if (any) {
      const entries: any[] = await $.fs.list('specs')
      for (const entry of entries) {
        if (entry.kind !== 'directory' && entry.kind !== 'dir') continue
        const base = 'specs/' + entry.name + '/'
        const spec = await readText($, base + 'spec.md')
        if (spec === null) continue
        const plan = await readText($, base + 'plan.md')
        const tasks = await readText($, base + 'tasks.md')
        const review = await readText($, base + 'review.md')
        let modified = 0
        for (const f of ['spec.md', 'plan.md', 'tasks.md', 'review.md']) modified = Math.max(modified, await modifiedOf($, base + f))
        found.push({
          slug: entry.name,
          spec: parseSpec(spec),
          planStatus: plan === null ? null : parsePlanStatus(plan) || 'draft',
          stories: tasks === null ? null : parseTasks(tasks),
          review: review === null ? null : parseReview(review),
          modified,
        })
      }
    }
  } catch {
    // keep what we have
  }
  let next = branch
  try {
    const r = await $.process.run(['git', 'branch', '--show-current'])
    if (r.exitCode === 0) next = String(r.stdout).trim()
  } catch {
    // not a git repo: keep the branch we had
  }
  const sig = JSON.stringify([any, next, found])
  const isChanged = sig !== signature
  signature = sig
  hasSpecs = any
  branch = next
  features = found
  return isChanged
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      const saved = await $.store.get('prefs')
      if (saved && typeof saved === 'object') {
        if (saved.tab === 'all' || saved.tab === 'current') tab = saved.tab
        if (typeof saved.filter === 'string') filter = saved.filter
      }
      await scan($)
    } catch (error) {
      $.ui.log('sdd-board: first scan failed: ' + String(error), { to: 'debug' })
    }
    try {
      await $.command.register({ name: 'sdd-board', description: 'Open the SDD side panel', immediate: true })
    } catch (error) {
      $.ui.log('sdd-board: could not register /sdd-board: ' + String(error))
    }
    $.clock.every(4000, async () => {
      if (await scan($)) $.ui.invalidate('ui.render')
    })
    if (hasSpecs && !isClosedByUser) {
      try {
        const placed = await $.ui.open({ id: PANE, title: 'SDD', columns: 48 })
        if (!placed.isPlaced) $.ui.toast('SDD panel ready: type /sdd-board')
      } catch {
        // the panel can be opened with /sdd-board
      }
    }
    return next(e)
  })

  on('command.run', { command: 'sdd-board' }, async ($) => {
    isClosedByUser = false
    await scan($)
    await $.ui.open({ id: PANE, title: 'SDD', focus: true, closeOnEscape: true, columns: 48 })
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
      if (/git\s+(checkout|switch|branch)/.test(String(e.command)) && (await scan($))) $.ui.invalidate('ui.render')
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
    if (e.requestId !== PANE) return next(e)
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
      pin: (s) => {
        pinned = s
        tab = 'current'
        doc = null
        redraw()
      },
      toggle: (id) => {
        const open = expanded[id] ?? false
        expanded = { ...expanded, [id]: !open }
        redraw()
      },
      doc: async (kind) => {
        if (kind === null || !current) {
          doc = null
          redraw()
          return
        }
        const text = await $.fs.read('specs/' + current.slug + '/' + kind + '.md')
        doc = { kind, text: String(text) }
        redraw()
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
      expanded,
      doc,
      filter,
      hasSpecs,
      now: Date.now(),
      actions,
    })
  })
}
