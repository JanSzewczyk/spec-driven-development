// What runs now in this session, built from hook events (skill.prompt, turn.start, tool.call,
// agent.spawn, turn.complete; a subagent's turn.complete carries its agentId). Pure: board/register.ts feeds the events in.

export type Step = { tool: string; detail: string; at: number }
export type AgentStatus = 'working' | 'completed' | 'failed' | 'stopped'
export type AgentRun = { id: string; type: string; description: string; since: number; endedAt?: number; status: AgentStatus; steps: Step[]; isBackground?: boolean }
export type Live = {
  command: string | null // the /sdd:* command this turn runs
  waiting: string | null // a phase command whose turn ended with an answer: it waits for the person's reply
  turn: { id: string; since: number } | null // the main loop's running turn
  tool: Step | null // the main loop's latest tool call
  agents: AgentRun[] // subagents of this session, finished ones kept for the time axis
  lastTurnEnd: number | null
}

export const WINDOW_MS = 15 * 60_000 // the time axis of the live strip
const STEPS_KEPT = 5

export function emptyLive(): Live {
  return { command: null, waiting: null, turn: null, tool: null, agents: [], lastTurnEnd: null }
}

export function isActive(live: Live): boolean {
  return live.turn !== null || live.agents.some((a) => a.status === 'working')
}

// One line saying what a tool call does: the command, the file, the pattern.
export function toolDetail(e: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const path = str(e.file_path) || str(e.notebook_path) || str(e.path)
  const first = (s: string) => s.split('\n')[0].trim()
  if (str(e.command)) return first(str(e.command))
  if (path) return path.replace(/^.*?\/((?:specs|apps|packages|src|plugins|lib|tests?)\/)/, '$1')
  if (str(e.pattern)) return str(e.pattern)
  if (str(e.description)) return first(str(e.description))
  if (str(e.skill)) return str(e.skill)
  if (str(e.url)) return str(e.url)
  if (str(e.query)) return str(e.query)
  return ''
}

export function onCommand(live: Live, command: string): Live {
  return { ...live, command, waiting: null }
}

// A turn that starts with the person's reply or a continuation (no slash command) goes on with the
// command that waited for it; a new slash command ends the wait.
export function onTurnStart(live: Live, id: string, at: number, text = ''): Live {
  const resumed = live.waiting !== null && !text.trimStart().startsWith('/') ? live.waiting : null
  return { ...live, command: live.command ?? resumed, waiting: null, turn: { id, since: at }, tool: null }
}

// The phase commands that ask the person something mid-way (questions, the plan approval) and end their
// turn there; the phase they write is still open until they finish.
const ASKING = /^\/sdd:(clarify|plan|tasks)\b/

// A tool call of the main loop, or of a subagent (`agentId`), which goes to that agent's lane.
export function onTool(live: Live, tool: string, detail: string, agentId: string | undefined, at: number): Live {
  const step = { tool, detail, at }
  if (agentId !== undefined) {
    const known = live.agents.some((a) => a.id === agentId)
    if (!known) return live
    return { ...live, agents: live.agents.map((a) => (a.id === agentId ? { ...a, steps: [...a.steps, step].slice(-STEPS_KEPT) } : a)) }
  }
  return { ...live, tool: step }
}

export function onSpawn(live: Live, id: string, type: string, description: string, at: number, isBackground = false): Live {
  const run: AgentRun = { id, type, description, since: at, status: 'working', steps: [], isBackground }
  return { ...live, agents: [...live.agents.filter((a) => a.id !== id), run] }
}

export function onReport(live: Live, id: string, status: Exclude<AgentStatus, 'working'>, at: number): Live {
  return { ...live, agents: live.agents.map((a) => (a.id === id ? { ...a, status, endedAt: at } : a)) }
}

// The main turn ended. Foreground agents still marked working ended with it; background agents keep
// running until their own turn.complete. Finished ones stay on the axis until they leave its window.
// A phase command whose turn ended with an answer waits for the reply; the board shows it only while its
// phase is still the open one (view.ts).
export function onTurnComplete(live: Live, at: number, reason: string = 'answer'): Live {
  const agents = live.agents.map((a) => (a.status === 'working' && !a.isBackground ? { ...a, status: 'stopped' as const, endedAt: at } : a))
  const waiting = reason === 'answer' && live.command && ASKING.test(live.command) ? live.command : null
  return { command: null, waiting, turn: null, tool: null, agents: prune(agents, at), lastTurnEnd: at }
}

export function prune(agents: AgentRun[], at: number): AgentRun[] {
  return agents.filter((a) => a.status === 'working' || at - (a.endedAt ?? at) < WINDOW_MS)
}

// One row of the live strip: a subagent of this session, a task running in its own worktree, or a
// task pull request waiting for its merge. `since` is known only for what this session saw start.
export type LaneState = 'working' | 'waiting' | 'done' | 'failed'
export type Lane = {
  key: string
  kind: 'agent' | 'task' | 'pr'
  label: string // 'ULOG-T3', 'Explore'
  title: string
  who: string // 'agent:Explore', 'PR #52', the task branch
  where: string
  state: LaneState
  since?: number
  endedAt?: number
  steps: Step[]
  source: string // where the board read it from
  taskId?: string // links the lane to its task row
}

export type TaskRef = { id: string; title: string; status: string; branch: string; pr: string }
export type Commit = { at: number; subject: string }

export function lanesOf(live: Live, tasks: TaskRef[] | null, epic: string, merges: Record<string, string> | undefined, commits: Record<string, Commit>, ownTask: string | null): Lane[] {
  const lanes: Lane[] = []
  const full = (id: string) => (epic ? epic + '-' + id : id)
  for (const t of tasks ?? []) {
    if (t.status === 'review' || t.status === 'done' || t.id === ownTask) continue
    const m = merges?.[t.id]
    const c = commits[t.id]
    const steps: Step[] = c ? [{ tool: 'commit', detail: c.subject, at: c.at }] : []
    if (t.pr) {
      const state: LaneState = m === 'merged' ? 'done' : m === 'closed' ? 'failed' : 'waiting'
      const where = m === 'merged' ? 'merged, not recorded in tasks.md yet' : m === 'closed' ? 'closed without merging' : 'open, waiting for a merge'
      lanes.push({ key: 'lane-' + t.id, kind: 'pr', label: full(t.id), title: t.title, who: 'PR ' + t.pr, where, state, steps, source: 'gh pr list, at most once a minute', taskId: t.id })
    } else if (t.status === 'in-progress' && t.branch) {
      const state: LaneState = m === 'merged' ? 'done' : 'working'
      lanes.push({ key: 'lane-' + t.id, kind: 'task', label: full(t.id), title: t.title, who: t.branch, where: m === 'merged' ? 'merged, not recorded in tasks.md yet' : 'own session and worktree', state, steps, source: 'tasks.md and git log of the task branch', taskId: t.id })
    }
  }
  for (const a of live.agents) {
    const state: LaneState = a.status === 'working' ? 'working' : a.status === 'completed' ? 'done' : 'failed'
    lanes.push({ key: 'lane-' + a.id, kind: 'agent', label: a.type.replace(/^.*:/, ''), title: a.description || a.type, who: 'agent:' + a.type, where: a.status === 'working' ? 'subagent of this session' : 'subagent, ' + a.status, state, since: a.since, endedAt: a.endedAt, steps: a.steps, source: 'agent.spawn, tool.call, agent.report' })
  }
  return lanes
}
