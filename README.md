# Shortlist

A job-hunt helper for anyone applying for jobs. You add your CV once, then each job you paste gets four steps (one tab each, ticked off as you finish them):

1. **Fit.** An instant keyword check: which requirements your CV shows, which are only in your skills list, and which are missing. Optionally, a full analysis maps every requirement to evidence, plans the gaps and drafts application answers.
2. **Tailored CV.** The summary and bullets are rewritten for the job. You accept or reject each change, and any change that adds a fact not in your CV is blocked. For skills the job wants that your CV doesn't mention, **I have this** lets you add them in your own words.
3. **Cover letter**, written from your real experience, editable, and downloadable as a PDF in the same look as your CV.
4. **Interview.** Likely questions, including the gaps, with feedback on your typed answers, and a full mock interview.

Around them: a **tracker** (Saved, Applied, Interviewing, Offer, Closed, with follow-up reminders on Today and by email), **progress** stats, and **100 CV templates** you can customise and download as a PDF.

The rule everything follows: **Shortlist only uses what's in your profile.** The AI can reword and reorder. It can't add an employer, title, degree, number or skill you don't have. A plain-code check (`src/lib/tailor/fact-check.ts`) catches anything that slips through, so it doesn't rely on the model behaving.

![Match check](docs/screenshots/match.png)

| | | |
|---|---|---|
| ![Home](docs/screenshots/home.png) | ![Tailored CV](docs/screenshots/tailored-cv.png) | ![Cover letter](docs/screenshots/cover-letter.png) |
| ![Jobs](docs/screenshots/jobs.png) | ![Today](docs/screenshots/today.png) | ![Interview prep](docs/screenshots/interview.png) |

## Plans

| | Free | Paid plan |
|---|---|---|
| Tailored CVs | 3 a month | 200 a month |
| Cover letters | 3 a month | 200 a month |
| Interview prep sessions | 3 a month | 200 a month |
| CV imports | 5 a month | 50 a month |
| Tracker, reminders, PDF | Yes | Yes |
| Word (.docx) download | No | Yes |
| Price | $0 | Monthly or yearly subscription through Freemius (prices are set in Freemius) |

A **subscription** renews until cancelled; cancelling keeps access until the end of the period already paid for. Limits live in `src/lib/plans.ts`; billing details are in [docs/billing-freemius.md](docs/billing-freemius.md).

## Running it locally

You need Node 20 or newer and a MongoDB 5.0 or newer (Atlas free tier, a local install, or a container).

```bash
npm install
cp .env.example .env            # then set MONGODB_URI (and OPENROUTER_API_KEY for the real AI)
npm run dev                      # http://localhost:3000
```

The app creates its collections and indexes the first time it connects. To create them ahead of time, for example on a fresh production database, run `npm run db:setup`.

Everything works without any keys except the database:

- **No `OPENROUTER_API_KEY`:** CVs and job posts are read with plain code, and tailoring only reorders bullets and skills. Cover letters and interview feedback use simple templates. It's useful for development, but not what you'd sell.
- **No `RESEND_API_KEY`:** emails are printed to the console, so you can click confirmation and reset links from there.
- **No payment keys:** the billing page shows the plans, but subscribing is off.

## Environment variables

All of these are in `.env.example`, with comments.

| Variable | Needed | What it's for |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | No | Database name inside that server. Default `shortlist` |
| `APP_URL` | Yes in production | Public URL, used in email links and payment return URLs |
| `TRUSTED_PROXY_HOPS` | No | How many proxies sit in front of the app, to find the real client IP for rate limits. Default `1`. Use `0` when nothing is in front, and the IP header is ignored |
| `CRON_JOB_SECRET` | For reminders | Protects `/api/cron-job/*`. Make it long and random: `openssl rand -hex 32` |
| `LEGAL_OPERATOR_NAME`, `LEGAL_COUNTRY`, `SUPPORT_EMAIL` | Before launch | Shown on Terms, Privacy and Refund. Payment providers may review these pages |
| `OPENROUTER_API_KEY` | For the real product | OpenRouter reads CVs and job posts, and writes changes, letters and feedback |
| `AI_READ_MODEL`, `AI_WRITE_MODEL` | No | One OpenRouter model id that supports structured outputs, or a comma-separated list tried in order (next model on 429, 5xx, timeout or invalid JSON). Both default to `openrouter/free`, which is rate-limited: set paid models |
| `OPENROUTER_BASE_URL` | No | Only to point at another OpenAI-compatible endpoint |
| `RESEND_API_KEY`, `EMAIL_FROM` | For email | Confirmations, password resets and follow-up reminders |
| `FREEMIUS_MODE` | For card payments | `sandbox` (default) or `production`. Production refuses sandbox purchases |
| `FREEMIUS_PRODUCT_ID`, `FREEMIUS_API_KEY`, `FREEMIUS_SECRET_KEY`, `FREEMIUS_PUBLIC_KEY` | For card payments | From the Freemius Developer Dashboard. **Server secrets**: never put them in a `NEXT_PUBLIC_` variable |
| `FREEMIUS_PLAN_ID`, `FREEMIUS_PRICING_ID_MONTHLY`, `FREEMIUS_PRICING_ID_YEARLY` | For card payments | The paid plan and its monthly and yearly pricing records |
| `BILLING_GRACE_DAYS`, `BILLING_SUSPENDED_ACCESS` | No | Access kept after a failed renewal (default 3 days), and what a suspended subscription gets (`none` or `grace`) |
| `BILLING_PRICE_LABEL_MONTHLY`, `BILLING_PRICE_LABEL_YEARLY` | No | Display text for the pricing page, e.g. `USD 9 / month` (avoid a bare `$` in `.env`: it is expanded like a variable) |

## Going live

### 1. Hosting and database

Deploy to Vercel (or anywhere that runs Next.js), with MongoDB Atlas or any MongoDB 5.0+. Set `MONGODB_URI`; indexes are created on first connect, and `npm run db:setup` does it ahead of time. If the app sits behind a proxy that rewrites the `Host` header, list your public host under `experimental.serverActions.allowedOrigins` in `next.config.ts`, or form submissions will be refused as cross-origin.

### 2. Email (Resend)

1. Create an account at resend.com and verify your sending domain.
2. Set `RESEND_API_KEY`, and set `EMAIL_FROM` to an address on that domain.

### 3. Card payments (Freemius)

Freemius sells monthly and yearly subscriptions and acts as the seller of record. The full guide is in [docs/billing-freemius.md](docs/billing-freemius.md); in short:

1. Create the product and a paid plan with a monthly and a yearly pricing record in the Freemius Developer Dashboard.
2. Set the `FREEMIUS_*` variables. Start with `FREEMIUS_MODE=sandbox`.
3. Add a webhook listener for `https://YOUR_DOMAIN/api/webhooks/freemius`. Paid access only ever starts from a signature-verified webhook or a call to Freemius's API, never from the browser's success message.
4. Switch to `FREEMIUS_MODE=production` only after a full sandbox run.

### 4. Daily reminders (cron-job.org)

Follow-up emails are sent by `/api/cron-job/daily`. Anything that can call a URL once a day will do. With cron-job.org:

1. Create a job for `https://YOUR_DOMAIN/api/cron-job/daily`, once a day (for example 08:00 in your users' main time zone).
2. Under **Advanced**, add the header `Authorization: Bearer YOUR_CRON_JOB_SECRET`. (`?key=YOUR_CRON_JOB_SECRET` in the URL also works, but headers stay out of logs.)

The route answers right away with `202` and sends the emails in the background. To run it by hand and see the result, add `?wait=1`:

```bash
curl -H "Authorization: Bearer $CRON_JOB_SECRET" "https://YOUR_DOMAIN/api/cron-job/daily?wait=1"
```

Each person gets at most one email a day, listing every application that's due.

### 5. AI models (OpenRouter)

Without paid models the app still works, but CV reading, tailoring, cover letters and the full analysis quietly use the plain-code fallbacks, because the free default (`openrouter/free`) is rate-limited. Set `OPENROUTER_API_KEY` and paid models in `.env` **and** on your host:

```
AI_READ_MODEL=openai/gpt-4o-mini,google/gemini-2.0-flash-001
AI_WRITE_MODEL=anthropic/claude-sonnet-4.5,openai/gpt-4o
```

Both accept a comma-separated list. The first model is tried first; a 429, 5xx, timeout or unusable (non-JSON or wrong-shape) answer moves on to the next. Only when every model fails does the app fall back to plain code, and it logs one warning such as `{"event":"ai_fallback","task":"write","attempts":[{"model":"…","status":429,"reason":"HTTP 429"}]}`. Prompts, CV text and keys are never logged. Use a stronger model first for `AI_WRITE_MODEL`: tailoring rebuilds the whole CV in one answer.

## How it's built

- **Next.js 16** App Router with server actions, **MongoDB** (official driver, no ORM), Tailwind 4.
- **Accounts:** email and password, with database sessions in httpOnly cookies, email confirmation, password reset, data export and account deletion.
- **AI:** OpenRouter's chat API with JSON-schema structured outputs (`src/lib/ai.ts`). Requests ask for providers that don't keep prompts. Every answer is validated against its schema again in code, and every AI feature has a plain-code fallback.
- **Data:** each collection and its indexes are defined in `src/db/` (`types.ts`, `indexes.ts`, `mongo.ts`). Everything that reads or writes goes through `src/lib/services/`.

Where things live:

| Path | What |
|---|---|
| `src/lib/cv/` | Reading PDF, DOCX and text CVs into a profile |
| `src/lib/jobs/` | Fetching job links safely and reading job posts (JSON-LD first, then the page text) |
| `src/lib/match/` | The match score and keyword highlighting. Plain code, no AI |
| `src/lib/tailor/` | Tailoring, cover letters, interview questions and feedback, follow-up messages, and the fact check |
| `src/lib/export/` | Redesigned PDF and Word exports; browser print follows the chosen template |
| `src/lib/templates/` | The 100 CV templates (a spec each) and the rules that keep a spec valid |
| `src/app/app/print/` | Print pages for saving as PDF: a job's CV (`cv/[id]`), its cover letter (`letter/[id]`), and your own CV in any template (`profile`) |
| `src/db/` | MongoDB connection, collection types and indexes |
| `src/lib/services/` | Database reads and writes, and rate limits |
| `src/lib/billing/` | Freemius: checkout, webhooks, access policy |
| `src/app/app/` | The signed-in app |
| `src/components/` | UI: `ui.tsx` primitives, `toast.tsx`, the sidebar, and the command palette (`command-palette.tsx`) |

## Security and privacy

PDF imports retain their original bytes after the review is confirmed. **Original PDF** is the default on the CV workbench and profile download: it preserves the uploaded document exactly, without applying AI suggestions or profile edits. **Tailored version** is an explicit alternative and includes the full saved content by default; shortening is opt-in. Earlier imports need their source file uploaded again to preserve formatting. Pending import reviews stay private and expire after one hour; replacing a CV with pasted text removes its previous original file. Source files are included in the Settings export and removed on account deletion.

- CVs are personal data. They're stored in the user's account only, can be downloaded as JSON from Settings, and are deleted with the account. They aren't used to train models. The Privacy page says so.
- Every job, document and download is checked against the signed-in user, in the query itself (`{ _id, userId }`). The tests try to open another person's pages and downloads.
- **Injection:** there is no SQL. Database values only ever come from typed server code; ids from requests are coerced to strings, and every id or email from a signed webhook payload must be a plain string or number before it reaches a query. React escapes everything it renders, email HTML is escaped, and a nonce-based Content-Security-Policy (set in `src/proxy.ts`) blocks inline scripts and styles even if markup ever slipped through. The one page that relaxes style rules, and allows Freemius's checkout iframe, is billing; that exception has not been confirmed against a full live checkout (see the billing guide).
- **CSRF:** the session cookie is `SameSite=Lax` and httpOnly (`Secure` in production); every mutation is a Next.js server action, which refuses requests whose `Origin` doesn't match the host. The only GET routes with side effects take an unguessable one-time token.
- **Rate limits:** sign-ups and password resets are limited per IP, adding jobs per user, and account deletion per user, with counters in MongoDB (`rate_limits`, cleared by a TTL index). The client IP is read from the right end of `X-Forwarded-For` (the part our own proxy wrote, controlled by `TRUSTED_PROXY_HOPS`), never from what a client sends itself. **Login is deliberately plain** (email and password, scrypt-hashed, no lockout) because Google sign-in is planned; add attempt limits back if password login stays.
- Job links are fetched with `safeFetch`, which refuses private and internal addresses in every spelling (including IPv6-wrapped IPv4), re-checks every redirect, limits size and time, and never sends cookies.
- CV and job text is passed to the model as quoted data, with instructions to ignore any instructions inside it.
- Monthly allowances are counted with a single atomic database update, so parallel requests can't go past the limit. A failed AI call gives the allowance back.
- Webhook signatures are verified (Freemius events by the official SDK, HMAC-SHA256), each event is processed once however often it is delivered, and payment amounts come from the payment provider, not from the browser.
- **Sign-up is instant, and says so when an address is taken.** That is a deliberate product choice (no extra step before people can use the app); the cost is that the form can confirm an address has an account. It is limited per IP, and an unconfirmed email shows a banner until the person presses the button on the confirmation page. Confirmation links open a page and a button press (a POST) uses them up, so mail scanners that fetch links can't burn them. If you ever want sign-up that reveals nothing, create the account only when an emailed link is confirmed.

## Limits worth knowing

- Many job boards, LinkedIn especially, block automated reading or need a login. When that happens Shortlist asks the user to paste the text, which always works.
- Scanned (image-only) PDFs have no text to read. Users get a message asking for a DOCX or pasted text.
- The match score is keyword and word-overlap matching, not a judgement of the person. It's labelled as a guide.
- Some job boards embed the description as escaped HTML. It's converted to plain text when read, and leftover tags are stripped again when a saved job is shown (`src/lib/jobs/html.ts`).
- If Freemius's renewal webhook is ever lost, the app re-reads the license from Freemius around the renewal date (at most hourly, after the page is sent), so a paying customer isn't dropped to free (`src/lib/billing/renewal-check.ts`).
- English only for now.
- Shortlist doesn't apply to jobs for anyone. Auto-applying breaks most job sites' terms and gets accounts banned.

## Tests

```bash
npm test                  # unit tests: matching, fact check, security helpers
npm run test:integration  # the services and AI client against a real MongoDB
npm run test:e2e          # a browser through the whole product
npm run test:all          # lint, typecheck, and all of the above
```

The integration and browser tests start a throwaway `mongod` themselves (downloaded once by `mongodb-memory-server`), so nothing needs installing. To use a MongoDB you run instead, set `TEST_MONGODB_URI`; **those tests wipe the database they are given**, so never point it at real data.

## Navigation

The sidebar is an icon rail. Hover it, or tab into it, and it opens over the page (the content never moves). Below the `lg` breakpoint it becomes a drawer.

## Keyboard

Results of actions appear as toasts in the top right (full width at the top on phones).

`Cmd K` (or `Ctrl K`, or `/`) searches pages, actions and jobs. `C` adds a job, `G` then `T`, `J`, `C`, `P`, `S` or `B` jumps to a page, `?` lists them all. `Cmd S` saves the profile and cover letter, `Cmd Enter` submits a note, an answer or a job description.
