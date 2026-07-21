import { Download } from 'lucide-react';

/**
 * A small download button for example files served from `public/examples/`.
 *
 * Usage in MDX (registered globally, no import needed):
 *   <DownloadButton file="hello.yaml" />
 *
 * `file` is resolved against `/examples/`.
 */
export function DownloadButton({ file, label }: { file: string; label?: string }) {
  const safeFile = file.split(/[\\/]/).pop() ?? file;
  return (
    <a
      href={`/examples/${safeFile}`}
      download
      className="not-prose mb-4 inline-flex items-center gap-2 rounded-md bg-fd-primary px-3 py-1.5 text-sm font-medium text-fd-primary-foreground no-underline transition-opacity hover:opacity-90"
    >
      <Download className="size-4" aria-hidden />
      {label ?? `Download ${file}`}
    </a>
  );
}
