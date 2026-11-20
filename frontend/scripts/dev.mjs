import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { ensureBackend } from "./dev-backend.mjs";

let backend;
let vite;
const close = async () => {
  await vite?.close();
  backend?.kill();
};
try {
  backend = await ensureBackend({
    cwd: fileURLToPath(new URL("../../backend/", import.meta.url)),
    spawn,
  });
  vite = await createServer();
  await vite.listen();
  vite.printUrls();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => void close().then(() => process.exit(0)));
  }
  backend?.once("exit", () => void close().then(() => process.exit(1)));
} catch (error) {
  console.error(error.message);
  await close();
  process.exitCode = 1;
}
