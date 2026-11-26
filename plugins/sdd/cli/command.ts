// The contract every SDD CLI command implements, and the helpers they share. Pure (no node: imports),
// so command files load in `claude plugin test`; context.ts gives them the real files at run time.
import { parseSpec } from '../core/parse.ts'
import type { FeatureFiles } from '../core/features.ts'

export type Flags = Record<string, string | true>
// code 1: wrong usage; code 2: the files or a rule refuse it (the message says what to do).
export type Result = { ok: true; data: Record<string, unknown> } | { ok: false; code: 1 | 2; error: string; data?: Record<string, unknown> }

// What a command may touch: files relative to the repository root, read once on demand.
export interface Ctx {
  readonly root: string
  readonly changed: string[] // files written by this run, reported as `changed`
  read(rel: string): string | null
  write(rel: string, text: string): void
  branch(): string
  capabilities(): { yml: string | null; md: string | null }
  features(): FeatureFiles[]
  feature(): FeatureFiles | null // the feature whose spec.md `**Branch:**` is the current branch
}

export type Command = {
  group: string
  action: string
  summary: string // one line for `sdd help`
  usage: string // arguments and flags, e.g. `<id> <status> [--branch <name>]`
  readOnly: boolean
  run(ctx: Ctx, args: string[], flags: Flags): Result
}

export const fail = (code: 1 | 2, error: string, data?: Record<string, unknown>): Result => ({ ok: false, code, error, ...(data ? { data } : {}) })

export const noFeature = (ctx: Ctx): Result =>
  fail(2, `No specs/*/spec.md has **Branch:** ${ctx.branch() || '(no branch)'}.`, {
    features: ctx.features().filter((f) => f.spec !== null).map((f) => ({ slug: f.slug, branch: parseSpec(f.spec!).branch })),
  })
