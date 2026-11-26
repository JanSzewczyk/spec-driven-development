// The sdd mod. A plugin has one hooks module, so this file registers both halves:
// - the `doctor_check` tool (seen by Claude as mcp__sdd__doctor_check): it gathers the facts about the
//   project in the session's working directory and hands them to the pure rules in core/check.ts;
//   /sdd:doctor check renders the result;
// - the board (board/register.ts): the side panel and /sdd-dashboard.
import { registerBoard, startBoard } from './board/register.ts'
import { runChecks } from './core/check.ts'
import { gather } from './core/gather.ts'
import type { Io } from './core/gather.ts'

const TOOL = 'mcp__sdd__doctor_check'

// The mods API (`$`) behind the `Io` interface that core/gather.ts reads a project through.
function ioOf($: any): Io {
  return {
    async read(path) {
      try {
        if (!(await $.fs.exists(path))) return null
        return String(await $.fs.read(path))
      } catch {
        return null
      }
    },
    async exists(path) {
      try {
        return Boolean(await $.fs.exists(path))
      } catch {
        return false
      }
    },
    async list(dir) {
      try {
        if (!(await $.fs.exists(dir))) return []
        const entries: any[] = await $.fs.list(dir)
        return entries.map((e) => ({ name: String(e.name), dir: e.kind === 'directory' || e.kind === 'dir' }))
      } catch {
        return []
      }
    },
    async run(argv) {
      try {
        const r = await $.process.run(argv)
        return { exitCode: r.exitCode, stdout: String(r.stdout ?? '') }
      } catch {
        return null
      }
    },
  }
}

export function register(on, options: Record<string, unknown> = {}) {
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
    await startBoard($, options.show_board !== false)
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    try {
      const report = runChecks(await gather(ioOf($), { mode: 'session', offline: e.offline === true }))
      return { result: JSON.stringify(report) }
    } catch (error) {
      return { result: JSON.stringify({ error: String(error) }) }
    }
  })

  registerBoard(on)
}
