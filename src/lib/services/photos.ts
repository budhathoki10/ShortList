import "server-only";
import sharp from "sharp";
import { collections } from "@/db/mongo";

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const SIZE = 600;

export class PhotoError extends Error {}

const looksLikeImage = (b: Uint8Array) =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || // JPEG
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || // PNG
  (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50); // RIFF....WEBP

/**
 * Decode and re-encode to a square WebP. Re-encoding drops all metadata (EXIF, including GPS
 * location) and anything hidden after the image data. Files that don't decode are refused.
 */
export async function normalisePhoto(bytes: Uint8Array): Promise<Buffer> {
  if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoError("This photo exceeds the 3 MB limit. Upload a smaller image.");
  if (!looksLikeImage(bytes)) throw new PhotoError("Upload a JPEG, PNG or WebP photo.");
  try {
    return await sharp(bytes, { limitInputPixels: 50_000_000 })
      .rotate() // respect the camera's orientation before the metadata is dropped
      .resize(SIZE, SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new PhotoError("Unable to read this image. Upload another JPEG, PNG or WebP photo.");
  }
}

export async function savePhoto(userId: string, bytes: Uint8Array) {
  const image = await normalisePhoto(bytes);
  await (await collections()).photos.updateOne({ _id: String(userId) }, { $set: { image, updatedAt: new Date(), onCv: true } }, { upsert: true });
}

/** The stored photo as plain bytes, or null. (The driver hands binary back as a Binary whose `.buffer` is the bytes.) */
export async function getPhoto(userId: string): Promise<{ image: Buffer; updatedAt: Date } | null> {
  const row = await (await collections()).photos.findOne({ _id: String(userId) });
  if (!row) return null;
  const raw = row.image as unknown as { buffer?: Uint8Array } | Uint8Array;
  const bytes = raw instanceof Uint8Array ? raw : (raw.buffer as Uint8Array);
  return { image: Buffer.from(bytes), updatedAt: row.updatedAt };
}

/** The stored photo and whether it is switched on for CVs. The URL changes whenever the photo does so browsers don't show an old one. */
export async function photoStatus(userId: string): Promise<{ url: string; onCv: boolean } | null> {
  const row = await (await collections()).photos.findOne({ _id: String(userId) }, { projection: { updatedAt: 1, onCv: 1 } });
  return row ? { url: `/app/photo?v=${row.updatedAt.getTime()}`, onCv: row.onCv !== false } : null;
}

/** The URL a CV uses for the photo: null when there is none, or when the person turned it off. */
export async function photoUrl(userId: string): Promise<string | null> {
  const status = await photoStatus(userId);
  return status?.onCv ? status.url : null;
}

/** The photo bytes for a downloaded CV: null when there is none, or when the person turned it off. */
export async function getCvPhoto(userId: string) {
  return (await photoStatus(userId))?.onCv ? getPhoto(userId) : null;
}

export async function setPhotoOnCv(userId: string, onCv: boolean) {
  await (await collections()).photos.updateOne({ _id: String(userId) }, { $set: { onCv } });
}

export async function deletePhoto(userId: string) {
  await (await collections()).photos.deleteOne({ _id: String(userId) });
}
