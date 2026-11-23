import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Logotype } from '@/components/logotype';
import { appName, gitConfig } from './shared';
import { isLatest, latestUrl, version, versions, versionUrl } from './versions';

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
            items: [
              { text: 'Latest', url: latestUrl, active: 'none' },
              ...versions.map((v) => ({ text: v, url: versionUrl(v), active: 'none' as const })),
            ],
          },
        ]
      : [],
  };
}

export { appName };
