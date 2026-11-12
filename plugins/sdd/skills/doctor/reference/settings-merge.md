# Add sibling repositories to `.claude/settings.json`

The only edit `/sdd:doctor init` makes to `settings.json`; it applies only when projects live in
sibling repositories. Everything else in the file stays untouched.

1. Path: `<project root>/.claude/settings.json` (cwd, not the plugin root).
2. Missing or empty file → start from `{ "$schema": "https://json.schemastore.org/claude-code-settings" }`.
3. Existing file → parse as JSON. **Malformed → stop, write nothing**, tell the user: "`.claude/settings.json`
   is malformed JSON — refusing to touch it. Fix it and re-run `/sdd:doctor init`."
4. Ensure `permissions` (object) and `permissions.additionalDirectories` (array) exist; append each
   sibling path (relative, `../mobile-app`) that is not yet listed. Never remove or reorder entries.
5. Write with 2-space indent and a trailing newline.
