import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shortlist Job Radar — Job Search and Application Toolkit",
    short_name: "Job Radar",
    description: "Find jobs that match your CV, tailor applications truthfully, track progress and prepare for interviews.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fb",
    theme_color: "#11131a",
    categories: ["business", "productivity", "jobs"],
    lang: "en",
    icons: [
      { src: "/icons/icon-48.png", sizes: "48x48", type: "image/png", purpose: "any" },
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icons/icon-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/shortlist-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Job Radar matches", short_name: "Radar", url: "/app/radar", icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "CV Studio", short_name: "CV Studio", url: "/app/studio", icons: [{ src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
