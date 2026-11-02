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
