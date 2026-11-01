"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "unpdf/pdfjs";

/** Render the real uploaded pages. No HTML reconstruction, font substitution or edited download. */
export function OriginalPdfPreview() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof import("unpdf/pdfjs").getDocument> | undefined;
    const controller = new AbortController();
    void (async () => {
      const [{ getDocument }, response] = await Promise.all([
        import("unpdf/pdfjs"),
        fetch("/app/download/original?inline=1", { signal: controller.signal, cache: "no-store" }),
      ]);
      if (!response.ok) throw new Error("Original unavailable");
      const data = new Uint8Array(await response.arrayBuffer());
      if (!active) return;
      // Embedded glyph outlines avoid browser font substitution and extra font requests.
      task = getDocument({ data, disableFontFace: true, useSystemFonts: false });
      const document = await task.promise;
      if (active) setPdf(document);
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; controller.abort(); void task?.destroy(); };
  }, []);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    setReady(false);
    void (async () => {
      const source = await pdf.getPage(page);
      if (!active || !canvas.current) return;
      const base = source.getViewport({ scale: 1 });
      const viewport = source.getViewport({ scale: Math.min(1.6, 1800 / Math.max(base.width, base.height)) });
      const target = canvas.current;
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      render = source.render({ canvas: target, viewport });
      await render.promise;
      if (active) setReady(true);
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; render?.cancel(); };
  }, [pdf, page]);

  if (error) return <p role="status" className="text-sm text-muted">The inline preview is unavailable. Use “Open original PDF” to review the exact file in your PDF viewer.</p>;
  return (
    <div className="space-y-3" aria-label="Original PDF preview">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <button type="button" disabled={page <= 1 || !ready} onClick={() => setPage((p) => p - 1)} className="min-h-10 rounded-md border border-border px-3 hover:bg-surface-hover disabled:opacity-40">Previous page</button>
        <p role="status">{pdf ? `Page ${page} of ${pdf.numPages}` : "Loading original PDF…"}</p>
        <button type="button" disabled={!pdf || page >= pdf.numPages || !ready} onClick={() => setPage((p) => p + 1)} className="min-h-10 rounded-md border border-border px-3 hover:bg-surface-hover disabled:opacity-40">Next page</button>
      </div>
      {!ready && <p className="py-6 text-center text-sm text-muted">Loading page…</p>}
      <canvas ref={canvas} role="img" aria-label={`Original PDF page ${page} of ${pdf?.numPages ?? "?"}`} data-rendered={ready} className={`h-auto w-full rounded-md border border-border bg-white ${ready ? "block" : "hidden"}`} />
    </div>
  );
}
