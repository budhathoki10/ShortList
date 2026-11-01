import "server-only";
import { collections, fromDoc } from "@/db/mongo";
import type { Document, Job, Payment, Subscription, User } from "@/db/types";
import { createAuthToken } from "@/lib/auth/tokens";
import { resetPasswordMessage, sendEmail, verifyEmailMessage } from "@/lib/email";
import { appUrl } from "@/lib/util";
import { originalBytes } from "@/lib/cv/original";
import { notificationsOn } from "./notification-settings";

export async function sendVerificationEmail(user: Pick<User, "id" | "email" | "name">) {
  const token = await createAuthToken(user.id, "verify_email");
  await sendEmail(verifyEmailMessage(user.email, user.name, appUrl(`/verify-email/${token}`)));
}

export async function sendPasswordResetEmail(user: Pick<User, "id" | "email">) {
  const token = await createAuthToken(user.id, "reset_password");
  await sendEmail(resetPasswordMessage(user.email, appUrl(`/reset-password/${token}`)));
}

export async function markEmailVerified(userId: string) {
  await (await collections()).users.updateOne({ _id: String(userId) }, { $set: { emailVerifiedAt: new Date() } });
}

/** Delete the user and everything that belongs to them: the profile, jobs, documents, interviews, usage, payments, sessions and tokens. */
export async function deleteUser(userId: string) {
  const id = String(userId);
  const c = await collections();
  // The account goes last, so a failure part-way leaves it possible to log in and try again.
  await Promise.all([
    c.profiles.deleteOne({ _id: id }),
    c.cvImports.deleteMany({ userId: id }),
    c.careerPlans.deleteMany({ userId: id }),
    c.mockSessions.deleteMany({ userId: id }),
    c.jobs.deleteMany({ userId: id }),
    c.documents.deleteMany({ userId: id }),
    c.interviews.deleteMany({ userId: id }),
    c.usage.deleteMany({ userId: id }),
    c.payments.deleteMany({ userId: id }),
    c.subscriptions.deleteMany({ userId: id }),
    c.sessions.deleteMany({ userId: id }),
    c.authTokens.deleteMany({ userId: id }),
    c.cvTemplates.deleteMany({ userId: id }),
    c.photos.deleteOne({ _id: id }),
    c.careerPassports.deleteOne({ _id: id }),
    c.jobRecommendations.deleteMany({ userId: id }),
    c.pushSubscriptions.deleteMany({ userId: id }),
    c.notificationDeliveries.deleteMany({ userId: id }),
  ]);
  await c.users.deleteOne({ _id: id });
}

/** Sign the user out on every device. */
export async function deleteAllSessions(userId: string) {
  await (await collections()).sessions.deleteMany({ userId: String(userId) });
}

/** Everything stored about the user (right of access and portability). Internal ids and the password hash are left out. */
export async function exportUserData(user: User) {
  const c = await collections();
  const [profile, jobs, documents, interviews, payments, subscriptions, templates, photo, careerPlans, mockSessions, careerPassport, recommendations, notificationDeliveries] = await Promise.all([
    c.profiles.findOne({ _id: user.id }),
    c.jobs.find({ userId: user.id }).sort({ createdAt: 1 }).toArray(),
    c.documents.find({ userId: user.id }).sort({ createdAt: 1 }).toArray(),
    c.interviews.find({ userId: user.id }).toArray(),
    c.payments.find({ userId: user.id }).sort({ createdAt: 1 }).toArray(),
    c.subscriptions.find({ userId: user.id }).sort({ createdAt: 1 }).toArray(),
    c.cvTemplates.find({ userId: user.id }).sort({ createdAt: 1 }).toArray(),
    c.photos.findOne({ _id: user.id }),
    c.careerPlans.find({ userId: user.id }).toArray(),
    c.mockSessions.find({ userId: user.id }).sort({ createdAt: 1 }).toArray(),
    c.careerPassports.findOne({ _id: user.id }),
    c.jobRecommendations.find({ userId: user.id }).sort({ createdAt: 1 }).toArray(),
    c.notificationDeliveries.find({ userId: user.id }, { projection: { failureReason: 0 } }).sort({ createdAt: 1 }).toArray(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: { name: user.name, email: user.email, createdAt: user.createdAt, notificationsOn: notificationsOn(user) },
    profile: profile?.data ?? null,
    defaultTemplateId: profile?.defaultTemplateId ?? null,
    templates: templates.map((t) => ({ name: t.name, basedOn: t.basedOn, spec: t.spec, createdAt: t.createdAt, updatedAt: t.updatedAt })),
    photo: photo ? { format: "image/webp", base64: Buffer.from((photo.image as unknown as { buffer: Uint8Array }).buffer).toString("base64"), updatedAt: photo.updatedAt } : null,
    profileImport: profile ? { sourceText: profile.sourceText ?? null, readerVersion: profile.readerVersion ?? null, previousData: profile.previousData ?? null } : null,
    originalCv: profile?.original ? { name: profile.original.name, type: profile.original.type, sha256: profile.original.sha256, base64: originalBytes(profile.original).toString("base64") } : null,
    applicationPlans: careerPlans.map((p) => ({ jobId: p._id, plan: p.plan, progress: p.progress, updatedAt: p.updatedAt })),
    mockInterviews: mockSessions.map((session) => ({ ...session, userId: undefined })),
    careerPassport: careerPassport ? { ...careerPassport, _id: undefined } : null,
    jobRecommendations: recommendations.map((row) => ({ ...row, userId: undefined })),
    notificationDeliveries: notificationDeliveries.map((row) => ({ ...row, userId: undefined })),
    jobs: jobs.map((d) => ({ ...fromDoc<Job>(d), userId: undefined })),
    documents: documents.map((d) => ({ ...fromDoc<Document>(d), userId: undefined })),
    interviews: interviews.map((i) => ({ jobId: i._id, questions: i.questions, previousQuestions: i.previousQuestions ?? [], questionVersion: i.questionVersion ?? 1, updatedAt: i.updatedAt })),
    payments: payments.map((d) => {
      const { provider, status, amountMinor, currency, createdAt } = fromDoc<Payment>(d);
      return { provider, status, amountMinor, currency, createdAt };
    }),
    subscriptions: subscriptions.map((d) => {
      const { status, interval, currency, amountMinor, startedAt, paidThrough, nextPaymentAt, cancelRequestedAt, cancelledAt, createdAt } = fromDoc<Subscription>(d);
      return { status, interval, currency, amountMinor, startedAt, paidThrough, nextPaymentAt, cancelRequestedAt, cancelledAt, createdAt };
    }),
  };
}
