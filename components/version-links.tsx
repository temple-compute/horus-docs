'use client';
import { usePathname } from 'fumadocs-core/framework';
import { useEffect, useState } from 'react';
import { gotoUrl, isLatest, latestUrl, version, versions, versionUrl } from '@/lib/versions';

// Old versions read the list from latest, so versions cut or retired after
// them are current. Fetched once per page load; the built-in list is the fallback.
let fetched: string[] | undefined;
let pending: Promise<string[]> | undefined;

function loadVersions(): Promise<string[]> {
  pending ??= fetch(`${latestUrl}/api/versions`)
    .then((res) => res.json())
    .then((data: unknown) =>
      Array.isArray(data) && data.every((v) => typeof v === 'string' && /^v\d+\.\d+$/.test(v)) ? data : versions,
    )
    .catch(() => versions)
    .then((list) => (fetched = list));
  return pending;
}

// The version being viewed is always listed, also before latest lists it and after it is retired.
function withCurrent(list: string[]): string[] {
  if (isLatest || list.includes(version)) return list;
  return [...list, version].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

function useVersions(): string[] {
  const [list, setList] = useState(() => fetched ?? versions);
  useEffect(() => {
    if (!isLatest) loadVersions().then(setList);
  }, []);
  return withCurrent(list);
}

export function LatestLink() {
  // Mounted with the banner, so the list is ready before the menu opens.
  useEffect(() => {
    loadVersions();
  }, []);
  return (
    <a href={gotoUrl(latestUrl, usePathname())} className="underline">
      Latest
    </a>
  );
}

export function VersionLinks() {
  const pathname = usePathname();
  const current = isLatest ? 'Latest' : version;

  return [['Latest', latestUrl], ...useVersions().map((v) => [v, versionUrl(v)])].map(([text, base]) => (
    <a
      key={text}
      href={gotoUrl(base, pathname)}
      aria-current={text === current ? 'page' : undefined}
      className="flex items-center rounded-lg p-2 ps-5 text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none aria-[current=page]:bg-fd-primary/10 aria-[current=page]:text-fd-primary"
    >
      {text}
    </a>
  ));
}
