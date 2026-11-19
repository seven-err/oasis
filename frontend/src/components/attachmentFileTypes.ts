const extensionMimeTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  hif: "image/heif",
  pdf: "application/pdf",
};

export const ATTACHMENT_TYPES = [
  ...new Set(Object.values(extensionMimeTypes)),
  "image/heic-sequence",
  "image/heif-sequence",
];
export const ATTACHMENT_EXTENSIONS = Object.keys(extensionMimeTypes).map((extension) => `.${extension}`);
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_EXTENSIONS, ...ATTACHMENT_TYPES].join(",");
export const ATTACHMENT_FORMATS = "JPG, PNG, WebP, GIF, AVIF, HEIC/HEIF, or PDF";

export function attachmentMimeType(file: Pick<File, "name" | "type">): string | null {
  const reported = file.type.toLowerCase();
  if (reported === "image/jpg" || reported === "image/pjpeg") return "image/jpeg";
  if (ATTACHMENT_TYPES.includes(reported)) return reported;
  if (reported && reported !== "application/octet-stream" && reported !== "binary/octet-stream") return null;
  const dot = file.name.lastIndexOf(".");
  const extension = dot < 0 ? "" : file.name.slice(dot + 1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(extensionMimeTypes, extension) ? extensionMimeTypes[extension] : null;
}

export function normalizeAttachmentFile(file: File): File {
  const mimeType = attachmentMimeType(file);
  if (!mimeType || mimeType === file.type) return file;
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
}
