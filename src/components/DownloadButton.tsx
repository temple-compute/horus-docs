import React from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";

/**
 * A small download button for example files served from `static/`.
 *
 * Usage in MDX:
 *   import DownloadButton from "@site/src/components/DownloadButton";
 *   <DownloadButton file="hello.yaml" />
 *
 * `file` is resolved against `/examples/` and the site baseUrl.
 */
export default function DownloadButton({
  file,
  label,
}: {
  file: string;
  label?: string;
}): React.ReactElement {
  const safeFile = file.split(/[\\/]/).pop() ?? file;
  const href = useBaseUrl(`/examples/${safeFile}`);
  return (
    <a
      className="button button--primary button--sm"
      href={href}
      download
      style={{ marginBottom: "1rem", display: "inline-block" }}
    >
      ⬇ {label ?? `Download ${file}`}
    </a>
  );
}
