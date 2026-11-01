import type { SVGProps } from "react";

/** Small stroke icons (24px grid, drawn at 16px). Decorative: callers label the control, not the icon. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const icons = {
  today: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </Icon>
  ),
  jobs: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </Icon>
  ),
  radar: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Icon>
  ),
  cv: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" />
    </Icon>
  ),
  studio: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </Icon>
  ),
  progress: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />
    </Icon>
  ),
  settings: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
    </Icon>
  ),
  billing: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M2 10h20" />
    </Icon>
  ),
  search: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  ),
  plus: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M5 12h14M12 5v14" />
    </Icon>
  ),
  menu: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  ),
  close: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  ),
  download: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </Icon>
  ),
  logout: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Icon>
  ),
  keyboard: (p: SVGProps<SVGSVGElement>) => (
    <Icon {...p}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 16h8" />
    </Icon>
  ),
};

export type IconName = keyof typeof icons;

/** Named stroke icons for the CV Studio screens (24px grid). */
const STUDIO_PATHS = {
  studio: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8",
  check: "M5 12.5l4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6 6 18",
  chevron: "M9 6l6 6-6 6",
  undo: "M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  redo: "M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h2",
  photo: "M4 6h16v13H4zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM20 16l-5-5-8 8",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
} as const;

export type StudioIconName = keyof typeof STUDIO_PATHS;

export function StudioIcon({ name, size = 18, ...props }: { name: StudioIconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={STUDIO_PATHS[name]} />
    </svg>
  );
}
