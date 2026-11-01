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
  const from = email.from ?? process.env.EMAIL_FROM ?? "Shortlist <onboarding@resend.dev>";
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

function layout(heading: string, intro: string, buttonLabel: string, link: string, outro: string) {
  const text = `${heading}\n\n${intro}\n\n${buttonLabel}: ${link}\n\n${outro}\n\nShortlist`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1f1d;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(heading)}</h1>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1d2740;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(buttonLabel)}</a></p>
<p style="font-size:13px;color:#5f6660">Or paste this link into your browser:<br>${escapeHtml(link)}</p>
<p style="font-size:13px;color:#5f6660">${escapeHtml(outro)}</p>
</body></html>`;
  return { text, html };
}

export function verifyEmailMessage(to: string, name: string, link: string): Email {
  return {
    to,
    subject: "Confirm your Shortlist email",
    ...layout(
      `Hi ${name}, one quick thing`,
      "Confirm this is your email address so we can send you receipts and password resets.",
      "Confirm my email",
      link,
      "This link expires in 3 days. If you didn't create a Shortlist account, you can ignore this email.",
    ),
  };
}

export function resetPasswordMessage(to: string, link: string): Email {
  return {
    to,
    subject: "Reset your Shortlist password",
    ...layout(
      "Reset your password",
      "Someone (hopefully you) asked to reset the password for your Shortlist account.",
      "Choose a new password",
      link,
      "This link expires in 1 hour and works once. If you didn't ask for this, ignore this email and your password stays the same.",
    ),
  };
}

/** Plain notification: a heading, a few short paragraphs, and an optional link. */
export function noticeMessage(
  to: string,
  subject: string,
  heading: string,
  paragraphs: string[],
  link?: { label: string; url: string },
): Email {
  const text = [heading, ...paragraphs, link ? `${link.label}: ${link.url}` : null, "Shortlist"].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1f1d;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="white-space:pre-line">${escapeHtml(p)}</p>`).join("\n")}
${link ? `<p><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#1b1a17;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(link.label)}</a></p>` : ""}
</body></html>`;
  return { to, subject, text, html };
}
