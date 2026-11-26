import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { changelogsLoader } from "starlight-changelogs/loader";
import { docsVersionsLoader } from "starlight-versions/loader";

// Headings are `## [2.0.2] — 2026-11-15`; an entry is titled `2.0.2 · 2026-11-15`.
function entryTitle({ title }: { title: string }) {
  const m = title.match(/^\[(\S+)\]\s*—\s*(\d{4}-\d{2}-\d{2})$/);
  return m ? `${m[1]} · ${m[2]}` : title;
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
