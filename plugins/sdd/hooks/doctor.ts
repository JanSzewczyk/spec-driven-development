// The `doctor_check` tool (seen by Claude as mcp__sdd__doctor_check): it gathers the facts about the
// project in the session's working directory and hands them to the pure rules in core/check.ts.
// /sdd:doctor check renders the result.
import { runChecks } from '../core/check.ts'
import { gather } from '../core/gather.ts'
import { ioOf } from './io.ts'

const TOOL = 'mcp__sdd__doctor_check'

// The doctor's part of session start, called from the one session.start hook in ./register.ts.
export async function startDoctor($: any): Promise<void> {
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
}

export function registerDoctor(on) {
  on('tool.call', { tool: TOOL }, async ($, e) => {
    try {
      const report = runChecks(await gather(ioOf($), { mode: 'session', offline: e.offline === true }))
      return { result: JSON.stringify(report) }
    } catch (error) {
      return { result: JSON.stringify({ error: String(error) }) }
    }
  })
}
