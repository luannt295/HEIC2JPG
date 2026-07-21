import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
  assert.match(html, /Tối đa <!-- -->20<!-- --> ảnh/);
  assert.match(html, /Không gửi ảnh lên máy chủ/);
  assert.doesNotMatch(html, /Something went wrong|codex-preview/);
});

test("keeps conversion local, lazy, and recoverable", async () => {
  const [converter, vanilla, packageJson, worker] = await Promise.all([
    readFile(new URL("../app/heic-converter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/vanilla.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.ok(packageJson.dependencies["heic-to"]);
  assert.ok(packageJson.dependencies.jszip);
  assert.doesNotMatch(`${converter}\n${vanilla}`, /cdn\.jsdelivr\.net/);
  assert.match(converter, /await import\("heic-to"\)/);
  assert.match(converter, /await import\("jszip"\)/);
  assert.match(converter, /MAX_FILES = 20/);
  assert.match(converter, /MAX_TOTAL_BYTES = 200 \* 1024 \* 1024/);
  assert.match(converter, /MAX_ZIP_FILES = 10/);
  assert.match(converter, /accept="image\/\*,\.heic,\.heif"/);
  assert.match(converter, /finally\s*{[^}]*setConverting\(false\)/);
  assert.match(converter, /finally\s*{[^}]*setZipping\(false\)/);
  assert.doesNotMatch(converter, /isHeicFile|files\.filter\(isHeic/);
  assert.match(converter, /if \(!\(await isHeic\(target\.file\)\)\)/);
  assert.match(converter, /File này không phải ảnh HEIC\/HEIF hợp lệ/);
  assert.ok(converter.indexOf("done.length > MAX_ZIP_FILES") < converter.indexOf('await import("jszip")'));
  assert.match(worker, /__VINEXT_LAZY_CHUNKS__.*heic-to.*jszip/);
  assert.doesNotMatch(worker, /readable-stream|libheif/i);
});

test("credits the public tool source", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Made with care by <strong>luannt295<\/strong>/);
});
