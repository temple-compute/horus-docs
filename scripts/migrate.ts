/**
 * One-shot migration: Docusaurus `docs/` -> Fumadocs `content/docs/`.
 *
 *   bun run scripts/migrate.ts
 *
 * - preserves every published URL (see build-parity list)
 * - rewrites internal `.md`/`.mdx` links to absolute site paths (+ anchors)
 * - converts `<Tabs>/<TabItem>` to Fumadocs `<Tabs items>/<Tab>`
 * - drops now-global MDX imports (Tabs / DownloadButton)
 * - strips Docusaurus-only frontmatter keys
 * Meta files (meta.json) and asset copies are handled separately.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = 'docs';
const OUT = 'content/docs';

// Explicit file moves (URL preservation). Everything else keeps its path.
const MOVES: Record<string, string> = {
  'intro.md': 'index.mdx',
  'sdk/logging.md': 'sdk/logger.md',
  'sdk/plugin-system/auto-registry/autoregistry.md': 'sdk/plugin-system/autoregistry.md',
  'sdk/plugin-system/auto-registry/auto_registry_product.md':
    'sdk/plugin-system/auto-registry-product.md',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function parseFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: text };
  const fm: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].replace(/^["']|["']$/g, '').trim();
  }
  return { fm, body: text.slice(m[0].length) };
}

const allFiles = walk(SRC).filter((f) => /\.mdx?$/.test(f));

// Build old-path (without extension) -> published URL map.
const urlMap = new Map<string, string>();
function urlFor(rel: string, fm: Record<string, string>): string {
  if (fm.slug) return fm.slug.startsWith('/') ? fm.slug : '/' + fm.slug;
  const dir = path.dirname(rel);
  const base = path.basename(rel).replace(/\.mdx?$/, '');
  if (base === 'index') return dir === '.' ? '/' : '/' + dir;
  const seg = fm.id ?? base;
  return dir === '.' ? '/' + seg : '/' + dir + '/' + seg;
}
for (const f of allFiles) {
  const rel = path.relative(SRC, f);
  const { fm } = parseFrontmatter(readFileSync(f, 'utf8'));
  const url = urlFor(rel, fm);
  const key = rel.replace(/\.mdx?$/, '');
  urlMap.set(key, url);
  if (path.basename(key) === 'index') urlMap.set(path.dirname(key), url); // dir alias
}

function rewriteLinks(body: string, fromRel: string): string {
  const fromDir = path.dirname(fromRel);
  return body.replace(/\]\(([^)]+?)\)/g, (whole, target: string) => {
    // Only touch relative links ending in .md/.mdx (optionally with #anchor).
    const m = target.match(/^([^#?]+\.mdx?)(#[^)]*)?$/);
    if (!m) return whole;
    const rawPath = m[1];
    const anchor = m[2] ?? '';
    if (/^(https?:|\/)/.test(rawPath)) return whole; // absolute / external
    const resolved = path.posix.normalize(path.posix.join(fromDir, rawPath)).replace(/\.mdx?$/, '');
    const url = urlMap.get(resolved);
    if (!url) {
      console.warn(`  ! unresolved link in ${fromRel}: ${target}`);
      return whole;
    }
    return `](${url}${anchor})`;
  });
}

// Map Docusaurus admonition types onto Fumadocs `<Callout>` types.
const CALLOUT_TYPE: Record<string, string> = {
  note: 'info',
  info: 'info',
  important: 'info',
  tip: 'success',
  success: 'success',
  warning: 'warn',
  caution: 'warn',
  danger: 'error',
  error: 'error',
};

// Render an admonition title (which may contain `inline code`) as a JSX-safe
// `title=` attribute, preserving code spans.
function titleAttr(raw: string): string {
  const title = raw.trim();
  if (!title) return '';
  if (!title.includes('`')) return ` title=${JSON.stringify(title)}`;
  const esc = (s: string) =>
    s.replace(/[<>{}]/g, (c) => `{'${c}'}`);
  const jsx = title
    .split(/`([^`]+)`/g)
    .map((part, i) => (i % 2 ? `<code>${esc(part)}</code>` : esc(part)))
    .join('');
  return ` title={<>${jsx}</>}`;
}

// Convert Docusaurus `:::type Title \n body \n :::` blocks to `<Callout>`.
function convertAdmonitions(body: string): string {
  return body.replace(
    /^:::([a-zA-Z]+)[^\S\n]*(.*)$\n([\s\S]*?)^:::[^\S\n]*$/gm,
    (_whole, rawType: string, rawTitle: string, inner: string) => {
      const type = CALLOUT_TYPE[rawType.toLowerCase()] ?? 'info';
      const body = inner.replace(/\s+$/, '');
      return `<Callout type="${type}"${titleAttr(rawTitle)}>\n\n${body}\n\n</Callout>`;
    },
  );
}

function convertTabs(body: string): string {
  return body.replace(/<Tabs>([\s\S]*?)<\/Tabs>/g, (_whole, inner: string) => {
    const labels: string[] = [];
    let converted = inner.replace(
      /<TabItem\b([^>]*)>/g,
      (_t, attrs: string) => {
        const lm = attrs.match(/label=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
        const label = (lm?.[1] ?? lm?.[2] ?? lm?.[3] ?? '').trim();
        labels.push(label);
        return `<Tab value=${JSON.stringify(label)}>`;
      },
    );
    converted = converted.replace(/<\/TabItem>/g, '</Tab>');
    const items = '[' + labels.map((l) => JSON.stringify(l)).join(', ') + ']';
    return `<Tabs items={${items}}>${converted}</Tabs>`;
  });
}

function stripImports(body: string): string {
  return body
    .split('\n')
    .filter(
      (l) =>
        !/^\s*import\s+.*(@theme\/Tabs|@theme\/TabItem|@site\/src\/components\/DownloadButton)/.test(
          l,
        ),
    )
    .join('\n')
    // collapse the blank gap left where the import block used to be
    .replace(/^(---\n[\s\S]*?\n---\n)\n{2,}/, '$1\n');
}

function cleanFrontmatter(text: string): string {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return text;
  const DROP = new Set(['sidebar_position', 'id', 'slug', 'sidebar_label']);
  const kept = m[1]
    .split('\n')
    .filter((line) => {
      const key = line.match(/^([A-Za-z0-9_]+):/)?.[1];
      return !key || !DROP.has(key);
    });
  return `---\n${kept.join('\n')}\n---\n` + text.slice(m[0].length);
}

let count = 0;
for (const f of allFiles) {
  const rel = path.relative(SRC, f);
  const newRel = MOVES[rel] ?? rel;
  let text = readFileSync(f, 'utf8');
  text = cleanFrontmatter(text);
  const { body } = parseFrontmatter(text);
  const head = text.slice(0, text.length - body.length);
  let out = stripImports(
    head + convertAdmonitions(convertTabs(rewriteLinks(body, rel))),
  );
  // Emit everything as `.mdx` so JSX components (Callout / Tabs / DownloadButton)
  // are parsed as MDX. `.md` is compiled as plain CommonMark by fumadocs-mdx and
  // would leak component tags as text. Extension does not affect the URL.
  const dest = path.join(OUT, newRel).replace(/\.md$/, '.mdx');
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  count++;
}
console.log(`Migrated ${count} docs -> ${OUT}`);
