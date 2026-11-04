/** A match nobody saved or dismissed is removed after this many days. */
export const RECOMMENDATION_RETENTION_DAYS = 2;

/** Only postings published within this many days are recommended and listed. */
export const MAX_POSTING_AGE_DAYS = 7;

/** When a posting went up: the source's own date when it gives one, otherwise the day we first saw it. */
export const postedAt = (job: { sourceUpdatedAt: Date | null; firstSeenAt: Date }) => job.sourceUpdatedAt ?? job.firstSeenAt;

export const postingCutoff = () => new Date(Date.now() - MAX_POSTING_AGE_DAYS * 24 * 60 * 60_000);
