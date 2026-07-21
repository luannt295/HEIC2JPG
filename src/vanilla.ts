import "./vanilla.css";

type Item = { id: string; file: File; output?: Blob; status: "ready" | "converting" | "done" | "error"; error?: string };
const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_FILES = 10;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = $("picker") as HTMLInputElement, dropzone = $("dropzone"), controls = $("controls"), filesBox = $("files"), notice = $("notice");
const quality = $("quality") as HTMLInputElement, qualityValue = $("qualityValue"), convertButton = $("convert") as HTMLButtonElement, downloadAll = $("downloadAll") as HTMLButtonElement;
let items: Item[] = [];

const jpgName = (name: string) => `${name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
const size = (n: number) => n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const totalInputBytes = () => items.reduce((total, item) => total + item.file.size, 0);
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
  const accepted: File[] = [];
  let acceptedBytes = 0, rejectedByCount = 0, rejectedBySize = 0;
  const remainingBytes = MAX_TOTAL_BYTES - totalInputBytes();
  for (const file of Array.from(list)) {
    if (accepted.length >= MAX_FILES - items.length) rejectedByCount++;
    else if (acceptedBytes + file.size > remainingBytes) rejectedBySize++;
    else { accepted.push(file); acceptedBytes += file.size; }
  }
  items.push(...accepted.map(file => ({ id: crypto.randomUUID(), file, status: "ready" as const })));
  notice.textContent = [rejectedByCount && `${rejectedByCount} file vượt giới hạn ${MAX_FILES} ảnh`, rejectedBySize && `${rejectedBySize} file vượt giới hạn tổng 200 MB`].filter(Boolean).join("; ");
  render();
}
picker.onchange = () => { if (picker.files) addFiles(picker.files); picker.value = ""; };
for (const event of ["dragenter", "dragover"]) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add("drag"); });
for (const event of ["dragleave", "drop"]) dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove("drag"); });
dropzone.addEventListener("drop", e => addFiles((e as DragEvent).dataTransfer!.files));
quality.oninput = () => qualityValue.textContent = `${quality.value}%`;
$("clear").onclick = () => { items = []; notice.textContent = ""; render(); };
convertButton.onclick = async () => {
  if (convertButton.disabled || downloadAll.disabled) return;
  convertButton.disabled = downloadAll.disabled = true; notice.textContent = "";
  try {
    const { heicTo, isHeic } = await import("heic-to");
    for (const item of items.filter(x => x.status !== "done")) {
      item.status = "converting"; item.error = undefined; render();
      try { if (!(await isHeic(item.file))) { item.status = "error"; item.error = "File này không phải ảnh HEIC/HEIF hợp lệ."; render(); continue; } item.output = await heicTo({ blob: item.file, type: "image/jpeg", quality: Number(quality.value) / 100 }); item.status = "done"; }
      catch { item.status = "error"; item.error = "Không thể đọc file này. Hãy chắc chắn ảnh đã tải đầy đủ từ iCloud."; }
      render();
    }
  } catch { notice.textContent = "Không thể tải bộ chuyển đổi trên thiết bị này. Hãy tải lại trang rồi thử lại."; }
  finally { convertButton.disabled = downloadAll.disabled = false; }
};
downloadAll.onclick = async () => {
  if (downloadAll.disabled || convertButton.disabled) return;
  const done = items.filter(x => x.output);
  if (done.length > MAX_ZIP_FILES) { notice.textContent = `ZIP được giới hạn ${MAX_ZIP_FILES} ảnh để tránh dùng quá nhiều bộ nhớ trên điện thoại. Hãy tải từng ảnh riêng.`; return; }
  downloadAll.disabled = convertButton.disabled = true;
  try { const { default: JSZip } = await import("jszip"); const zip = new JSZip(); done.forEach((x, i) => zip.file(`${i + 1}-${jpgName(x.file.name)}`, x.output!)); save(await zip.generateAsync({ type: "blob" }), "heic-to-jpg.zip"); }
  catch { notice.textContent = "Không thể tạo ZIP. Bạn vẫn có thể tải từng ảnh JPG."; }
  finally { downloadAll.disabled = convertButton.disabled = false; }
};
