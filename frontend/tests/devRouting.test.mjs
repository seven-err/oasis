import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfig } from "vite";

test("development page navigation loads editable React while account requests reach Laravel", async () => {
  const config = await resolveConfig({}, "serve");
  const proxy = Object.values(config.server.proxy)[0];
  const request = (url, method = "GET", accept = "text/html") =>
    proxy.bypass({ url, method, headers: { accept } });

  for (const page of [
    "/dashboard",
    "/hr/alphalist",
    "/checks",
    "/users",
    "/settings",
    "/account",
  ]) {
    assert.equal(request(page), "/index.html", page);
    assert.equal(request(page, "GET", "application/json"), undefined, page);
    assert.equal(request(page, "POST"), undefined, page);
    assert.equal(request(page, "PUT"), undefined, page);
  }
  for (const url of [
    "/auth/session",
    "/login",
    "/logout",
    "/change-password",
    "/business-state",
    "/business-files/checks/receipt.pdf",
    "/oasis/assets/app.js",
    "/build/assets/app.css",
  ]) {
    assert.equal(request(url), undefined, url);
  }
});
