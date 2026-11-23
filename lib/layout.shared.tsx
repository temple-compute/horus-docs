import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Logotype } from '@/components/logotype';
import { VersionLinks } from '@/components/version-links';
import { appName, gitConfig } from './shared';
import { isLatest, version, versions } from './versions';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logotype />,
      transparentMode: 'top',
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: versions.length
      ? [
          {
            type: 'menu',
            text: isLatest ? 'Latest' : version,
            items: [{ type: 'custom', children: <VersionLinks /> }],
          },
        ]
      : [],
  };
}

export { appName };
