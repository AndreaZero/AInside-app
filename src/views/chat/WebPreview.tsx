export function WebPreview({
  doc,
  url,
  frameKey = 0,
}: {
  doc?: string | null;
  url?: string | null;
  frameKey?: number;
}) {
  if (url) {
    return (
      <iframe
        key={`${url}:${frameKey}`}
        className="web-preview-frame"
        title="Pagina locale"
        src={url}
        sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups"
      />
    );
  }
  if (!doc) return null;
  return (
    <iframe
      className="web-preview-frame"
      title="Anteprima nel browser"
      sandbox="allow-scripts allow-forms"
      srcDoc={doc}
    />
  );
}
