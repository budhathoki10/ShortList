import { ATS_LABELS, type AtsLevel } from "@/lib/templates/checks";

const TONES: Record<AtsLevel, string> = {
  safe: "bg-success-soft text-success",
  mostly: "bg-sunken text-foreground",
  caution: "bg-warning-soft text-warning ring-1 ring-inset ring-notice-border",
};

export function AtsBadge({ level }: { level: AtsLevel }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[level]}`}>{ATS_LABELS[level]}</span>;
}

/** A built-in template's pre-rendered first page (see `npm run templates:thumbs`). */
/** `decorative` when the image sits inside a link or button that already says which template it is. */
export function TemplateThumb({ id, name, className = "", decorative = false }: { id: string; name: string; className?: string; decorative?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized WebP thumbnails
    <img
      src={`/template-thumbs/${id}.webp`}
      alt={decorative ? "" : `${name} template`}
      loading="lazy"
      decoding="async"
      width={480}
      height={679}
      className={`aspect-[210/297] w-full bg-paper object-cover object-top ${className}`}
    />
  );
}
