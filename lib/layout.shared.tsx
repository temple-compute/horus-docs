import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Logotype } from '@/components/logotype';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logotype />,
      transparentMode: 'top',
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}

export { appName };
