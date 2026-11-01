import type { CSSProperties, ReactNode } from "react";
import { labelFor, linkParts, shortUrl, webUrl } from "@/lib/cv/links";
import type { Profile } from "@/lib/model/types";
import { skillGroupLines } from "@/lib/cv/presentation";
import { fontStack } from "@/lib/templates/fonts";
import { hasSidebar, PAGE_MM, SECTION_LABELS, type SectionId, type TemplateSpec } from "@/lib/templates/spec";
import "./cv.css";

/**
 * The one CV renderer. Every template (built-in or the user's own) is a spec; this turns spec +
 * profile into the document used for previews, thumbnails and the print/PDF page. HTML order is
 * the reading order (header, main column, side column) so applicant tracking systems read it
 * correctly; CSS only moves things on screen. Styling comes from validated spec values only.
 */

const dates = (start: string, end: string) => [start, end].filter(Boolean).join(" – ");

function cssVars(spec: TemplateSpec): CSSProperties {
  const page = PAGE_MM[spec.page.size];
  return {
    "--cv-ink": spec.palette.ink,
    "--cv-accent": spec.palette.accent,
    "--cv-muted": spec.palette.muted,
    "--cv-rule": spec.palette.rule,
    "--cv-panel": spec.palette.panel,
    "--cv-panel-ink": spec.palette.panelInk,
    "--cv-font-heading": fontStack(spec.fonts.heading),
    "--cv-font-body": fontStack(spec.fonts.body),
    "--cv-fs": `${spec.density.fontSize}pt`,
    "--cv-lh": spec.density.lineHeight,
    "--cv-gap": `${spec.density.sectionGap}pt`,
    "--cv-margin": `${spec.page.margin}mm`,
    "--cv-page-w": `${page.w}mm`,
    "--cv-page-h": `${page.h}mm`,
    "--cv-side-w": `${spec.sidebarWidth}%`,
    "--cv-name": `${spec.header.nameSize}pt`,
  } as CSSProperties;
}

/** @page can't read CSS variables, so the print rule is written from the (validated) numbers. */
export function printPageCss(spec: TemplateSpec) {
  const m = `${spec.page.margin}mm`;
  const fullBleed = hasSidebar(spec.layout) || spec.layout === "banner";
  return fullBleed
    ? `@page { size: ${spec.page.size}; margin: ${m} 0; } @page :first { margin-top: 0; }`
    : `@page { size: ${spec.page.size}; margin: ${m}; }`;
}

function Heading({ id, children }: { id: SectionId; children: ReactNode }) {
  return (
    <h2 className="cv-h" id={`cv-${id}`}>
      <span>{children}</span>
    </h2>
  );
}

function Entry({ title, sub, subJoin = ", ", place, when, children }: { title: string; sub?: ReactNode; subJoin?: string; place?: string; when: string; children?: ReactNode }) {
  return (
    <div className="cv-entry">
      {when && <p className="cv-when">{when}</p>}
      <div className="cv-entry-body">
        <p className="cv-entry-title">
          <strong>{title}</strong>
          {sub && <span className="cv-sub">{title ? subJoin : ""}{sub}</span>}
          {place && <span className="cv-place">, {place}</span>}
        </p>
        {children}
      </div>
    </div>
  );
}

function Bullets({ items, labels }: { items: string[]; labels?: Record<string, string> }) {
  if (!items.length) return null;
  return (
    <ul className="cv-list">
      {items.map((b, i) => (
        <li key={i}>
          <LinkedText text={b} labels={labels} />
        </li>
      ))}
    </ul>
  );
}

function Words({ items, style }: { items: string[]; style: TemplateSpec["skillsStyle"] }) {
  if (style === "inline") return <p className="cv-words">{items.join(", ")}</p>;
  return (
    <ul className={`cv-words cv-words-${style}`}>
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

function hasContent(cv: Profile, id: SectionId) {
  switch (id) {
    case "summary":
      return Boolean(cv.summary.trim());
    default:
      return cv[id].length > 0;
  }
}

function Section({ id, cv, spec }: { id: SectionId; cv: Profile; spec: TemplateSpec }) {
  const body = (() => {
    switch (id) {
      case "summary":
        return <p className="cv-summary">{cv.summary}</p>;
      case "experience":
        return cv.experience.map((e) => (
          <Entry key={e.id} title={e.title} sub={e.company} place={e.location} when={dates(e.start, e.end)}>
            <Bullets items={e.bullets} />
          </Entry>
        ));
      case "projects":
        return cv.projects.map((p) => (
          <Entry key={p.id} title={p.name} sub={p.link ? <CvLink value={p.link} labels={cv.linkLabels} /> : undefined} subJoin={labelFor(p.link, cv.linkLabels) ? " " : ", "} when="">
            <Bullets items={p.bullets} />
          </Entry>
        ));
      case "education":
        return cv.education.map((e) => (
          <Entry key={e.id} title={e.degree} sub={e.school} when={dates(e.start, e.end)}>
            <Bullets items={e.details} />
          </Entry>
        ));
      case "skills":
        return skillGroupLines(cv) ? (
          <div className="cv-skill-groups">
            {skillGroupLines(cv)!.map((g) => (
              <p key={g.label} className="cv-words">
                <strong>{g.label}:</strong> {g.items}
              </p>
            ))}
          </div>
        ) : (
          <Words items={cv.skills} style={spec.skillsStyle} />
        );
      case "languages":
        return <Words items={cv.languages} style={spec.skillsStyle === "tags" ? "tags" : "inline"} />;
      case "certifications":
        return <Bullets items={cv.certifications} labels={cv.linkLabels} />;
    }
  })();
  return (
    <section className={`cv-section cv-section-${id}`} aria-labelledby={`cv-${id}`}>
      <Heading id={id}>{SECTION_LABELS[id]}</Heading>
      <div className="cv-section-body">{body}</div>
    </section>
  );
}

function Contact({ cv }: { cv: Profile }) {
  const items = [cv.email, cv.phone, cv.location, ...cv.links].filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="cv-contact">
      {items.map((c, i) => (
        <li key={i}>
          <CvLink value={c} labels={cv.linkLabels} />
        </li>
      ))}
    </ul>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * An email or web address, as a real link (clickable in the saved PDF too). It shows the word the link sat on in the
 * original CV ("LinkedIn", "Live") when one was recorded, otherwise the short address ("linkedin.com/in/asha").
 */
function CvLink({ value, labels }: { value: string; labels?: Record<string, string> }) {
  if (EMAIL.test(value)) return <a href={`mailto:${value}`}>{breakable(value)}</a>;
  const url = webUrl(value);
  if (!url) return <>{breakable(value)}</>;
  return <a href={url}>{labelFor(url, labels) ?? breakable(shortUrl(url))}</a>;
}

/** Text with addresses in brackets ("… Certificate (https://…)"), shown with those addresses as links. */
function LinkedText({ text, labels }: { text: string; labels?: Record<string, string> }) {
  if (!text.includes("://")) return <>{text}</>;
  return (
    <>
      {linkParts(text, labels).map((part, i) =>
        part.url ? (
          <a key={i} href={part.url}>
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Lets long emails and links wrap at "@" and "/" in narrow columns instead of mid-word. */
function breakable(text: string): ReactNode {
  const parts = text.split(/(?=[@/])/);
  return parts.length === 1 ? text : parts.map((p, i) => (i ? [<wbr key={i} />, p] : p));
}

export function CvDocument({
  spec,
  cv,
  photoUrl,
  className = "",
  label = "CV preview",
  titleLevel = 2,
  children,
}: {
  spec: TemplateSpec;
  cv: Profile;
  photoUrl?: string | null;
  className?: string;
  label?: string;
  /** 1 only where the CV is the whole page (print view). Inside the app it is not a heading, so pages keep a single h1. */
  titleLevel?: 1 | 2;
  /** Extra content after the header in the main column (a cover letter's body). */
  children?: ReactNode;
}) {
  const sidebar = hasSidebar(spec.layout);
  const sections = cv.sectionOrder ? [...spec.sections].sort((a, b) => cv.sectionOrder!.indexOf(a.id) - cv.sectionOrder!.indexOf(b.id)) : spec.sections;
  const shown = sections.filter((s) => s.visible && hasContent(cv, s.id));
  const main = shown.filter((s) => !sidebar || s.column === "main");
  const side = sidebar ? shown.filter((s) => s.column === "side") : [];
  const photo = spec.photo !== "off" && photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- a private, per-user image; next/image would cache it
    <img className="cv-photo" src={photoUrl} alt="" />
  ) : null;

  return (
    <article
      className={`cv ${className}`}
      aria-label={label}
      data-layout={spec.layout}
      data-heading={spec.headingStyle}
      data-bullets={spec.bullets}
      data-dates={spec.dateStyle}
      data-align={spec.header.align}
      data-name-case={spec.header.nameCase}
      data-photo={photo ? spec.photo : "off"}
      style={cssVars(spec)}
    >
      <header className="cv-head">
        {!sidebar && photo}
        <div className="cv-id">
          {titleLevel === 1 ? <h1 className="cv-name">{cv.name || "Your name"}</h1> : <p className="cv-name">{cv.name || "Your name"}</p>}
          {cv.headline && <p className="cv-headline">{cv.headline}</p>}
        </div>
        {!sidebar && <Contact cv={cv} />}
      </header>
      <div className="cv-main">
        {children}
        {main.map((s) => (
          <Section key={s.id} id={s.id} cv={cv} spec={spec} />
        ))}
      </div>
      {sidebar && (
        <aside className="cv-side" aria-label="Contact and skills">
          {photo}
          <section className="cv-section cv-section-contact" aria-labelledby="cv-contact">
            <h2 className="cv-h" id="cv-contact">
              <span>Contact</span>
            </h2>
            <Contact cv={cv} />
          </section>
          {side.map((s) => (
            <Section key={s.id} id={s.id} cv={cv} spec={spec} />
          ))}
        </aside>
      )}
    </article>
  );
}
