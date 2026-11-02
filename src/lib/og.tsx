import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/** One branded share-card layout for every public route, so titles stay readable and the brand stays consistent. */
export function ogImage({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#11131a", color: "#ffffff", padding: "72px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
        <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: "#4f6ef7", fontSize: 26, fontWeight: 800 }}>S</div>
        Shortlist Job Radar
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ color: "#9db0ff", fontSize: 28, fontWeight: 600 }}>{eyebrow}</div>
        <div style={{ maxWidth: 1000, fontSize: title.length > 48 ? 62 : 72, lineHeight: 1.08, letterSpacing: "-2.5px", fontWeight: 700 }}>{title}</div>
        <div style={{ maxWidth: 940, color: "#b8bdcf", fontSize: 30, lineHeight: 1.35 }}>{subtitle}</div>
      </div>
      <div style={{ color: "#9aa3c7", fontSize: 24 }}>Find jobs that fit your CV · Tailor truthfully · Track · Prepare</div>
    </div>,
    OG_SIZE,
  );
}
