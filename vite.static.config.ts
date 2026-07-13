import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function sitesSingleWorkerBuild(): Plugin {
  return {
    name: "sites-single-worker-build",
    apply: "build",
    async closeBundle() {
      const root = process.cwd();
      const clientDir = resolve(root, "dist/client");
      const serverDir = resolve(root, "dist/server");
      const openaiDir = resolve(root, "dist/.openai");
      await Promise.all([rm(serverDir, { recursive: true, force: true }), rm(openaiDir, { recursive: true, force: true })]);
      await Promise.all([mkdir(serverDir, { recursive: true }), mkdir(openaiDir, { recursive: true })]);

      let html = await readFile(resolve(clientDir, "index.html"), "utf8");
      const scriptPath = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/)?.[1];
      const stylePath = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/)?.[1];
      if (!scriptPath || !stylePath) throw new Error("Unable to inline production files");
      const [script, style, favicon] = await Promise.all([
        readFile(resolve(clientDir, scriptPath.slice(1)), "utf8"),
        readFile(resolve(clientDir, stylePath.slice(1)), "utf8"),
        readFile(resolve(clientDir, "favicon.svg"), "utf8"),
      ]);
      html = html
        .replace(`<link rel="stylesheet" crossorigin href="${stylePath}">`, `<style>${style}</style>`)
        .replace(`<script type="module" crossorigin src="${scriptPath}"></script>`, `<script type="module">${script.replaceAll("</script", "<\\/script")}</script>`)
        .replace('/favicon.svg', `data:image/svg+xml,${encodeURIComponent(favicon)}`);

      const encodedHtml = Buffer.from(html, "utf8").toString("base64");
      const worker = `const encodedHtml = "${encodedHtml}";
const html = new TextDecoder().decode(Uint8Array.from(atob(encodedHtml), (character) => character.charCodeAt(0)));
export default {
  fetch() {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  },
};
`;
      const wrangler = { name: "heic-simple-converter", main: "index.js", compatibility_date: "2026-05-15" };
      await Promise.all([
        writeFile(resolve(serverDir, "index.js"), worker),
        writeFile(resolve(serverDir, "wrangler.json"), JSON.stringify(wrangler)),
        cp(resolve(root, ".openai/hosting.json"), resolve(openaiDir, "hosting.json")),
      ]);
    },
  };
}

export default defineConfig({
  plugins: [sitesSingleWorkerBuild()],
  build: { outDir: "dist/client", emptyOutDir: true },
});
