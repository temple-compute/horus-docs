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

## Round 2

Scope: commits `4d9620f`, `ddb9853`, `c4157ad` and `2ad6d3e` (after `e394e70`).

Totals: 0 high, 1 medium, 2 low, 7 nit.

### Round 1 status

| # | Finding | Status |
|---|---------|--------|
| 1 | Partial cut leaves half-done state | Fixed. All `replace` checks run before the first write, and a failed commit rolls back. Reproduced with a pre-commit hook that fails only on the version branch: `main` returns to the start SHA, no `v0.13` branch, clean tree. |
| 2 | Retired versions stay in the menu | Fixed with `--retire` and the fetched list. See round-2 finding 1 for a bug in the retire rollback. |
| 3 | Version links open a new tab | Fixed. Menu items are plain `<a>` with no `target` (checked in the browser). |
| 4 | Frozen versions never list newer ones | Fixed. Old versions fetch `/api/versions` from latest. See round-2 findings 2 and 3. |
| 5 | Branch-control step after the first push | Fixed. It is now a "once, before the first cut" note. |
| 6 | Version switch goes to the home page | Fixed with `/api/goto`. Menu and banner link to the same page. |
| 7 | Guards miss remote state and cwd | Fixed: `fetch` and `main == origin/main`, `ls-remote` check, `chdir` to the repo root. A retire after an unpushed cut fails on "main does not match origin/main". |
| 8 | Canonical to latest can 404 | Not changed. No fix was required. |
| 9 | Slug rule written twice | Fixed. `versionSlug` is exported and the script imports it. |
| 10 | Leftover certificate on retire | Fixed in DEPLOYMENT.md. The script's message still omits it (round-2 finding 9). |
| UI | `&nbsp;` in the banner | Fixed. It is now `{' '}`. |

### What was checked

- `bun run typecheck` and `bun run build:next` pass. `/api/goto` is dynamic, and `/api/versions` is static.
- `/api/goto` probed on `next start` and on the OpenNext build under `wrangler dev` (workerd). It
  only redirects to a URL from `source.getPage()`, which comes from content, never from the
  query. Every crafted input went to `/` on the same host: `//evil.com`, `///evil.com`,
  `\\evil.com`, `/\\evil.com`, `%2F%2Fevil.com`, `%252F%252Fevil.com`, `https://evil.com`,
  `https:%2F%2Fevil.com`, `javascript:alert(1)`, `@evil.com`, `/../../etc/passwd`,
  `/guides/../guides/concepts`, `/guides/%2e%2e/concepts`, CRLF with `Set-Cookie` or `Location`,
  a repeated `path`, and no `path` at all. CRLF never reaches a header. Valid paths
  (`/guides/concepts`, `guides/concepts`) resolve. The 302 has no `Cache-Control`.
- `/api/versions` under workerd returns `Access-Control-Allow-Origin: *`, `application/json`,
  no `Set-Cookie` and no `Allow-Credentials`. The client fetch sends no credentials (default mode
  on a cross-origin request). `OPTIONS` returns 405, which is fine because a simple GET needs no
  preflight. The client accepts only an array of `vX.Y` strings, so a hostile response cannot inject
  a host. Tested with `["v0.12","evil.com/x"]`, which was ignored.
- Menu in headless Chromium on a scratch old-version build (`v0.12`, list `['v0.13','v0.12']`),
  at 1280 and 390 px wide. Links point to `<host>/api/goto?path=%2Fguides%2Fconcepts`. The links
  are reachable with Tab. When the fetch fails (production has no `/api/versions` yet, so CORS
  blocks it), the menu keeps the built-in list. One console error is logged.
- `cut-version.ts` run in a scratch clone with a local bare origin: happy path, rollback on a
  failed second commit, and the retire failure below.

### 1. Medium: a failed retire deletes the version branch it is told to keep

`scripts/cut-version.ts:53-56`, `:66`

`rollback()` is shared by cut and retire, and always runs `git branch -D v` when the branch
exists. A retire runs on a version whose branch normally exists locally, and DEPLOYMENT.md says to
keep it. Reproduced: local `v0.10` with an unpushed commit, a pre-commit hook that fails, and then
`--retire 0.10`. The commit fails, and afterwards `git branch --list v0.10` is empty. A failed GPG
signature triggers the same path.

Fix: delete the branch only on the cut path, for example with a `created` flag set after
`git switch -c`, or by not calling the branch deletion from the retire `catch`.

### 2. Low: an old version's menu can drop the version being viewed

`components/version-links.tsx:25`

The fetched list replaces the built-in one, including the empty list. DEPLOYMENT.md has you push
`v0.12` and bring its worker live before you push `main`. In that window latest serves `[]` or a
list without `v0.12`, so on `v0-12…` the menu labelled "v0.12" shows only "Latest". Reproduced
with a mocked `[]` response: the menu goes from "Latest, v0.13, v0.12" to "Latest". The same
happens on a retired version between `git push origin main` and deleting its worker.

Fix: when `!isLatest`, keep `version` in the list (merge it in if the fetched list lacks it),
or keep the built-in list when the fetched one does not include `version`.

### 3. Low: the menu refetches on open and reorders while open

`components/version-links.tsx:20-28`

On desktop the popover mounts `VersionLinks` when opened, so the fetch starts then, and the
list changes under the cursor when it lands. With a mocked 800 ms response, `v0.14` was inserted
and the items below it moved 36 px down. On mobile the sidebar remounts it, which gave two
requests in one visit. There is no page layout shift, only inside the menu.

Fix: start the fetch once per page load at module level (a module-scoped promise), and render
from its cached result. Optionally kick it off from `LatestLink`, which mounts with the banner.

### 4. Nit: `/api/goto` builds `Location` from the request host

`app/api/goto/route.ts:7`

`new URL(…, request.url)` takes the host from the request. Under `wrangler dev`,
`Host: evil.com` gave `Location: http://evil.com/guides/concepts`. In production Cloudflare
routes by hostname, so only a request already sent to this worker's own domain reaches it, and the
302 is not cached. It is not exploitable as it stands, but it depends on that.

Fix: send a relative `Location`:
`new Response(null, { status: 302, headers: { Location: page?.url ?? '/' } })`.

### 5. Nit: the list parser drops entries it does not recognise

`scripts/cut-version.ts:48`

`listed` only matches single-quoted entries, and `withList` rewrites the whole array from it. A
double-quoted entry (after a formatter run or a hand edit) is silently dropped on the next cut or
retire. A list wrapped over several lines fails safely on "versions list not found".

Fix: fail if the parsed count differs from the number of comma-separated entries, or match both
quote styles.

### 6. Nit: `--retire` only works as the first argument

`scripts/cut-version.ts:33-34`

`bun scripts/cut-version.ts 0.10 --retire` runs a cut and ignores the flag. For a listed version
it fails on "already listed". For an unlisted one it cuts.

Fix: look for `--retire` anywhere in `argv` and reject extra arguments.

### 7. Nit: the remote branch check matches by suffix

`scripts/cut-version.ts:75`

`git ls-remote --heads origin v0.12` matches any ref ending in `v0.12`, such as
`refs/heads/backport/v0.12`, so the cut refuses when it should not.

Fix: `git ls-remote --heads origin refs/heads/${v}`.

### 8. Nit: the menu does not mark the current version, and the switch drops the anchor

`components/version-links.tsx:31-37`, `lib/versions.ts:21`

The item for the version being viewed has no `aria-current` or visual state, so a screen reader
user hears the same list on every version. `usePathname()` has no `#hash`, so switching from
`/guides/concepts#retries` lands at the top of the page.

Fix: add `aria-current="page"` (and the active style) to the matching item. Optionally carry
`location.hash` at click time.

### 9. Nit: the retire message omits the domain and certificate

`scripts/cut-version.ts:69`

It says "delete worker horus-docs-v0-10". DEPLOYMENT.md also deletes the custom domain and its
certificate, and deleting the domain does not remove the certificate.

Fix: mention both, or say "see DEPLOYMENT.md" as the cut message does.

### 10. Nit: DEPLOYMENT.md says old menus "show" retired versions

`DEPLOYMENT.md:101-102`

"their menu shows versions cut or retired after them" reads as if retired versions stay listed.

Fix: "their menu reflects versions cut or retired after them".

### Verdict

FIX. Finding 1 can delete unpushed work, and finding 2 shows a wrong menu on every cut. Both
are a few lines. The rest can merge as is.
