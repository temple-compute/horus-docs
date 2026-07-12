# horus-docs

The Horus documentation, built with [Fumadocs](https://fumadocs.dev/) on
Next.js. Deployed as a static export to GitHub Pages
(`docs.templecompute.com`).

## Contributing

### Install dependencies

```bash
bun install
```

### Local development

```bash
bun run dev
```

Docs content lives in `content/docs/` as MDX. Sidebar order and section labels
are controlled by `meta.json` files. The "Docs" and "SDK" sidebar tabs are the
two root folders (`content/docs/guides` and `content/docs/sdk`).

### Build

```bash
bun run build
```

This generates a static site into the `out/` directory (`output: 'export'`),
served by any static host. `bun run start` serves `out/` locally.

### Type check

```bash
bun run typecheck
```

## Structure

- `content/docs/` — MDX documentation + `meta.json` navigation
- `app/` — Next.js App Router (docs served at the site root)
- `components/` — MDX components (`Callout`, `Tabs`, `DownloadButton`, `Logotype`)
- `lib/` — Fumadocs source loader and shared layout options
- `public/examples/` — downloadable example workflows
- `scripts/migrate.ts` — one-shot Docusaurus → Fumadocs migration (kept for reference)
