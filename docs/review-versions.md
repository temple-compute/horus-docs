# Review: versioned docs (branch `docs-versions`)

Scope: commits `d43fdd7` and `fb56574` against `origin/main`, for tc-os #239.

Totals: 0 high, 2 medium, 5 low, 3 nit.

## What was checked

- `bun install`, `bun run typecheck` and `bun run build` (OpenNext) pass.
- Latest build (`next start`, Orca browser): no banner, no version menu. Head has
  `<link rel="canonical" href="https://docs.templecompute.com/guides/concepts">` and no robots meta.
  The root page's canonical is `https://docs.templecompute.com`.
- Scratch cut in a throwaway clone (remote removed, nothing pushed):
  `bun scripts/cut-version.ts 0.12`, then built and served branch `v0.12`. Banner
  "You are viewing docs for v0.12. Latest" and a "v0.12" menu (Latest, v0.12) both render,
  on desktop and at iPhone 12 width, and the banner stays put on scroll. Head has
  `<meta name="robots" content="noindex">` and a canonical to the same path on
  `docs.templecompute.com`.
- The script sets `version`, and renames both `name` and the `WORKER_SELF_REFERENCE` `service`
  in `wrangler.jsonc` to `horus-docs-v0-12`. On `main` it commits only the list change. A second
  cut gives `['v0.13', 'v0.12']` (newest first).
- Guards work: a second run fails on "branch v0.12 already exists". Running off `main` fails on
  "checkout main first". `0.12.1` and a missing argument print usage.
- TLS claim in DEPLOYMENT.md is correct: Universal SSL stops at one subdomain level, and a Workers
  custom domain issues its own certificate for deeper hosts such as
  `v0-12.docs.templecompute.com`
  ([Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
  [Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)).

## Findings

### 1. Medium: a cut that fails partway leaves a half-done state, and a rerun refuses it

`scripts/cut-version.ts:41-49`

The list commit on `main` (line 42) lands before the `wrangler.jsonc` edits (lines 46-47) are
known to match. Reproduced by reformatting `"name": "horus-docs"` and cutting `0.14`. The result:
`main` has the `docs: list v0.14` commit, the shell is left on a new branch `v0.14` with
`lib/versions.ts` modified, and a rerun fails on "checkout main first", then on
"branch v0.14 already exists" or "v0.14 already listed". Recovery is a manual reset.

Fix: before the first write, read `wrangler.jsonc` and `lib/versions.ts` and check that all
three patterns match (version line, `"name"`, `"service"`). Optionally wrap the rest in
try/catch that runs `git switch -f main`, `git reset --hard <start sha>` and `git branch -D v`.

### 2. Medium: retiring a version leaves dead links in the menu

`DEPLOYMENT.md:111-112`, `lib/versions.ts:6`

The retention rule deletes workers and domains, but nothing removes the version from `versions`
on `main`. So latest's menu keeps linking to a host that no longer resolves. Each frozen branch
also lists every older version, so `v0.12` would still link to a retired `v0.10`.

Fix: add "remove it from `versions` on `main`" to the retention step, or add a `--retire` mode
to the script. For frozen branches, either accept it or see finding 4.

### 3. Low: version links open in a new tab

`lib/layout.shared.tsx:19-20`

The menu URLs are absolute, so Fumadocs treats them as external links and renders
`target="_blank" rel="noreferrer noopener"` (checked in the browser). Switching versions opens a
new tab each time. The banner's "Latest" link is a plain `<a>` and opens in the same tab, so the
two behave differently.

Fix: add `external: false` to each item. `LinkItem` in `fumadocs-ui/layouts/shared` accepts it.

### 4. Low: frozen versions never list newer versions

`lib/versions.ts:6`, `DEPLOYMENT.md:106-108`

`versions` is frozen when the branch is cut, so `v0.12` only ever offers "Latest" and `v0.12`.
After `v0.13` is cut, a reader on `v0.12` cannot reach `v0.13` from the menu. This follows from
the "versions are not rebuilt" design.

Fix: have latest serve the list (for example `/versions.json`) and let the menu fetch it
client-side, falling back to the built-in list. Or keep the current behaviour and state it in
DEPLOYMENT.md.

### 5. Low: DEPLOYMENT.md has the one-time branch-control step after the first push

`DEPLOYMENT.md:118-134`

`git push origin main v0.12` comes before step 3, which excludes `v*` from `horus-docs`
non-production builds. On the first cut, `horus-docs` builds `v0.12` as a preview and fails on
the worker name mismatch, so the commit gets a red check.

Fix: move step 3 into a "once, before the first cut" note above the push.

### 6. Low: version switch and banner link go to the home page, not the same page

`app/(docs)/layout.tsx:12-15`, `lib/layout.shared.tsx:19-20`

"Latest" and every version item point to the root of the target host. A reader on
`v0-12…/guides/concepts` lands on the latest home page and has to find the page again.

Fix: use a small client component with `usePathname()` that links to
`${latestUrl}${pathname}` (and `versionUrl(v) + pathname` in the menu). Fumadocs' own menu needs
a static URL, so this applies mainly to the banner. The menu can stay on root, or become a
custom sidebar banner.

### 7. Low: the script's guards miss remote state and the working directory

`scripts/cut-version.ts:23-25`

- It does not check that `main` matches `origin/main`, so a cut from a stale `main` makes the
  push fail or freezes old content.
- It does not check `origin/<v>`. If a branch `v0.12` exists on the remote but not locally, the
  cut goes ahead and only the push catches it.
- File paths are relative. Running it from a subdirectory fails on the first read, which is
  harmless but confusing.

Fix: `git fetch origin`, require `rev-parse main == rev-parse origin/main`, fail if
`git ls-remote --heads origin <v>` returns anything, and
`process.chdir(git('rev-parse', '--show-toplevel'))`.

### 8. Nit: canonical to latest can point at a page latest no longer has

`app/(docs)/[[...slug]]/page.tsx:50-51`

If a page is renamed or removed after a cut, the old version's canonical points at a 404 on
latest. Old versions are `noindex`, so the impact is small. Google advises against sending both
noindex and a cross-host canonical, but noindex wins in practice.

Fix: none required. Optionally drop `alternates` on old versions and rely on `noindex` alone.

### 9. Nit: the `vX.Y` to host slug rule is written twice

`lib/versions.ts:12-14`, `scripts/cut-version.ts:21`

`v.replace('.', '-')` appears in both files. If they drift, the worker name and the menu URL
diverge.

Fix: export a `versionSlug(v)` from `lib/versions.ts` and import it in the script (Bun runs TS
imports directly).

### 10. Nit: retirement does not mention the leftover certificate

`DEPLOYMENT.md:111-112`

Deleting a Workers custom domain does not delete its certificate (per the Custom Domains docs
above).

Fix: add "and delete its certificate under SSL/TLS → Edge Certificates".

## UI copy

- Banner: "You are viewing docs for v0.12. Latest". It is short and neutral, and it passes the
  test: without it a reader could follow outdated instructions. Keep it. A shorter option is
  "v0.12 docs · Latest". The `&nbsp;` before the link is only for spacing; a normal space inside
  `{' '}` reads cleaner.
- Menu label: "Latest" or the version string, with items "Latest" and `vX.Y`. No extra text.
  Keep it.
- In the sidebar the menu renders as a collapsible row ("v0.12 ›") styled like a page section,
  just under the "Horus Guides" switcher. It works, but a reader may not see it as a version
  picker. Optionally render it as a dropdown like "Horus Guides" (sidebar `banner` slot). This is
  part of finding 6 and not counted separately.
