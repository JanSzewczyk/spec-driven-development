import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { changelogsLoader } from "starlight-changelogs/loader";
import { docsVersionsLoader } from "starlight-versions/loader";

// Headings are `## [2.0.2] — 2026-11-15`, or `## [0.9.2 sdd-board] — 2026-11-15` (also
// `[sdd-board 0.2.0]`) for the panel plugin merged into sdd in 2.5.0. Its entries stay as history,
// labelled with its name so its version numbers are not read as sdd's.
function entryTitle({ title }: { title: string }) {
  const m = title.match(/^\[(?:sdd-board )?(\S+)( sdd-board)?\]\s*—\s*(\d{4}-\d{2}-\d{2})$/);
  if (!m) return title;
  const board = Boolean(m[2]) || title.startsWith("[sdd-board ");
  return `${board ? "sdd-board " : ""}${m[1]} · ${m[3]}`;
}

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  changelogs: defineCollection({
    loader: changelogsLoader([
      { provider: "keep-a-changelog", base: "changelog", title: "sdd changelog", changelog: "../CHANGELOG.md", process: entryTitle },
    ]),
  }),
  versions: defineCollection({ loader: docsVersionsLoader() }),
};
