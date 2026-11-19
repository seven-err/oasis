import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { attachmentMimeType, normalizeAttachmentFile } from "../src/components/attachmentFileTypes.ts";

test("mobile image metadata preserves the original file and infers missing types", async () => {
  const original = new File([new Uint8Array([1, 2, 3])], "IMG_001.HEIC", { lastModified: 123 });
  const normalized = normalizeAttachmentFile(original);
  assert.equal(normalized.type, "image/heic");
  assert.equal(normalized.name, original.name);
  assert.equal(normalized.lastModified, original.lastModified);
  assert.deepEqual(await normalized.arrayBuffer(), await original.arrayBuffer());
  assert.equal(attachmentMimeType({ name: "photo.heif", type: "application/octet-stream" }), "image/heif");
  assert.equal(attachmentMimeType({ name: "photo.jpeg", type: "image/pjpeg" }), "image/jpeg");
  assert.equal(attachmentMimeType({ name: "photo.jpg", type: "text/html" }), null);
  for (const name of ["photo.svg", "photo.exe", "jpg", "photo.__proto__"]) {
    assert.equal(attachmentMimeType({ name, type: "" }), null);
  }
});

test("check and receivable uploads accept mobile photo formats and retain size limits", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const checks = await server.ssrLoadModule("/src/modules/checks/validation.ts");
    const receivables = await server.ssrLoadModule("/src/modules/receivables/validation.ts");
    const accepted = (file) => {
      assert.equal(checks.validateAttachmentFile(file), null);
      assert.equal(receivables.validateAttachmentFile(file).ok, true);
    };
    for (const [extension, type] of [["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["gif", "image/gif"], ["avif", "image/avif"], ["heic", "image/heic"], ["heif", "image/heif"], ["pdf", "application/pdf"]]) {
      for (const reported of [type, "", "application/octet-stream"]) {
        accepted(new File(["photo"], `IMG_001.${extension.toUpperCase()}`, { type: reported }));
      }
    }
    const limit = 5 * 1024 * 1024;
    accepted(new File([new Uint8Array(limit)], "photo.heic", { type: "image/heic" }));
    for (const file of [new File([], "empty.jpg"), new File([new Uint8Array(limit + 1)], "large.heic"), new File(["x"], "file.exe"), new File(["x"], "file.jpg", { type: "text/html" })]) {
      assert.ok(checks.validateAttachmentFile(file));
      assert.equal(receivables.validateAttachmentFile(file).ok, false);
    }
  } finally {
    await server.close();
  }
});
