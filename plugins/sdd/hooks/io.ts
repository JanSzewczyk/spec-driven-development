// The mods API (`$`) behind core's `Io` interface, for the doctor and the board.
// strict: a read, list or exists that fails throws instead of returning null / [] / false, so a
// caller can tell "absent" from "could not read right now" (the board keeps its last good data).
// root: an absolute folder that relative paths are read from instead of the session's cwd (the board
// in a task worktree reads specs/ of the SDD branch's checkout).
import type { Io } from '../core/io.ts'

export function ioOf($: any, options: { strict?: boolean; root?: string } = {}): Io {
  const at = (path: string) => (options.root && !path.startsWith('/') ? options.root.replace(/\/$/, '') + '/' + path : path)
  const guard = async <T>(fallback: T, body: () => Promise<T>): Promise<T> => {
    if (options.strict) return body()
    try {
      return await body()
    } catch {
      return fallback
    }
  }
  return {
    read: (path) => guard(null, async () => ((await $.fs.exists(at(path))) ? String(await $.fs.read(at(path))) : null)),
    exists: (path) => guard(false, async () => Boolean(await $.fs.exists(at(path)))),
    list: (dir) =>
      guard([], async () => {
        if (!(await $.fs.exists(at(dir)))) return []
        const entries: any[] = await $.fs.list(at(dir))
        return entries.map((e) => ({ name: String(e.name), dir: e.kind === 'directory' || e.kind === 'dir' }))
      }),
    async run(argv) {
      try {
        const r = await (options.root ? $.process.run(argv, { cwd: options.root }) : $.process.run(argv))
        return { exitCode: r.exitCode, stdout: String(r.stdout ?? '') }
      } catch {
        return null
      }
    },
  }
}
