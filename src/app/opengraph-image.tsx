import { ImageResponse } from "next/og";

export const alt = "Shortlist Job Radar — find jobs that fit, then tailor every application truthfully";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#11131a", color: "#ffffff", padding: "72px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
        <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: "#4f6ef7", fontSize: 26, fontWeight: 800 }}>S</div>
        Shortlist Job Radar
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ maxWidth: 950, fontSize: 72, lineHeight: 1.06, letterSpacing: "-3px", fontWeight: 700 }}>Find jobs that fit. Tailor every application.</div>
        <div style={{ maxWidth: 900, color: "#b8bdcf", fontSize: 30, lineHeight: 1.35 }}>CV-based job discovery, truthful tailoring, application tracking and interview preparation.</div>
      </div>
      <div style={{ color: "#9aa3c7", fontSize: 24 }}>Shortlist Job Radar · job search without made-up experience</div>
    </div>,
    size,
  );
}
