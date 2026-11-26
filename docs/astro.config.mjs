// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";
import starlightChangelogs, { makeChangelogsSidebarLinks } from "starlight-changelogs";
import starlightVersions from "starlight-versions";

export default defineConfig({
  site: "https://janszewczyk.github.io",
  base: "/spec-driven-development",
  integrations: [
    mermaid({
      theme: "base",
      autoTheme: false,
      mermaidConfig: {
        themeVariables: {
          fontFamily: "Inter Variable, system-ui, sans-serif",
          primaryColor: "#eff6ff",
          primaryTextColor: "#0a0a0a",
          primaryBorderColor: "#93c5fd",
          secondaryColor: "#dbeafe",
          tertiaryColor: "#f5f5f5",
          lineColor: "#64748b",
          textColor: "#737373",
          noteBkgColor: "#dbeafe",
          noteTextColor: "#0a0a0a",
          edgeLabelBackground: "#eff6ff",
          stateBkg: "#eff6ff",
          labelBackground: "#eff6ff",
        },
      },
    }),
    starlight({
      title: "SDD",
      description: "Spec-Driven Development framework for Claude Code: the spec is the source of truth, code is its consequence.",
      logo: { src: "./src/assets/logo.svg", alt: "SDD" },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/JanSzewczyk/spec-driven-development" }],
      editLink: { baseUrl: "https://github.com/JanSzewczyk/spec-driven-development/edit/main/docs/" },
      lastUpdated: true,
      defaultLocale: "root",
      locales: {
        root: { label: "English", lang: "en" },
        pl: { label: "Polski", lang: "pl" },
      },
      plugins: [
        // `current` is the docs on main; each archived release is a folder src/content/docs/<slug>/.
        // To archive the next release, add { slug: "3.0" } to `versions` and start the dev server.
        // Pages under /changelog/ come from the repository's CHANGELOG.md (see src/content.config.ts).
        starlightChangelogs(),
        starlightVersions({ current: { label: "Latest" }, versions: [{ slug: "2.0", label: "v2.0" }] }),
      ],
      components: { SiteTitle: "./src/components/SiteTitle.astro", Footer: "./src/components/Footer.astro", Hero: "./src/components/Hero.astro" },
      customCss: ["./src/styles/custom.css", "./src/styles/flow.css", "./src/styles/landing.css"],
      sidebar: [
        {
          label: "Getting started",
          translations: { pl: "Pierwsze kroki" },
          items: ["getting-started/introduction", "getting-started/installation", "getting-started/quick-start"],
        },
        {
          label: "Concepts",
          translations: { pl: "Koncepcje" },
          items: [
            "concepts/workflow",
            "concepts/tasks",
            "concepts/status-lifecycle",
            "concepts/projects",
            "concepts/isolation",
            "concepts/context",
          ],
        },
        {
          label: "Commands",
          translations: { pl: "Komendy" },
          items: [
            "commands/overview",
            "commands/doctor",
            "commands/constitution",
            "commands/spec",
            "commands/clarify",
            "commands/plan",
            "commands/tasks",
            "commands/implement",
            "commands/review",
            "commands/retro",
            "commands/capabilities",
            "commands/analyze",
          ],
        },
        { label: "Agents",
          translations: { pl: "Agenci" }, items: ["agents/overview"] },
        { label: "Configuration",
          translations: { pl: "Konfiguracja" }, items: ["configuration/capabilities"] },
        { label: "Board",
          translations: { pl: "Board" }, items: ["board/overview"] },
        {
          label: "Guides",
          translations: { pl: "Poradniki" },
          items: [
            "guides/example",
            "guides/cheatsheet",
            "guides/best-practices",
            "guides/anti-patterns",
            "guides/cost",
            "guides/ci-action",
            "guides/troubleshooting",
          ],
        },
        {
          label: "Reference",
          translations: { pl: "Referencja" },
          items: [
            "reference/file-structure",
            "reference/cli",
            "reference/design-decisions",
            "reference/contributing",
          ],
        },
        ...makeChangelogsSidebarLinks([{ type: "all", base: "changelog", label: "Changelog" }]),
      ],
    }),
  ],
});
