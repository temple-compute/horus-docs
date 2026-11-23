// Docs version of this branch: 'latest' on main, 'vX.Y' on a version branch.
// Set by scripts/cut-version.ts; see DEPLOYMENT.md.
export const version: string = 'latest';

// Cut versions, newest first. scripts/cut-version.ts edits this list on main.
export const versions: string[] = ['v0.12'];

export const isLatest = version === 'latest';
export const latestUrl = 'https://docs.templecompute.com';

// v0.12 -> v0-12, used in the host and the worker name.
export function versionSlug(v: string): string {
  return v.replace('.', '-');
}

export function versionUrl(v: string): string {
  return `https://${versionSlug(v)}.docs.templecompute.com`;
}

// Link to the same page on another version; /api/goto falls back to its home.
export function gotoUrl(base: string, pathname: string): string {
  return `${base}/api/goto?path=${encodeURIComponent(pathname)}`;
}
