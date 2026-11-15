import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { changelogsLoader } from "starlight-changelogs/loader";
import { docsVersionsLoader } from "starlight-versions/loader";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  changelogs: defineCollection({
    loader: changelogsLoader([
      {
        provider: "keep-a-changelog",
        base: "changelog",
        changelog: "../CHANGELOG.md",
        // Headings are `## [2.0.2] — 2026-11-15` (sdd) or `## [0.9.2 sdd-board] — 2026-11-15`.
        process: ({ title }) => {
          const m = title.match(/^\[(\S+)(?: (\S+))?\]\s*—\s*(\d{4}-\d{2}-\d{2})$/);
          return m ? `${m[2] ?? "sdd"} ${m[1]} · ${m[3]}` : title;
        },
      },
    ]),
  }),
  versions: defineCollection({ loader: docsVersionsLoader() }),
};
