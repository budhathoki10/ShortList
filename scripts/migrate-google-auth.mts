// One-time move from password accounts to Google sign-in. Safe to run more than once.
//
//   npm run db:migrate-google
//
// What it does:
//   1. Removes the stored password hash from every user (nothing reads it any more).
//   2. Drops the auth_tokens collection (password-reset and email-confirmation links).
//   3. Signs everyone out. Accounts are kept: the next "Continue with Google" with the same email address
//      claims the existing account, with its CV, jobs and subscription, and marks the email as verified.
import { MongoClient } from "mongodb";
import { ensureIndexes } from "../src/db/indexes";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB || "shortlist");

const stripped = await db.collection("users").updateMany({ passwordHash: { $exists: true } }, { $unset: { passwordHash: "" } });
console.log(`Removed the password hash from ${stripped.modifiedCount} account(s).`);

const hadTokens = (await db.listCollections({ name: "auth_tokens" }).toArray()).length > 0;
if (hadTokens) await db.collection("auth_tokens").drop();
console.log(hadTokens ? "Dropped auth_tokens." : "auth_tokens was already gone.");

const signedOut = await db.collection("sessions").deleteMany({});
console.log(`Signed out ${signedOut.deletedCount} session(s); people sign back in with Google.`);

await ensureIndexes(db);
console.log("Indexes are in place (including one account per Google identity).");
await client.close();
