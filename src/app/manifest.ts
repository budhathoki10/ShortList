import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shortlist Job Radar",
    short_name: "Shortlist",
    description: "Evidence-first job discovery and application preparation.",
    start_url: "/app/radar",
    display: "standalone",
    background_color: "#f7f8fb",
    theme_color: "#2f5bea",
    icons: [{ src: "/shortlist-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
