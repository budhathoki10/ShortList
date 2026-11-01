import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function storageKey() {
  const secret = process.env.VAPID_PRIVATE_KEY;
  if (!secret) throw new Error("Web Push is not configured");
  return createHash("sha256").update("shortlist-push-storage:v1\0").update(secret).digest();
}

export function encryptPushSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", storageKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptPushSecret(value: string) {
  if (!value.startsWith(`${PREFIX}:`)) return value; // Compatibility for subscriptions created before encrypted storage shipped.
  const [, iv, tag, ciphertext] = value.split(":");
  if (!iv || !tag || !ciphertext) throw new Error("Stored push subscription is invalid");
  const decipher = createDecipheriv("aes-256-gcm", storageKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
