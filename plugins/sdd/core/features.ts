// The features under specs/: one folder per feature, holding any of spec.md, plan.md, tasks.md and
// review.md. One definition for the doctor, the board and the CLI.
import { parseSpec } from './parse.ts'
import type { Io } from './io.ts'

export type FeatureFiles = { slug: string; spec: string | null; plan: string | null; tasks: string | null; review: string | null }

export const FEATURE_DOCS = ['spec', 'plan', 'tasks', 'review'] as const
export type FeatureDoc = (typeof FEATURE_DOCS)[number]

export const featurePath = (slug: string, doc: FeatureDoc) => 'specs/' + slug + '/' + doc + '.md'

// A folder counts as a feature when it holds at least one of the four documents.
export function featureOf(slug: string, read: (doc: FeatureDoc) => string | null): FeatureFiles | null {
  const [spec, plan, tasks, review] = FEATURE_DOCS.map(read)
  return spec === null && plan === null && tasks === null && review === null ? null : { slug, spec, plan, tasks, review }
}

export async function readFeatures(io: Io): Promise<FeatureFiles[]> {
  const out: FeatureFiles[] = []
  for (const entry of await io.list('specs')) {
    if (!entry.dir) continue
    const docs = await Promise.all(FEATURE_DOCS.map((d) => io.read(featurePath(entry.name, d))))
    const f = featureOf(entry.name, (d) => docs[FEATURE_DOCS.indexOf(d)])
    if (f) out.push(f)
  }
  return out
}

// The feature whose spec.md has `**Branch:**` equal to `branch`.
export function featureOfBranch(features: FeatureFiles[], branch: string): FeatureFiles | null {
  return features.find((f) => f.spec !== null && parseSpec(f.spec).branch === branch) ?? null
}
