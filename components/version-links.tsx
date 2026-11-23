'use client';
import { usePathname } from 'fumadocs-core/framework';
import { useEffect, useState } from 'react';
import { gotoUrl, isLatest, latestUrl, versions, versionUrl } from '@/lib/versions';

export function LatestLink() {
  return (
    <a href={gotoUrl(latestUrl, usePathname())} className="underline">
      Latest
    </a>
  );
}

// Menu items. Old versions fetch the list from latest, so retired and newer
// versions are current; the built-in list is the fallback.
export function VersionLinks() {
  const pathname = usePathname();
  const [list, setList] = useState(versions);

  useEffect(() => {
    if (isLatest) return;
    fetch(`${latestUrl}/api/versions`)
      .then((res) => res.json())
      .then((data: unknown) => {
        if (Array.isArray(data) && data.every((v) => typeof v === 'string' && /^v\d+\.\d+$/.test(v))) setList(data);
      })
      .catch(() => {});
  }, []);

  return [['Latest', latestUrl], ...list.map((v) => [v, versionUrl(v)])].map(([text, base]) => (
    <a
      key={text}
      href={gotoUrl(base, pathname)}
      className="flex items-center rounded-lg p-2 ps-5 text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none"
    >
      {text}
    </a>
  ));
}
