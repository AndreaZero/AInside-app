export function WebPreview({ doc }: { doc: string }) {
  return (
    <iframe
      className="web-preview-frame"
      title="Anteprima nel browser"
      sandbox="allow-scripts allow-forms"
      srcDoc={doc}
    />
  );
}
