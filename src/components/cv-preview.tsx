import type { Profile } from "@/lib/model/types";
import { skillGroupLines } from "@/lib/cv/presentation";
import { linkLabel, webUrl } from "@/lib/cv/links";

const dates = (s: string, e: string) => [s, e].filter(Boolean).join(" – ");

/** The CV as a document: single column, standard headings, the same structure as the Word export. */
function H({ children }: { children: string }) {
  return <h2 className="mb-2 mt-5 break-after-avoid border-b border-neutral-300 pb-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-neutral-700">{children}</h2>;
}

export function CvPreview({ cv }: { cv: Profile }) {
  const contact = [cv.email, cv.phone, cv.location].filter(Boolean);
  return (
    <article className="cv-sheet bg-white px-8 py-10 font-sans text-[13px] leading-snug text-neutral-900 print:p-0" aria-label="CV preview">
      <h1 className="text-2xl font-semibold tracking-tight">{cv.name}</h1>
      {cv.headline && <p className="mt-0.5 text-[15px] text-neutral-700">{cv.headline}</p>}
      {contact.length > 0 && <p className="mt-1 text-[12px] text-neutral-600">{contact.join("  |  ")}</p>}
      {cv.links.length > 0 && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#244f78]">{cv.links.map((value) => { const url = webUrl(value); return url ? <a key={value} href={url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{linkLabel(url)}</a> : <span key={value}>{value}</span>; })}</div>}

      {cv.summary && (
        <>
          <H>Summary</H>
          <p>{cv.summary}</p>
        </>
      )}
      {cv.skills.length > 0 && <><H>Skills</H>{skillGroupLines(cv) ? skillGroupLines(cv)!.map((g) => <p key={g.label}><span className="font-semibold">{g.label}:</span> {g.items}</p>) : <p>{cv.skills.join(", ")}</p>}</>}
      {cv.experience.length > 0 && (
        <>
          <H>Experience</H>
          {cv.experience.map((e) => (
            <section key={e.id} className="mb-3 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p>
                  <span className="font-semibold">{e.title}</span>
                  {e.company && <>, {e.company}</>}
                  {e.location && <span className="text-neutral-600">, {e.location}</span>}
                </p>
                <p className="text-[12px] text-neutral-600">{dates(e.start, e.end)}</p>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {e.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {cv.projects.length > 0 && (
        <>
          <H>Projects</H>
          {cv.projects.map((p) => (
            <section key={p.id} className="mb-4">
              <h3 className="font-semibold">{p.name}</h3>
              {webUrl(p.link) && <a href={webUrl(p.link)!} className="mt-0.5 block break-all text-[11px] font-normal text-[#244f78] underline" target="_blank" rel="noreferrer">{linkLabel(p.link)}</a>}
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {p.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {cv.education.length > 0 && (
        <>
          <H>Education</H>
          {cv.education.map((e) => (
            <section key={e.id} className="mb-2 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p>
                  <span className="font-semibold">{e.degree}</span>
                  {e.school && <>, {e.school}</>}
                </p>
                <p className="text-[12px] text-neutral-600">{dates(e.start, e.end)}</p>
              </div>
              {e.details.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {e.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
      {cv.certifications.length > 0 && (
        <>
          <H>Certifications</H>
          <ul className="list-disc space-y-0.5 pl-5">
            {cv.certifications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {cv.languages.length > 0 && (
        <>
          <H>Languages</H>
          <p>{cv.languages.join(", ")}</p>
        </>
      )}
    </article>
  );
}
