// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

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
      components: { SiteTitle: "./src/components/SiteTitle.astro", Footer: "./src/components/Footer.astro" },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Getting started",
          items: ["getting-started/introduction", "getting-started/installation", "getting-started/quick-start"],
        },
        {
          label: "Concepts",
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
        { label: "Agents", items: ["agents/overview"] },
        { label: "Configuration", items: ["configuration/capabilities"] },
        { label: "sdd-board", items: ["board/overview"] },
        {
          label: "Guides",
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
          items: ["reference/file-structure", "reference/design-decisions", "reference/contributing"],
        },
      ],
    }),
  ],
});
