// Constants shared by the doctor checks and the board: what the SDD artifacts must contain.
// The prose version of the same list is plugins/sdd/references/formats.md.

import schema from './capabilities.schema.ts'

export type Level = 'pass' | 'warn' | 'fail'

// Sections of specs/constitution.md. Matched on the heading text, ignoring numbering and emoji.
export const CONSTITUTION_SECTIONS: [string, RegExp][] = [
  ['Tech stack', /tech\s*stack/i],
  ['Run/build', /run\s*\/\s*build/i],
  ['Conventions', /conventions/i],
  ['WHAT NOT TO DO', /what\s+not\s+to\s+do/i],
]

// Sections of specs/template.md (the base of every spec.md).
export const SPEC_TEMPLATE_SECTIONS = ['Summary', 'User stories', 'Acceptance criteria', 'Edge cases', 'Non-goals', 'Open questions']
// Substituted by `/sdd:spec` with sed; a template without them yields a broken spec.
export const SPEC_TEMPLATE_PLACEHOLDERS = ['{{feature_title}}', '{{feature_slug}}', '{{type}}']

// specs/capabilities.yml: the configuration of the SDD flow. specs/capabilities.md is the format-2
// file `/sdd:doctor init` migrates; it is still read until the next major version.
export const CAPABILITIES_PATH = 'specs/capabilities.yml'
export const LEGACY_CAPABILITIES_PATH = 'specs/capabilities.md'
// `## ` sections of the legacy capabilities.md; `Projects` was `Stack profile` before that.
export const LEGACY_SECTIONS = { projects: 'Projects', oldProjects: 'Stack profile', implementation: 'Implementation', actions: 'Actions', review: 'Review', generated: 'Generated / out-of-band paths' }

// The shape of capabilities.yml (keys, allowed values, defaults, patterns) is defined once, in
// capabilities.schema.json (capabilities.schema.ts is its generated copy). Everything below is read from it; edit the schema, not these lines.
const props = schema.properties
const iso = props.implementation.properties.isolation.oneOf
const worktree = iso[2].properties.worktree.properties
const review = props.review.properties
const strings = (xs: (string | null)[]) => xs.filter((x): x is string => x !== null)
const oneOf = (values: string[]) => new RegExp('^(?:' + values.join('|') + ')$')

export const CAPABILITIES_KEYS = Object.keys(props)
export const PROJECT_KEYS = Object.keys(props.projects.items.properties)
export const IMPLEMENTATION_KEYS = Object.keys(props.implementation.properties)
export const ACTION_KEYS = Object.keys(props.actions.properties)

// Allowed values: the regexes below are built from them.
export const ISOLATION_VALUES: string[] = [...iso[1].enum, ...iso[2].required]
export const MERGE_VALUES: string[] = worktree.merge.enum
export const TESTS_VALUES = strings(review.tests.enum)
export const PUBLISH_VALUES = strings(review.publish.enum)
export const CI_VALUES = strings(review.ci.enum)

// Who does a step: skill:<name> | agent:<name> | command:<shell> | in-session.
export const FLOW_VALUE = new RegExp(schema.$defs.flow.pattern)
export const IMPLEMENTATION_DEFAULT: string = props.implementation.properties.default.default
// Keys under `isolation.worktree`, with the values they accept and their defaults.
export const WORKTREE_KEYS: Record<string, RegExp> = {
  merge: oneOf(MERGE_VALUES), // who merges a task branch: a human through a PR, or the session
  parallel: new RegExp(worktree.parallel.pattern), // tasks running at once
}
export const WORKTREE_DEFAULTS: Record<string, string> = { merge: worktree.merge.default, parallel: String(worktree.parallel.default) }
// Format-2 keys of `## Implementation` that format 3 dropped or moved under `isolation`.
export const LEGACY_IMPLEMENTATION_KEYS = ['commit', 'isolation', 'merge', 'parallel']
// `review:` keys with one value; `projects` and `checks` are checked apart.
export const REVIEW_KEYS: Record<string, RegExp> = {
  tests: oneOf(TESTS_VALUES),
  publish: oneOf(PUBLISH_VALUES),
  default: new RegExp(review.default.pattern),
  ci: oneOf(CI_VALUES), // whether the sdd-check GitHub workflow is wanted
}
export const REVIEW_DEFAULTS: Record<string, string> = { tests: review.tests.default, publish: review.publish.default, default: review.default.default }

export const SPEC_STATUSES = ['draft', 'clarified', 'planned', 'in-progress', 'done']
export const PLAN_STATUSES = ['draft', 'tasks-ready', 'in-progress', 'done']
export const TASK_STATUSES = ['draft', 'in-progress', 'review', 'done']

// Columns of the constitution §2 table; `dev / ui-preview` is the name used before the rename.
export const COMMAND_COLUMNS = ['test', 'coverage', 'typecheck', 'lint', 'dev']
export const COMMAND_COLUMN_ALIASES: Record<string, string> = { 'dev / ui-preview': 'dev', 'dev/ui-preview': 'dev', 'ui-preview': 'dev' }

// Version of the artifact format (capabilities keys, tasks.md header). A lower `format:` in
// capabilities.yml (or a legacy capabilities.md) means `/sdd:doctor init` has migrations to apply.
export const SDD_FORMAT: number = props.format.const
// `<!-- sdd-format: N -->` in the legacy capabilities.md.
export const SDD_FORMAT_MARKER = /<!--\s*sdd-format:\s*(\d+)\s*-->/

// Epic id in tasks.md: 2-5 capital letters from the slug, a dash and 4 hex characters (ULOG-7f3a).
export const EPIC_ID = /^[A-Z]{2,5}-[0-9a-f]{4}$/
// Task branch: `<spec branch>--<epic>-T<n>`; the separator is `--` because `feat/x/...` collides with the ref `feat/x`.
export const taskBranch = (specBranch: string, epic: string, taskId: string) => `${specBranch}--${epic}-${taskId}`

// The sdd-check workflow the doctor installs; its first lines carry `# sdd-workflow: <n>`.
export const WORKFLOW_PATH = '.github/workflows/sdd-check.yml'
export const WORKFLOW_VERSION = 2
export const WORKFLOW_MARKER = /^#\s*sdd-workflow:\s*(\d+)\s*$/m
