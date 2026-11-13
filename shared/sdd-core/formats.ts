// Constants shared by the doctor checks and the board: what the SDD artifacts must contain.
// The prose version of the same list is plugins/sdd/references/formats.md.

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

// `## ` sections of specs/capabilities.md; `Projects` was `Stack profile` in older versions.
export const CAPABILITIES_SECTIONS = ['Projects', 'Implementation', 'Actions', 'Review', 'Generated / out-of-band paths']
export const CAPABILITIES_LEGACY_PROJECTS = 'Stack profile'
export const AUTO_MARKER = '<!-- auto-generated -->'
export const OVERRIDE_MARKER = '<!-- user-override -->'

// Who does a step: skill:<name> | agent:<name> | command:<shell> | in-session.
export const FLOW_VALUE = /^(?:(?:skill|agent|command):\S.*|in-session)$/
export const REVIEW_KEYS: Record<string, RegExp> = {
  tests: /^(?:run|skip)$/,
  publish: /^(?:ask|off)$/,
  default: /^(?:auto|(?:skill|agent|command):\S.*)$/,
}
export const ACTION_KEYS = ['branch', 'commit', 'pr']

export const SPEC_STATUSES = ['draft', 'clarified', 'planned', 'in-progress', 'done']
export const PLAN_STATUSES = ['draft', 'tasks-ready', 'in-progress', 'done']
export const TASK_STATUSES = ['draft', 'in-progress', 'review', 'done']

// Columns of the constitution §2 table; `dev / ui-preview` is the name used before the rename.
export const COMMAND_COLUMNS = ['test', 'coverage', 'typecheck', 'lint', 'dev']
export const COMMAND_COLUMN_ALIASES: Record<string, string> = { 'dev / ui-preview': 'dev', 'dev/ui-preview': 'dev', 'ui-preview': 'dev' }
