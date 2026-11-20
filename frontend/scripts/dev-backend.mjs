import { setTimeout } from "node:timers/promises";
import { resolve } from "node:path";

export async function ensureBackend({ cwd, spawn, url = "http://127.0.0.1:8000/auth/session" }) {
  const ready = async () => {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1500),
        redirect: "manual",
      });
      return (
        response.status === 401 &&
        response.headers.get("content-type")?.includes("application/json")
      );
    } catch {
      return false;
    }
  };
  if (await ready()) return null;
  console.log("Starting the local Laravel backend (using backend/.env and its shared database)...");
  const child = spawn(
    process.env.PHP_BINARY || "php",
    [
      "-d",
      "post_max_size=16M",
      "-d",
      "upload_max_filesize=10M",
      "-S",
      "127.0.0.1:8000",
      "-t",
      ".",
      resolve(cwd, "vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php"),
    ],
    {
      cwd: resolve(cwd, "public"),
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        APP_ENV: "local",
        APP_URL: "http://127.0.0.1:8000",
        SESSION_SECURE_COOKIE: "false",
      },
    },
  );
  let failure;
  child.once("error", (error) => {
    failure = error;
  });
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (failure) throw failure;
      if (child.exitCode !== null)
        throw new Error("The local Laravel backend stopped. Check PHP and backend/.env.");
      if (await ready()) return child;
      await setTimeout(250);
    }
    throw new Error(
      "Laravel did not become ready on port 8000. Check PHP, MySQL, backend/.env, and whether another app uses that port.",
    );
  } catch (error) {
    child.kill();
    throw error;
  }
}
