import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "Horus",
  tagline: "Next generation workflow manager",
  favicon: "img/favicon.ico",
  plugins: [
    // "@cmfcmf/docusaurus-search-local"
  ],
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },
  url: "https://docs.templecompute.com",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",
  trailingSlash: false,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "temple-compute", // Usually your GitHub org/user name.
  projectName: "horus-docs", // Usually your repo name.

  onBrokenLinks: "throw",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          lastVersion: "current",
          versions: {
            current: {
              label: "Preview",
            },
          },
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ["rss", "atom"],
            xslt: true,
          },
          // Useful options to enforce blogging best practices
          onInlineTags: "warn",
          onInlineAuthors: "warn",
          onUntruncatedBlogPosts: "warn",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/horus.png",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Horus",
      logo: {
        alt: "Horus Logo",
        src: "img/horus.png",
      },
      items: [
        {
          type: "doc",
          docId: "intro",
          position: "left",
          label: "Docs",
          sidebarId: "docs",
        },
        // {
        //   type: "doc",
        //   docId: "runtime/overview",
        //   position: "left",
        //   label: "Runtime",
        // },
        // {
        //   type: "doc",
        //   docId: "gui/overview",
        //   position: "left",
        //   label: "GUI",
        // },
        {
          type: "doc",
          docId: "sdk/overview",
          position: "left",
          label: "SDK",
          sidebarId: "sdk",
        },
        // { to: "/blog", label: "Blog", position: "left" },
        // {
        //   type: "docsVersionDropdown",
        //   position: "right",
        // },
        // {
        //   type: "localeDropdown",
        //   position: "right",
        // },
        {
          href: "https://github.com/templecompute/horus-runtime",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/templecompute/horus-runtime",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Temple Compute. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
