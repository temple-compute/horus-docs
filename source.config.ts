import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';

// Docs collection. Frontmatter (title/description/…) uses the default page
// schema; `meta.json` files use the default meta schema. Docusaurus admonitions
// are converted to `<Callout>` at migration time (see scripts/migrate.ts), so
// no runtime remark plugin is needed here.
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig();
