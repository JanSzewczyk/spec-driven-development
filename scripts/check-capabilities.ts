// Keeps the capabilities.yml contract in one voice: the values in shared/sdd-core/formats.ts, the
// JSON Schema, the seeded template and the key table in references/capabilities.md must agree.
// Usage: node scripts/check-capabilities.ts   (exit 1 and one line per mismatch)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCapabilities } from '../shared/sdd-core/capabilities.ts'
import {
  ACTION_KEYS,
  CI_VALUES,
  IMPLEMENTATION_DEFAULT,
  ISOLATION_VALUES,
  MERGE_VALUES,
  PUBLISH_VALUES,
  REVIEW_DEFAULTS,
  SDD_FORMAT,
  TESTS_VALUES,
  WORKTREE_DEFAULTS,
} from '../shared/sdd-core/formats.ts'

const root = join(import.meta.dirname, '..')
const sdd = join(root, 'plugins/sdd')
const read = (p: string) => readFileSync(join(sdd, p), 'utf8')
const problems: string[] = []
const same = (what: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}
const sorted = (xs: string[]) => [...xs].sort()

// Every key the reference documents, with its enum values (null: free-form) and default.
const KEYS: Record<string, { values: string[] | null; default: string | null }> = {
  format: { values: null, default: null },
  projects: { values: null, default: null },
  'implementation.default': { values: null, default: IMPLEMENTATION_DEFAULT },
  'implementation.projects.<project>': { values: null, default: null },
  'implementation.isolation': { values: ISOLATION_VALUES.map((v) => (v === 'none' ? v : v + ':')), default: 'none' },
  'implementation.isolation.worktree.merge': { values: MERGE_VALUES, default: WORKTREE_DEFAULTS.merge },
  'implementation.isolation.worktree.parallel': { values: null, default: WORKTREE_DEFAULTS.parallel },
  ...Object.fromEntries(ACTION_KEYS.map((k) => ['actions.' + k, { values: null, default: null }])),
  'review.tests': { values: TESTS_VALUES, default: REVIEW_DEFAULTS.tests },
  'review.publish': { values: PUBLISH_VALUES, default: REVIEW_DEFAULTS.publish },
  'review.default': { values: null, default: REVIEW_DEFAULTS.default },
  'review.projects.<project>': { values: null, default: null },
  'review.checks': { values: null, default: null },
  'review.ci': { values: CI_VALUES, default: null },
  generated: { values: null, default: null },
}

// 1. Schema enums.
const schema = JSON.parse(read('schemas/capabilities.schema.json'))
const p = schema.properties
const iso = p.implementation.properties.isolation.oneOf
same('schema isolation string', iso[1].enum, ISOLATION_VALUES.filter((v) => v === 'none'))
same('schema isolation object', iso[2].required, ISOLATION_VALUES.filter((v) => v !== 'none'))
same('schema worktree keys', Object.keys(iso[2].properties.worktree.properties), Object.keys(WORKTREE_DEFAULTS))
same('schema merge', iso[2].properties.worktree.properties.merge.enum, MERGE_VALUES)
same('schema review.tests', p.review.properties.tests.enum, [...TESTS_VALUES, null])
same('schema review.publish', p.review.properties.publish.enum, [...PUBLISH_VALUES, null])
same('schema review.ci', p.review.properties.ci.enum, [...CI_VALUES, null])
same('schema actions', Object.keys(p.actions.properties), ACTION_KEYS)

// 2. The seeded template.
const tpl = parseCapabilities(read('skills/doctor/templates/capabilities.yml.template'))
same('template YAML errors', tpl.errors, [])
same('template format', tpl.format, SDD_FORMAT)
same('template top-level keys', Object.keys(tpl.doc), Object.keys(p))

// 3. The key table in references/capabilities.md: `| `key` | values | default | effect |`.
const rows = new Map<string, string[]>()
const reference = read('references/capabilities.md')
const keysTable = reference.slice(reference.indexOf('\n## Keys'))
for (const line of keysTable.split('\n')) {
  const m = line.match(/^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/)
  if (m) rows.set(m[1], m[2].split('|').map((c) => c.trim()))
}
same('reference keys', sorted([...rows.keys()]), sorted(Object.keys(KEYS)))
const ticks = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((x) => x[1])
for (const [key, want] of Object.entries(KEYS)) {
  const row = rows.get(key)
  if (!row) continue
  if (want.values) same(`reference ${key} values`, sorted(ticks(row[0])), sorted(want.values))
  if (want.default !== null && !ticks(row[1]).includes(want.default)) problems.push(`reference ${key} default: "${row[1]}", expected \`${want.default}\``)
}

if (problems.length > 0) {
  for (const x of problems) console.log('::error::capabilities contract: ' + x)
  process.exit(1)
}
console.log('capabilities contract: formats.ts, schema, template and reference agree')
