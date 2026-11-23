/**
 * Cut a docs version at a horus-runtime minor release. See DEPLOYMENT.md.
 *
 *   bun scripts/cut-version.ts 0.12
 *
 * On a clean main: adds v0.12 to the version list and commits, then creates
 * branch v0.12 with `version` set and the worker renamed to horus-docs-v0-12.
 * Does not push.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }).trim();

const arg = process.argv[2] ?? '';
if (!/^\d+\.\d+$/.test(arg)) {
  console.error('usage: bun scripts/cut-version.ts <major.minor>, e.g. 0.12');
  process.exit(1);
}
const v = `v${arg}`;
const worker = `horus-docs-${v.replace('.', '-')}`;

if (git('branch', '--show-current') !== 'main') throw new Error('checkout main first');
if (git('status', '--porcelain')) throw new Error('working tree not clean');
if (git('branch', '--list', v)) throw new Error(`branch ${v} already exists`);

// Replace exactly one occurrence, or fail loudly if the file layout changed.
function edit(file: string, from: string | RegExp, to: string) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(from, to);
  if (out === src) throw new Error(`${file}: no match for ${from}`);
  writeFileSync(file, out);
}

const versionsFile = 'lib/versions.ts';
const listRe = /export const versions: string\[\] = \[(.*)\];/;
const list = readFileSync(versionsFile, 'utf8').match(listRe)?.[1];
if (list === undefined) throw new Error(`${versionsFile}: versions list not found`);
if (list.includes(`'${v}'`)) throw new Error(`${v} already listed`);

edit(versionsFile, listRe, `export const versions: string[] = ['${v}'${list.trim() ? `, ${list.trim()}` : ''}];`);
git('commit', '-q', '-m', `docs: list ${v}`, '--', versionsFile);

git('switch', '-q', '-c', v);
edit(versionsFile, "export const version: string = 'latest';", `export const version: string = '${v}';`);
edit('wrangler.jsonc', /"name": "horus-docs"/, `"name": "${worker}"`);
edit('wrangler.jsonc', /"service": "horus-docs"/, `"service": "${worker}"`);
git('commit', '-q', '-m', `docs: cut ${v}`, '--', versionsFile, 'wrangler.jsonc');
git('switch', '-q', 'main');

console.log(`main: listed ${v}\n${v}: worker ${worker}\nnext: git push origin main ${v}`);
