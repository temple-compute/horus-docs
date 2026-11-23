import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { Banner } from 'fumadocs-ui/components/banner';
import { baseOptions } from '@/lib/layout.shared';
import { isLatest, latestUrl, version } from '@/lib/versions';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <>
      {!isLatest && (
        <Banner>
          You are viewing docs for {version}.&nbsp;
          <a href={latestUrl} className="underline">
            Latest
          </a>
        </Banner>
      )}
      <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
        {children}
      </DocsLayout>
    </>
  );
}
