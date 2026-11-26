// The mods API (`$`) behind core's `Io` interface, for the doctor and the board.
// strict: a read, list or exists that fails throws instead of returning null / [] / false, so a
// caller can tell "absent" from "could not read right now" (the board keeps its last good data).
import type { Io } from '../core/io.ts'

export function ioOf($: any, options: { strict?: boolean } = {}): Io {
  const guard = async <T>(fallback: T, body: () => Promise<T>): Promise<T> => {
    if (options.strict) return body()
    try {
      return await body()
    } catch {
      return fallback
    }
  }
  return {
    read: (path) => guard(null, async () => ((await $.fs.exists(path)) ? String(await $.fs.read(path)) : null)),
    exists: (path) => guard(false, async () => Boolean(await $.fs.exists(path))),
    list: (dir) =>
      guard([], async () => {
        if (!(await $.fs.exists(dir))) return []
        const entries: any[] = await $.fs.list(dir)
        return entries.map((e) => ({ name: String(e.name), dir: e.kind === 'directory' || e.kind === 'dir' }))
      }),
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
