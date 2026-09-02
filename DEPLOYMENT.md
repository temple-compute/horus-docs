# Deploying horus-docs to Cloudflare

This site is a Next.js app (Fumadocs) running on Cloudflare Workers via
[OpenNext](https://opennext.js.org/cloudflare). It is not a static export: the worker renders
pages, and `.open-next/assets` is served by Cloudflare's static-asset layer.

## Prerequisites

- A Cloudflare account with Workers enabled.
- Node 20+ and [bun](https://bun.sh).
- `bun install`
- `bunx wrangler login` (once per machine, for manual deploys).

## Local development

```bash
bun run dev        # Next dev server, fast refresh
```

`dev` runs on Node, not on workerd. It will not catch things that only break inside the Workers
runtime (missing `nodejs_compat` APIs, unsupported globals). Before trusting a deploy, use the
preview below.

## Preview the real worker locally

```bash
bun run preview    # opennextjs-cloudflare build && opennextjs-cloudflare preview
```

This performs the full OpenNext build and serves the result in workerd, the same runtime
Cloudflare uses. If it works here and fails in production, the difference is configuration or
secrets, not code.

## Manual deploy

```bash
bun run deploy     # build + deploy, goes live immediately
```

To upload a version without promoting it to production traffic:

```bash
bun run upload
```

Then promote it from the Workers dashboard under **Deployments**. Useful when you want the build
verified on Cloudflare's side before it serves users.

## Automatic deploy (CI)

Deploys are run by **Cloudflare Workers Builds**, the git integration configured under Workers &
Pages → `horus-docs` → **Settings → Build**. It clones the repo, runs `bun install
--frozen-lockfile`, then the configured commands:

| Branch | Command Cloudflare runs | Result |
|--------|-------------------------|--------|
| Build (all branches) | `bun run build` | `.open-next/worker.js` + `.open-next/assets` |
| `main` | `npx wrangler deploy` | live on `docs.templecompute.com` |
| any other branch | `npx wrangler versions upload` | preview version, not promoted |

No repository secrets are involved; Cloudflare authenticates the build itself. There is no
GitHub Actions deploy workflow, and adding one back would deploy the same worker twice per push.

The build command must be `opennextjs-cloudflare build`, not `next build`. Wrangler's entry point
is `.open-next/worker.js` (see `wrangler.jsonc`), which only the OpenNext build produces; with
`next build` both deploy commands fail with `entry-point file … was not found` /
`Could not find compiled Open Next config`.

Because OpenNext itself shells out to the package manager's `build` script, `open-next.config.ts`
sets `buildCommand: "bun run build:next"` to point it at the raw `next build`. Without that the
two call each other forever. If you rename either script, rename it in both places.

`.github/workflows/test.yml` runs `bun run build` on pull requests, so MDX, type, and worker
bundling errors are caught before merge.

## Custom domain

The site is served at `docs.templecompute.com`. On Cloudflare this is a **Workers custom domain**,
not a DNS record you point by hand:

1. Workers & Pages → `horus-docs` → **Settings → Domains & Routes → Add → Custom domain**.
2. Enter `docs.templecompute.com`. Cloudflare creates and proxies the DNS record itself, and
   issues the certificate.
3. Only after the Worker is serving correctly, remove the old GitHub Pages DNS record for the
   same hostname. Both cannot own it at once.

`public/CNAME` is a leftover from GitHub Pages. Cloudflare ignores it, and it is kept only so the
DNS cutover above is a deliberate step rather than a silent one. Delete it once Pages is retired.

## What the config files do

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Worker name (`horus-docs`), `nodejs_compat` flag (required by Next), the `WORKER_SELF_REFERENCE` service binding used for caching, and the `IMAGES` binding for image optimization. |
| `open-next.config.ts` | OpenNext adapter settings. R2 incremental caching is present but commented out; enable it if ISR/`revalidate` caching is ever needed. |
| `public/_headers` | Sets `immutable` long-lived caching on `/_next/static/*`. Content-hashed assets, so it is safe. |
| `next.config.mjs` | Wraps the Next config with `createMDX()` from `fumadocs-mdx`. |
| `source.config.ts` | Fumadocs content collection: `content/docs`, default page/meta schemas. |

## Troubleshooting

**`WORKER_SELF_REFERENCE` errors on deploy.** The `service` value in `wrangler.jsonc` must exactly
match the worker's `name`. If you rename the worker, rename both.

**Build succeeds but the worker 500s.** Almost always a Node API missing at runtime. Reproduce
with `bun run preview`, not `bun run dev`.

**Odd failures after upgrading `@opennextjs/cloudflare`.** Bump `compatibility_date` in
`wrangler.jsonc` to a date on or after the release, and re-check `compatibility_flags` against the
[OpenNext docs](https://opennext.js.org/cloudflare/get-started).

**Stale content after deploy.** Assets are immutable-cached by hash, so this is usually a purge
issue on the HTML, not the assets. Check Cloudflare's cache rules for the zone.
