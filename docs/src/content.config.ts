import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { changelogsLoader } from "starlight-changelogs/loader";
import { docsVersionsLoader } from "starlight-versions/loader";

function entryTitle(board: boolean) {
  return ({ title }: { title: string }) => {
    const m = title.match(/^\[(\S+)(?: (sdd-board))?\]\s*—\s*(\d{4}-\d{2}-\d{2})$/);
    if (!m) return board ? undefined : title;
    return Boolean(m[2]) === board ? `${m[1]} · ${m[3]}` : undefined;
  };
}

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  changelogs: defineCollection({
    loader: changelogsLoader([
      // Headings are `## [2.0.2] — 2026-11-15` (sdd) or `## [0.9.2 sdd-board] — 2026-11-15`.
      // One file feeds two changelogs: each keeps its own entries and drops the other's.
      { provider: "keep-a-changelog", base: "changelog", title: "sdd changelog", changelog: "../CHANGELOG.md", process: entryTitle(false) },
      { provider: "keep-a-changelog", base: "board/changelog", title: "sdd-board changelog (up to 0.9.7)", changelog: "../CHANGELOG.md", process: entryTitle(true) },
    ]),
  }),
  versions: defineCollection({ loader: docsVersionsLoader() }),
};
