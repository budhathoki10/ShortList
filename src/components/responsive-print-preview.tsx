"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Scales a fixed-size print document to the available screen width without changing print output. */
export function ResponsivePrintPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ height: 0, scale: 0, x: 0 });

  useLayoutEffect(() => {
    const host = outer.current;
    const page = inner.current;
    if (!host || !page) return;
    const measure = () => {
      const width = page.offsetWidth;
      const scale = width ? Math.min(1, host.clientWidth / width) : 1;
      setFrame({ height: page.offsetHeight * scale, scale, x: Math.max(0, (host.clientWidth - width * scale) / 2) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outer} className="print-preview relative w-full overflow-hidden print:overflow-visible" style={{ height: frame.height || undefined }}>
      <div
        ref={inner}
        className="print-preview-inner absolute left-0 top-0 w-fit origin-top-left print:static"
        style={{ transform: `translateX(${frame.x}px) scale(${frame.scale || 0.0001})`, visibility: frame.scale ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}
