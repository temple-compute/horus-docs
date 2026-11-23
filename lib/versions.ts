// Docs version of this branch: 'latest' on main, 'vX.Y' on a version branch.
// Set by scripts/cut-version.ts; see DEPLOYMENT.md.
export const version: string = 'latest';

// Cut versions, newest first. scripts/cut-version.ts adds to this list on main.
export const versions: string[] = [];

export const isLatest = version === 'latest';
export const latestUrl = 'https://docs.templecompute.com';

// v0.12 -> https://v0-12.docs.templecompute.com
export function versionUrl(v: string): string {
  return `https://${v.replace('.', '-')}.docs.templecompute.com`;
}
