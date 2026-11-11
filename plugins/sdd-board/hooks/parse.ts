// Pure parsers for the artifacts the sdd plugin writes under specs/<slug>/.
// No mods API in here: everything takes already-read text.

export type Task = { id: string; title: string; type: string; agent: string; model: string; status: string }
export type Story = { id: string; name: string; tasks: Task[] }
export type SpecInfo = {
  title: string
  branch: string
  status: string
  type: string
  owner: string
  created: string
  acTotal: number
  acDone: number
  openQuestions: number
}

function header(text: string, name: string): string {
  const m = text.match(new RegExp('^\\*\\*' + name + ':\\*\\*\\s*([^\\s<][^<]*?)\\s*(?:<!--.*)?$', 'm'))
  return m ? m[1].trim() : ''
}

function section(text: string, title: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  let inside = false
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      inside = line.toLowerCase().includes(title.toLowerCase())
      continue
    }
    if (inside) out.push(line)
  }
  return out
}

export function parseSpec(text: string): SpecInfo {
  const title = (text.match(/^#\s*Feature:\s*(.+)$/m)?.[1] ?? '').trim()
  const ac = section(text, 'Acceptance criteria').filter((l) => /^- \[[ xX]\]/.test(l))
  const open = section(text, 'Open questions').filter((l) => {
    const t = l.trim()
    if (!t.startsWith('- ')) return false
    if (/^-\s*(\?|\.\.\.)?\s*$/.test(t)) return false
    return !/^-\s*\[[xX]\]/.test(t)
  })
  return {
    title,
    branch: header(text, 'Branch'),
    status: header(text, 'Status').split(/\s/)[0],
    type: header(text, 'Type').split(/\s/)[0],
    owner: header(text, 'Owner'),
    created: header(text, 'Created'),
    acTotal: ac.length,
    acDone: ac.filter((l) => /^- \[[xX]\]/.test(l)).length,
    openQuestions: open.length,
  }
}

export function parsePlanStatus(text: string): string {
  return header(text, 'Status').split(/\s/)[0]
}

export function parseTasks(text: string): Story[] {
  const stories: Story[] = []
  let story: Story | null = null
  let task: Task | null = null
  for (const raw of text.split('\n')) {
    const s = raw.match(/^###\s+Story\s+(S\d+)\s*[:\-–]?\s*(.*)$/i)
    if (s) {
      story = { id: s[1].toUpperCase(), name: s[2].trim(), tasks: [] }
      stories.push(story)
      task = null
      continue
    }
    if (!story) continue
    const id = raw.match(/^-\s+id:\s*(\S+)/)
    if (id) {
      task = { id: id[1], title: '', type: '', agent: '', model: '', status: 'draft' }
      story.tasks.push(task)
      continue
    }
    if (!task) continue
    const f = raw.match(/^\s{2,}(title|type|agent|model|status):\s*(.*)$/)
    if (f) (task as Record<string, string>)[f[1]] = f[2].trim().replace(/^["']|["']$/g, '')
  }
  return stories
}

export function parseReview(text: string): 'GO' | 'NO-GO' | null {
  if (/NO[-\s]?GO/i.test(text)) return 'NO-GO'
  if (/\bGO\b/.test(text)) return 'GO'
  return null
}
