import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { Banner } from 'fumadocs-ui/components/banner';
import { baseOptions } from '@/lib/layout.shared';
import { LatestLink } from '@/components/version-links';
import { isLatest, version } from '@/lib/versions';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <>
      {!isLatest && (
        <Banner>
          You are viewing docs for {version}.{' '}
          <LatestLink />
        </Banner>
      )}
      <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
        {children}
      </DocsLayout>
    </>
  );
}
