// How core code reads a project. Each host gives its own implementation: the mods API in the mod
// (hooks/io.ts), node:fs in the sdd-check action. Paths are relative to the project root.
export type Io = {
  read(path: string): Promise<string | null> // null: absent (an implementation may also return null, or throw, when unreadable)
  exists(path: string): Promise<boolean>
  list(dir: string): Promise<{ name: string; dir: boolean }[]> // [] when the directory is absent
  run(argv: string[]): Promise<{ exitCode: number; stdout: string } | null> // null: could not start
}
