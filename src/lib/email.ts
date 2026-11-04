import "server-only";
import { appendFile } from "node:fs/promises";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Defaults to EMAIL_FROM. */
  from?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  /** Provider-level duplicate protection for retryable transactional sends. */
  idempotencyKey?: string;
};

/** Resend's API, overridable so tests can point at a fake. */
export const resendApiBase = () => (process.env.RESEND_API_BASE ?? "https://api.resend.com").replace(/\/$/, "");

/**
 * Send an email through Resend (https://resend.com/docs/api-reference/emails/send-email) and return
 * its id. Without RESEND_API_KEY, emails are appended to EMAIL_DEV_OUTBOX (JSON lines) for local
 * development and tests, so links in them can still be followed.
 */
export async function sendEmail(email: Email): Promise<{ id: string | null }> {
  const from = email.from ?? process.env.EMAIL_FROM ?? "Shortlist Job Radar <onboarding@resend.dev>";
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const res = await fetch(`${resendApiBase()}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey.slice(0, 256) } : {}) },
      body: JSON.stringify({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        reply_to: email.replyTo,
        headers: email.headers,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend failed (${res.status}): ${await res.text().catch(() => "")}`);
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: body.id ?? null };
  }
  const outbox = process.env.EMAIL_DEV_OUTBOX;
  if (outbox) {
    await appendFile(outbox, `${JSON.stringify({ ...email, from, sentAt: new Date().toISOString() })}\n`);
    return { id: null };
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(`Email not sent (RESEND_API_KEY is not set): "${email.subject}"`);
  } else {
    console.info(`[dev email] From: ${from}\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}`);
  }
  return { id: null };
}

/** HTML-escape text before it goes into an email body. Names are chosen by whoever signs up, so they can't be trusted as markup. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type JobMatchLine = { state: string; title: string; company: string; location: string; reason: string | null; warning: string | null; url: string };

const STATE_ORDER = ["Ready to apply", "Strong stretch", "Verify first", "Blocked"];
const STATE_NOTE: Record<string, string> = {
  "Ready to apply": "Your CV covers what the posting asks for and nothing we found rules you out.",
  "Strong stretch": "Worth applying for, with a few requirements your CV doesn't show yet.",
  "Verify first": "A good fit on paper, but one detail (such as eligibility or location) needs your confirmation before you apply.",
  Blocked: "The posting states a condition that conflicts with your Career Passport.",
};

/** Professional job-match email: greets the person, recalls what they searched for, and lists matches grouped by what to do next. */
export function jobMatchesMessage(input: { to: string; name: string; roles: string[]; matches: JobMatchLine[]; radarUrl: string; retentionDays: number }): Email {
  const { matches } = input;
  const first = input.name.trim().split(/\s+/)[0] || "there";
  const roles = input.roles.filter(Boolean).slice(0, 4);
  const searched = roles.length ? `your search for ${roles.length > 1 ? `${roles.slice(0, -1).join(", ")} and ${roles.at(-1)}` : roles[0]} roles` : "your Career Passport";
  const count = `${matches.length} new job ${matches.length === 1 ? "match" : "matches"}`;
  const intro = `Based on ${searched}, Shortlist Job Radar found ${count}. They are grouped below by what to do next.`;
  const outro = `These matches stay in Job Radar for ${input.retentionDays} days. If you don't save or dismiss one by then, it is removed automatically.`;
  const groups = STATE_ORDER.map((state) => ({ state, rows: matches.filter((match) => match.state === state) })).filter((group) => group.rows.length);

  const text = [
    `Hello ${first},`,
    intro,
    ...groups.map((group) => [`${group.state} (${group.rows.length})`, STATE_NOTE[group.state], ...group.rows.map((row) => `- ${row.title}, ${row.company}${row.location ? ` (${row.location})` : ""}${row.warning ? `\n  To check: ${row.warning}` : ""}\n  ${row.url}`)].join("\n")),
    `Open Job Radar: ${input.radarUrl}`,
    outro,
    "Kind regards,\nShortlist Job Radar",
  ].join("\n\n");

  const e = escapeHtml;
  const section = (group: (typeof groups)[number]) => `<h2 style="font-size:15px;margin:28px 0 4px">${e(group.state)} <span style="color:#6b706c;font-weight:400">(${group.rows.length})</span></h2>
<p style="margin:0 0 12px;color:#6b706c;font-size:14px">${e(STATE_NOTE[group.state])}</p>
${group.rows.map((row) => `<div style="border:1px solid #e3e5e2;border-radius:8px;padding:12px 14px;margin:0 0 8px"><a href="${e(row.url)}" style="color:#1c1f1d;font-weight:600;font-size:15px;text-decoration:none">${e(row.title)}</a><div style="color:#6b706c;font-size:13px;margin-top:2px">${e(row.company)}${row.location ? ` &middot; ${e(row.location)}` : ""}</div>${row.warning ? `<div style="color:#92400e;font-size:13px;margin-top:6px">To check: ${e(row.warning)}</div>` : ""}</div>`).join("\n")}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f5"><div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f1d;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;line-height:1.55">
<p style="font-size:16px;margin:0 0 12px">Hello ${e(first)},</p>
<p style="margin:0 0 4px;font-size:15px">${e(intro)}</p>
${groups.map(section).join("\n")}
<p style="margin:28px 0"><a href="${e(input.radarUrl)}" style="display:inline-block;background:#1b1a17;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open Job Radar</a></p>
<p style="margin:0 0 20px;color:#6b706c;font-size:13px">${e(outro)}</p>
<p style="margin:0;font-size:14px">Kind regards,<br>Shortlist Job Radar</p>
</div></body></html>`;
  return { to: input.to, subject: matches.length === 1 ? `New job match: ${matches[0].title} at ${matches[0].company}` : `${count} for you on Shortlist Job Radar`, text, html };
}

/** Plain notification: a heading, a few short paragraphs, and an optional link. */
export function noticeMessage(
  to: string,
  subject: string,
  heading: string,
  paragraphs: string[],
  link?: { label: string; url: string },
): Email {
  const text = [heading, ...paragraphs, link ? `${link.label}: ${link.url}` : null, "Shortlist Job Radar"].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1f1d;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="white-space:pre-line">${escapeHtml(p)}</p>`).join("\n")}
${link ? `<p><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#1b1a17;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(link.label)}</a></p>` : ""}
</body></html>`;
  return { to, subject, text, html };
}
