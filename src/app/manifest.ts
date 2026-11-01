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
    theme_color: "#2f5bea",
    categories: ["business", "productivity"],
    lang: "en",
    icons: [
      { src: "/shortlist-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/shortlist-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
