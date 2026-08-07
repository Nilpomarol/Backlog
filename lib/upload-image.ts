"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./firebase-client";

// Shared client-side image pipeline for user-supplied pictures (app logos, profile photos).
// Validate → downscale + re-encode to WebP under the size cap → upload to Firebase Storage.
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 512;
export const IMAGE_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export type ImageUploadErrorCode = "type" | "source-too-large" | "svg-too-large" | "compress" | "upload";

/** A typed failure so each caller can map to its own localised copy. */
export class ImageUploadError extends Error {
  readonly code: ImageUploadErrorCode;
  constructor(code: ImageUploadErrorCode) {
    super(code);
    this.name = "ImageUploadError";
    this.code = code;
  }
}

/**
 * Downscales to IMAGE_MAX_DIMENSION and re-encodes as WebP, backing off in quality until the
 * result fits IMAGE_MAX_BYTES. These pictures only ever render at a few dozen px, so this loses
 * nothing visible while turning multi-megabyte camera photos into a few KB.
 */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageUploadError("compress");
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= IMAGE_MAX_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
      }
    }
    throw new ImageUploadError("compress");
  } finally {
    bitmap.close();
  }
}

/**
 * Validates, compresses if needed, and uploads `file` to `${folder}/{uuid}.{ext}`, returning the
 * download URL. Throws {@link ImageUploadError} with a code the caller maps to user-facing copy.
 */
export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) throw new ImageUploadError("type");
  if (file.size > IMAGE_MAX_SOURCE_BYTES) throw new ImageUploadError("source-too-large");
  if (file.type === "image/svg+xml" && file.size > IMAGE_MAX_BYTES) throw new ImageUploadError("svg-too-large");

  // compressImage throws ImageUploadError("compress"); let it propagate untouched.
  const upload =
    file.type !== "image/svg+xml" && file.size > IMAGE_MAX_BYTES ? await compressImage(file) : file;

  try {
    const storage = getFirebaseStorage();
    const extension = EXTENSION_BY_TYPE[upload.type] ?? "png";
    const storageRef = ref(storage, `${folder}/${crypto.randomUUID()}.${extension}`);
    await uploadBytes(storageRef, upload, { contentType: upload.type });
    return await getDownloadURL(storageRef);
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError("upload");
  }
}
