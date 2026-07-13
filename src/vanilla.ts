import "./vanilla.css";

type Item = { id: string; file: File; output?: Blob; status: "ready" | "converting" | "done" | "error"; error?: string };
const MAX_FILES = 200;
const HEIC_URL = "https://cdn.jsdelivr.net/npm/heic-to@1.5.2/+esm";
const ZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = $("picker") as HTMLInputElement, dropzone = $("dropzone"), controls = $("controls"), filesBox = $("files"), notice = $("notice");
const quality = $("quality") as HTMLInputElement, qualityValue = $("qualityValue"), convertButton = $("convert") as HTMLButtonElement, downloadAll = $("downloadAll") as HTMLButtonElement;
let items: Item[] = [];

const jpgName = (name: string) => `${name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
const size = (n: number) => n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const isHeicName = (file: File) => /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
function save(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
function render() {
  controls.hidden = items.length === 0; filesBox.replaceChildren();
  for (const item of items) {
    const row = document.createElement("div"); row.className = `file ${item.status}`;
    const info = document.createElement("div"), name = document.createElement("strong"), meta = document.createElement("small"), button = document.createElement("button");
    name.textContent = item.file.name; meta.textContent = item.error ?? (item.status === "done" ? `Đã chuyển · ${size(item.output!.size)}` : item.status === "converting" ? "Đang chuyển đổi…" : size(item.file.size)); info.append(name, meta);
    button.textContent = item.status === "done" ? "↓ JPG" : "×";
    button.onclick = () => item.status === "done" ? save(item.output!, jpgName(item.file.name)) : (items = items.filter(x => x.id !== item.id), render());
    row.append(info, button); filesBox.append(row);
  }
  const done = items.filter(x => x.status === "done").length; downloadAll.hidden = done < 2; convertButton.hidden = done === items.length && items.length > 0;
  convertButton.textContent = `⚡ Chuyển ${items.filter(x => x.status !== "done").length} ảnh sang JPG`;
}
function addFiles(list: FileList | File[]) {
  const incoming = Array.from(list), valid = incoming.filter(isHeicName), remaining = Math.max(0, MAX_FILES - items.length);
  items.push(...valid.slice(0, remaining).map(file => ({ id: crypto.randomUUID(), file, status: "ready" as const })));
  notice.textContent = valid.length < incoming.length ? "Một số file không phải HEIC/HEIF đã được bỏ qua." : valid.length > remaining ? "Mỗi lượt tối đa 200 ảnh." : ""; render();
}
picker.onchange = () => { if (picker.files) addFiles(picker.files); picker.value = ""; };
for (const event of ["dragenter", "dragover"]) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add("drag"); });
for (const event of ["dragleave", "drop"]) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove("drag"); });
dropzone.addEventListener("drop", e => addFiles((e as DragEvent).dataTransfer!.files));
quality.oninput = () => qualityValue.textContent = `${quality.value}%`;
$("clear").onclick = () => { items = []; notice.textContent = ""; render(); };
convertButton.onclick = async () => {
  convertButton.disabled = true; notice.textContent = "";
  try {
    const { heicTo, isHeic } = await import(/* @vite-ignore */ HEIC_URL);
    for (const item of items.filter(x => x.status !== "done")) {
      item.status = "converting"; render();
      try { if (!(await isHeic(item.file))) throw new Error("File HEIC không hợp lệ"); item.output = await heicTo({ blob: item.file, type: "image/jpeg", quality: Number(quality.value) / 100 }); item.status = "done"; }
      catch { item.status = "error"; item.error = "Không thể đọc file này. Hãy chắc chắn ảnh đã tải đầy đủ từ iCloud."; }
      render();
    }
  } catch { notice.textContent = "Không tải được bộ chuyển đổi. Hãy kiểm tra Internet rồi thử lại."; }
  convertButton.disabled = false;
};
downloadAll.onclick = async () => {
  downloadAll.setAttribute("disabled", "");
  try { const { default: JSZip } = await import(/* @vite-ignore */ ZIP_URL); const zip = new JSZip(); items.filter(x => x.output).forEach((x, i) => zip.file(`${i + 1}-${jpgName(x.file.name)}`, x.output!)); save(await zip.generateAsync({ type: "blob" }), "heic-to-jpg.zip"); }
  catch { notice.textContent = "Không thể tạo ZIP. Bạn vẫn có thể tải từng ảnh JPG."; }
  downloadAll.removeAttribute("disabled");
};
