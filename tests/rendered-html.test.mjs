import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("https://heic-jpg-converter-200.luan-nt295.chatgpt.site/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the HEIC converter", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Đổi ảnh HEIC sang JPG/);
  assert.match(html, /Tối đa <!-- -->200<!-- --> ảnh/);
  assert.match(html, /Không tải ảnh lên server/);
  assert.doesNotMatch(html, /Something went wrong|codex-preview/);
});

test("loads HEIC and ZIP modules only in the browser", async () => {
  const [converter, assetNames, worker] = await Promise.all([
    readFile(new URL("../app/heic-converter.tsx", import.meta.url), "utf8"),
    readdir(new URL("../dist/client/assets", import.meta.url)),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.match(converter, /MAX_FILES = 200/);
  assert.match(converter, /cdn\.jsdelivr\.net\/npm\/heic-to@1\.5\.2/);
  assert.match(converter, /cdn\.jsdelivr\.net\/npm\/jszip@3\.10\.1/);
  assert.doesNotMatch(assetNames.join("\n"), /heic-to|jszip/i);
  assert.doesNotMatch(worker, /readable-stream|libheif|heic-to/i);
});

test("credits the public tool source", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Made with care by <strong>luannt295<\/strong>/);
});
