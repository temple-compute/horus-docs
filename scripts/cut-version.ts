/**
 * Cut or retire a docs version. See DEPLOYMENT.md.
 *
 *   bun scripts/cut-version.ts 0.12            # cut v0.12
 *   bun scripts/cut-version.ts --retire 0.10   # drop v0.10 from the menu
 *
 * Runs on a clean main that matches origin/main. Cut adds v0.12 to the list on
 * main and commits, then creates branch v0.12 with `version` set and the worker
 * renamed to horus-docs-v0-12. Every check runs before the first write, and a
 * failed commit rolls main back. Does not push.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { versionSlug } from '../lib/versions';

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).trim();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// Replace exactly the expected text, or fail before anything is written.
function replace(src: string, file: string, from: string | RegExp, to: string): string {
  const out = src.replace(from, to);
  if (out === src) fail(`${file}: no match for ${from}`);
  return out;
}

process.chdir(git('rev-parse', '--show-toplevel'));

const args = process.argv.slice(2);
const retire = args.includes('--retire');
const rest = args.filter((a) => a !== '--retire');
const arg = rest.length === 1 ? rest[0] : '';
if (!/^\d+\.\d+$/.test(arg)) fail('usage: bun scripts/cut-version.ts [--retire] <major.minor>, e.g. 0.12');
const v = `v${arg}`;
const worker = `horus-docs-${versionSlug(v)}`;

if (git('branch', '--show-current') !== 'main') fail('checkout main first');
if (git('status', '--porcelain')) fail('working tree not clean');
git('fetch', '-q', 'origin', 'main');
if (git('rev-parse', 'main') !== git('rev-parse', 'origin/main')) fail('main does not match origin/main');

const versionsFile = 'lib/versions.ts';
const versionsSrc = readFileSync(versionsFile, 'utf8');
const listRe = /export const versions: string\[\] = \[(.*)\];/;
const listMatch = versionsSrc.match(listRe) ?? fail(`${versionsFile}: versions list not found`);
const listed = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
// Rewriting the list from `listed` would drop entries in any other format.
if (listMatch[1].split(',').filter((x) => x.trim()).length !== listed.length) fail(`${versionsFile}: unexpected list format`);
const withList = (list: string[]) =>
  replace(versionsSrc, versionsFile, listRe, `export const versions: string[] = [${list.map((x) => `'${x}'`).join(', ')}];`);

const start = git('rev-parse', 'HEAD');
// deleteBranch only for a cut: a retire must keep the version branch.
function rollback(deleteBranch: boolean) {
  git('switch', '-q', '-f', 'main');
  git('reset', '-q', '--hard', start);
  if (deleteBranch && git('branch', '--list', v)) git('branch', '-q', '-D', v);
}

if (retire) {
  if (!listed.includes(v)) fail(`${v} is not listed`);
  const mainVersions = withList(listed.filter((x) => x !== v));
  try {
    writeFileSync(versionsFile, mainVersions);
    git('commit', '-q', '-m', `docs: retire ${v}`, '--', versionsFile);
  } catch (e) {
    rollback(false);
    throw e;
  }
  console.log(`main: retired ${v}\nnext: git push origin main, then delete worker ${worker} (DEPLOYMENT.md)`);
  process.exit(0);
}

if (listed.includes(v)) fail(`${v} already listed`);
if (git('branch', '--list', v)) fail(`branch ${v} already exists`);
if (git('ls-remote', '--heads', 'origin', `refs/heads/${v}`)) fail(`branch ${v} already exists on origin`);

const mainVersions = withList([v, ...listed]);
const branchVersions = replace(
  mainVersions,
  versionsFile,
  "export const version: string = 'latest';",
  `export const version: string = '${v}';`,
);
let wrangler = readFileSync('wrangler.jsonc', 'utf8');
wrangler = replace(wrangler, 'wrangler.jsonc', /"name": "horus-docs"/, `"name": "${worker}"`);
wrangler = replace(wrangler, 'wrangler.jsonc', /"service": "horus-docs"/, `"service": "${worker}"`);

let created = false;
try {
  writeFileSync(versionsFile, mainVersions);
  git('commit', '-q', '-m', `docs: list ${v}`, '--', versionsFile);
  git('switch', '-q', '-c', v);
  created = true;
  writeFileSync(versionsFile, branchVersions);
  writeFileSync('wrangler.jsonc', wrangler);
  git('commit', '-q', '-m', `docs: cut ${v}`, '--', versionsFile, 'wrangler.jsonc');
  git('switch', '-q', 'main');
} catch (e) {
  rollback(created);
  throw e;
}

console.log(`main: listed ${v}\n${v}: worker ${worker}\nnext: git push origin ${v}, set up the worker (DEPLOYMENT.md), then git push origin main`);
