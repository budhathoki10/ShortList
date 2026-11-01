# Product requirements: Job Discovery Agent

Status: Implemented, awaiting private-beta source and delivery configuration  
Owner: Shortlist  
Target release: Private beta  
Last updated: 1 November 2026

## 1. Product summary

Shortlist currently helps a candidate after they find a job. The Job Discovery Agent adds the missing first step. It monitors approved employer job sources, finds new roles, checks whether each role is realistic for a user, and places qualified matches in their Job Radar.

When the agent finds a new qualified match, Shortlist will:

1. create a recommendation in the user's Job Radar;
2. email the user if job-match emails are enabled; and
3. send a Web Push notification through the user's VAPID subscription if push is enabled.

The recommendation must explain why the job matched. It must also show eligibility concerns, evidence from the CV, missing requirements, the original employer source, and when Shortlist last confirmed that the posting was open.

This is not a mass-application bot. The candidate reviews the role and chooses whether to save, prepare, dismiss, or apply.

## 2. Product position

The product promise is:

> Find jobs you can actually apply for, ranked by eligibility and evidence rather than vague AI similarity.

Generic CV-based search is already common. Shortlist will compete on accuracy and honesty:

- hard constraints are checked before skills;
- every eligibility claim and requirement links to the job text that supports it;
- every claimed strength links to evidence in the candidate's CV;
- uncertain facts are marked "Verify" instead of being guessed;
- one saved profile leads directly from discovery to a truthful tailored CV, cover letter, application plan, and interview practice.

## 3. Problem

Candidates lose time in two places. They repeatedly search several job boards, and they open roles that were never realistic because of location, work authorization, seniority, graduation date, or another hard condition.

Most matching products make this worse by compressing everything into one percentage. A high skill match can hide a citizenship restriction. A remote label can hide a country restriction. A promising title can hide a requirement for five more years of experience.

Shortlist already maps job requirements to CV evidence. The agent will apply that system before the user spends time on an application.

## 4. Goals

The first release must:

- find newly published or changed jobs from approved sources without asking users to search manually;
- evaluate jobs against the user's CV and Career Passport;
- reject or clearly flag likely hard blockers before calculating the evidence score;
- add qualified jobs to the UI within five minutes of ingestion;
- send at most one email and one push notification for the same recommendation;
- connect each recommendation to the existing application workflow;
- show where every important conclusion came from;
- let the user control sources, roles, constraints, alert channels, and alert frequency;
- learn from explicit save and dismissal reasons without silently rewriting user preferences.

## 5. Non-goals for the first release

The first release will not:

- submit applications automatically;
- scrape LinkedIn or bypass logins, bot protection, or site terms;
- promise that a candidate is legally eligible to work in a country;
- claim that a match score predicts an interview or offer;
- run an unrestricted autonomous browser agent;
- use inferred sensitive traits in ranking;
- notify the user about every loosely related posting;
- build a browser extension or application autofill.

## 6. Target user

The initial audience is early-career and international technology candidates. They have a CV, know roughly which roles they want, and need help finding roles that fit their experience and work constraints.

The system must still support a general candidate. International and early-career constraints give the first release a clear test case, not a permanent restriction.

## 7. Core concepts

### 7.1 Career Passport

The Career Passport contains search facts that a CV cannot answer safely:

- target roles and excluded roles;
- preferred and excluded locations;
- remote, hybrid, on-site, and relocation preferences;
- countries where the user states they can work;
- whether the user needs present or future sponsorship;
- citizenship or clearance restrictions the user chooses to record;
- expected graduation date;
- target seniority and maximum acceptable experience gap;
- employment types;
- minimum salary where the user wants to provide one;
- preferred and excluded industries or employers;
- email and push alert settings.

The onboarding flow must ask the user to confirm these facts. The system must not infer work authorization, citizenship, salary expectations, or willingness to relocate from the CV.

### 7.2 Job Discovery Agent

"Agent" means one controlled, scheduled pipeline. It is not one permanent process per user.

The agent has six bounded stages:

1. **Discover.** Read active jobs from approved employer and ATS sources.
2. **Normalize.** Convert source fields into one internal job-posting shape.
3. **Verify.** Confirm the source link, posting state, timestamps, and content hash.
4. **Extract.** Identify requirements, preferences, location rules, work-authorization language, seniority, salary, and application deadline.
5. **Match.** Apply hard constraints, then map job requirements to CV evidence and user preferences.
6. **Publish.** Save one recommendation and enqueue its allowed notification deliveries.

An AI model may help extract ambiguous requirements. Plain code owns source validation, deduplication, hard safety rules, scoring, state changes, and delivery idempotency. Invalid or unavailable AI output must not stop ingestion.

### 7.3 Qualified match

A new job becomes a qualified match when all of the following are true:

- the source posting is open and has a canonical employer URL;
- the posting has not already produced a recommendation for that user;
- no confirmed hard blocker conflicts with the Career Passport;
- it matches at least one target-role family;
- its evidence and preference score meets the user's configured threshold;
- the system has enough job text to explain the result.

An ambiguous eligibility condition can still appear as "Verify before applying." It must not appear in the "Ready to apply" group.

## 8. User experience

### 8.1 First-run setup

After CV import, the user completes the Career Passport. Shortlist previews two or three example decisions so the user can correct bad assumptions before enabling the agent.

The user then chooses:

- search enabled or paused;
- immediate, daily, or off for email;
- immediate, daily, or off for push;
- minimum match level for an immediate alert.

Push permission must be requested only after the user presses "Enable push alerts." The app must not show the browser permission prompt on page load.

### 8.2 Job Radar

Add `/app/radar` as the home for discovered roles. The default view groups recommendations into:

- Ready to apply
- Strong stretch
- Verify first
- Dismissed

Each recommendation card shows:

- job title, company, location, work arrangement, and source;
- freshness and the last successful source check;
- recommendation state;
- eligibility result;
- evidence score and preference fit as separate values;
- up to three strongest CV evidence links;
- blockers, verification questions, and trainable gaps;
- salary when the employer supplied it;
- Save and prepare, Dismiss, and View source actions.

The UI must not show one unexplained overall score.

When the Job Radar is open, it should display a new stored recommendation within 60 seconds. The first version may use a lightweight 30-second poll. A later release may replace polling with server-sent events or another realtime transport.

### 8.3 Recommendation detail

The detail page shows:

- the exact job requirement and eligibility quotations;
- the exact CV evidence mapped to each requirement;
- demonstrated, listed, missing, and unresolved requirements;
- why Shortlist ranked the role at its current level;
- a direct link to the employer's posting;
- controls to report incorrect extraction or a closed job;
- the existing application plan, tailored CV, cover letter, and interview workflow after the user saves the role.

Saving a recommendation creates or connects to the existing `Job` record. It must not create duplicate tracker entries.

### 8.4 Dismissal feedback

The user can dismiss with one reason:

- wrong role;
- wrong location;
- work authorization or citizenship;
- salary;
- too senior or too junior;
- employer preference;
- duplicate;
- closed or inaccurate;
- not interested.

Shortlist may adjust ranking weights from repeated feedback, but it must show any proposed permanent preference change. For example: "You dismissed four on-site roles. Exclude on-site roles?"

## 9. Notification requirements

### 9.1 Shared delivery rule

The recommendation record is the source of truth. Email and push workers must never perform their own matching. A notification may be sent only after the recommendation transaction succeeds.

Each delivery uses an idempotency key:

`recommendationId:channel:notificationVersion`

A retry with the same key must not send a second user-visible notification.

### 9.2 Email

Immediate match emails contain:

- job title and employer;
- location and work arrangement;
- the recommendation state;
- the strongest reason it matched;
- any eligibility warning;
- a deep link to the recommendation;
- notification settings and unsubscribe links.

The email must not include the user's CV text or sensitive Career Passport values. Daily mode groups unsent recommendations into one digest.

If immediate mode would send more than three emails in one hour, later matches roll into a digest. This protects deliverability and keeps a busy ingestion run from flooding the user.

### 9.3 Web Push with VAPID

The browser registers a service worker and creates a push subscription after explicit permission. The client sends the subscription endpoint and encryption keys to an authenticated server action.

Configuration:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` may be sent to the browser;
- `VAPID_PRIVATE_KEY` is server-only and must never be logged or exposed to client code;
- `VAPID_SUBJECT` identifies the operator with a valid contact URI.

A push payload contains only:

- a short title;
- company and role;
- recommendation state;
- recommendation ID or a short internal route;
- notification version.

Do not put CV evidence, work-authorization details, email addresses, or job-description excerpts in the push payload. Lock-screen notifications are visible to other people.

The service worker displays the notification and opens `/app/radar/[recommendationId]` when clicked. If that page is already open, it should focus the existing window.

The server must remove a subscription after a permanent `404` or `410` response from the push service. Temporary failures use bounded retries with exponential backoff.

### 9.4 User controls

Users can:

- enable or disable each channel independently;
- choose immediate, daily, or off;
- set quiet hours and a time zone;
- choose whether "Strong stretch" and "Verify first" roles can trigger alerts;
- send a test push;
- remove individual devices;
- pause the discovery agent without deleting their Career Passport.

System emails such as password reset remain separate from job-alert consent.

## 10. Source strategy

The private beta starts with public employer postings from Greenhouse and Lever. Sources must be allowlisted and have a stable public job feed or employer page.

Each source adapter must provide:

- source name and employer;
- external posting ID;
- canonical URL;
- title, location, description, and structured metadata;
- published or updated timestamp when available;
- a deterministic content hash;
- a way to determine whether the job still exists.

The agent must respect rate limits and source terms. It must not use credentials supplied by an individual user to crawl a job board.

Source expansion happens only after the team measures recommendation quality and stale-job rates for the first adapters.

## 11. Matching and ranking

### 11.1 Decision order

The matcher evaluates each user-job pair in this order:

1. source validity and freshness;
2. explicit hard blockers;
3. unresolved eligibility questions;
4. target-role compatibility;
5. required CV evidence;
6. preferred CV evidence;
7. user preferences;
8. freshness and prior feedback.

Skills cannot cancel an explicit hard blocker. A perfect React match does not make a US-citizens-only role suitable for a user who stated that they do not meet that requirement.

### 11.2 Recommendation states

- **Ready to apply:** no known blocker, high required-evidence coverage, and strong preference fit.
- **Strong stretch:** no known blocker and a small number of clearly identified gaps.
- **Verify first:** an important eligibility or requirement statement is missing or ambiguous.
- **Blocked:** a source-backed hard condition conflicts with the Career Passport. Blocked jobs do not notify by default.

### 11.3 Explainability contract

Every decision stores:

- matching rule version;
- source content hash;
- Career Passport version;
- profile version;
- evidence rows and their source locations;
- hard-blocker and uncertainty codes;
- component scores;
- final recommendation state.

This snapshot lets support reproduce why a job was recommended even if the profile or posting later changes.

## 12. System design

### 12.1 Processing model

Use a scheduled, queue-backed pipeline:

```text
Scheduler
  -> source discovery jobs
  -> normalize and upsert postings
  -> enqueue changed posting IDs
  -> select potentially relevant users
  -> match user and posting
  -> create recommendation
  -> enqueue email and push deliveries
  -> record delivery results
```

Fetch each source once per run. Do not fetch the same employer board separately for every user.

The scheduler may run every 15 minutes in the private beta. A source adapter records its cursor, last success, failure count, and next allowed attempt. Repeated failures back off instead of delaying healthy sources.

### 12.2 Proposed MongoDB collections

`career_passports`

- one versioned search profile per user;
- alert preferences and quiet hours;
- discovery enabled or paused.

`job_sources`

- source adapter, employer, token or public identifier;
- enabled state, cursor, schedule, and health fields.

`discovered_jobs`

- normalized public posting;
- source identity and canonical URL;
- content hash, first seen, last seen, and closed time;
- extracted constraints and requirements.

`job_recommendations`

- unique user and discovered-job pair;
- decision snapshot, state, scores, evidence, and feedback;
- notification eligibility and timestamps;
- link to an existing tracker job when saved.

`push_subscriptions`

- user ID, endpoint, encrypted subscription keys, device label, and last success;
- one unique endpoint;
- revoked and expiration fields.

`notification_deliveries`

- idempotency key, user, recommendation, channel, state, attempts, and next retry;
- provider message ID where available;
- short non-sensitive failure reason.

`discovery_runs`

- adapter, start and completion times, counts, duration, and status;
- no CV text, job description, tokens, or provider secrets in logs.

### 12.3 Required indexes

- unique source adapter plus external posting ID;
- unique user ID plus discovered job ID;
- unique push endpoint hash;
- unique notification idempotency key;
- discovered jobs by state and last seen time;
- recommendations by user, state, and creation time;
- notification deliveries by state and next retry time;
- source adapters by enabled state and next run time.

Exact schemas and indexes must follow the project's MongoDB service boundary and ownership checks.

## 13. Reliability rules

- A failed email or push must not remove the recommendation from the UI.
- A notification worker may retry delivery, but matching itself must not rerun during that retry.
- Closing a posting updates its recommendation state and stops pending alerts.
- Reopening the same external posting does not alert again unless the content changed materially and the notification version increased.
- Concurrent agent runs must claim work atomically.
- One failing source must not stop other source adapters.
- The system must keep a dead-letter state for deliveries that exceed the retry limit.
- Users must be able to see when search is delayed because all configured sources are unhealthy.

## 14. Privacy and security

- Treat CVs, Career Passports, recommendations, subscriptions, and delivery records as private user data.
- Match on the server. Do not send CV text to job sources.
- Keep VAPID private keys, email provider keys, and source credentials server-only.
- Encrypt push subscription key material at rest if the production platform provides application-level key management. At minimum, restrict access to the notification service path.
- Every read and write includes the authenticated user ID in the database query.
- Do not log CV text, job descriptions, push payloads, subscription endpoints, or provider credentials.
- Data export includes the Career Passport, recommendations, and notification settings.
- Account deletion removes push subscriptions and all private recommendation data.
- Notification consent and marketing consent remain separate.

## 15. Analytics and success measures

The beta will measure:

- time from CV confirmation to first qualified recommendation;
- source freshness and successful refresh rate;
- recommendation save rate;
- dismissal rate by reason;
- percentage of recommendations later reported as closed or inaccurate;
- percentage of alerted jobs with a source-backed eligibility explanation;
- recommendation-to-application conversion;
- application-to-interview conversion when the user records the outcome;
- email delivery, open, and click rates where privacy settings allow;
- push delivery and click rates;
- notification opt-out and unsubscribe rates;
- duplicate notification count;
- median time from ingestion to UI visibility and alert enqueue.

Private beta targets:

- 95% of new recommendations visible in the UI within five minutes of ingestion;
- zero duplicate user-visible notifications in the acceptance suite;
- fewer than 5% of recommendations dismissed for an obvious hard blocker the system should have detected;
- at least 25% of "Ready to apply" recommendations saved or opened at the employer source;
- fewer than 2% of immediate-alert users disabling notifications because of frequency during the first two weeks.

These are product targets, not claims to users.

## 16. Rollout plan

### Phase 1: Career Passport and manual evaluation

- build and version the Career Passport;
- run the new decision system on jobs users already add;
- validate eligibility states and explanations;
- add matching regression fixtures.

### Phase 2: Agent and Job Radar

- add Greenhouse and Lever adapters;
- add scheduled ingestion, normalized postings, deduplication, and source health;
- add recommendation generation and `/app/radar`;
- connect saved recommendations to the existing job workflow.

### Phase 3: Notifications

- add channel preferences and email delivery;
- register the service worker and VAPID subscriptions;
- add immediate push, quiet hours, digests, retries, invalid-subscription cleanup, and test notifications;
- verify notification behavior across supported desktop and mobile browsers.

### Phase 4: Private beta

- onboard 20 to 30 active candidates;
- review false positives and missed blockers each week;
- expand the employer allowlist only when source health and match quality hold;
- tune thresholds from explicit outcomes, not clicks alone.

## 17. Acceptance criteria

The feature is ready for private beta when:

1. A newly ingested posting can create no more than one recommendation per user.
2. A qualified recommendation appears in Job Radar without a page reload within 60 seconds while the page is open.
3. The recommendation shows its employer source, freshness, eligibility state, evidence, gaps, and matching rule version.
4. A confirmed hard blocker prevents a "Ready to apply" decision.
5. Saving a recommendation connects it to one existing tracker job and unlocks the current application workflow.
6. Immediate email and push each send once when enabled, including after a worker retry.
7. Quiet hours delay delivery in the user's configured time zone.
8. Daily mode sends one digest rather than one message per job.
9. Revoked push permission or a permanent push-service error disables the affected subscription without affecting other devices.
10. Push payloads contain no CV text or sensitive Career Passport fields.
11. Pausing discovery stops new matching and alerts but retains existing recommendations.
12. Account deletion removes Career Passport, recommendation, subscription, and delivery data.
13. Automated tests cover source deduplication, matching decisions, concurrent runs, notification idempotency, quiet hours, digests, and subscription cleanup.
14. Production readiness checks confirm the public app URL, scheduled worker authentication, email sender, VAPID subject, public key, and private key.

## 18. Decisions for the private beta

The private beta will use these defaults unless testing shows a clear reason to change them:

- source refresh every 15 minutes;
- Job Radar polling every 30 seconds while open;
- immediate alerts only for "Ready to apply" recommendations;
- email and push are opt-in;
- no more than three immediate emails per hour, with overflow moved to a digest;
- quiet hours from 22:00 to 08:00 in the user's time zone;
- blocked jobs hidden from the main feed but available in an explanation view;
- employer-owned Greenhouse and Lever links are the canonical application destinations;
- the user always reviews and submits the application.

## 19. Later opportunities

Once the agent produces reliable matches, Shortlist can add:

- watched-company lists;
- adjacent-role discovery;
- alerts when a saved job changes or closes;
- an opportunity simulator showing which evidence gap blocks the most current jobs;
- carefully reviewed visa, relocation, graduate, and country-specific collections;
- a browser extension for capturing unsupported employer pages;
- realtime UI delivery to replace polling;
- more source adapters after legal and reliability review.

None of these should delay a focused beta of discovery, evidence-based matching, UI delivery, email, and Web Push.
