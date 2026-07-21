"use client";

import { ChangeEvent, DragEvent, useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  FileImage,
  Images,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";

type Status = "ready" | "converting" | "done" | "error";
type Item = { id: string; file: File; status: Status; output?: Blob; preview?: string; error?: string };
type SaveHandle = { createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> };
type PickerWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<SaveHandle> };

const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_FILES = 10;

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const jpgName = (name: string) => `${name.replace(/\.[^.]+$/, "") || "image"}.jpg`;

const totalInputBytes = (items: Item[]) => items.reduce((total, item) => total + item.file.size, 0);

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const lower = raw.toLowerCase();
  if (lower.includes("memory") || lower.includes("allocation")) return "Thiết bị không đủ bộ nhớ. Hãy chuyển ít ảnh hơn trong mỗi lượt.";
  if (lower.includes("invalid") || lower.includes("corrupt") || lower.includes("input")) return "File bị lỗi hoặc chưa tải đầy đủ từ iCloud. Hãy tải file về máy rồi thử lại.";
  if (lower.includes("unsupported") || lower.includes("codec")) return "Kiểu ảnh này chưa được hỗ trợ. Hãy thử Chrome hoặc Edge mới nhất.";
  return raw ? `Không thể đọc ảnh: ${raw}` : "Không thể chuyển đổi file này.";
}

async function pickSaveTarget(name: string, mime: string) {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) return undefined;
  try {
    return await picker.call(window, {
      suggestedName: name,
      types: [{
        description: mime === "application/zip" ? "Tệp ZIP" : "Ảnh JPEG",
        accept: { [mime]: mime === "application/zip" ? [".zip"] : [".jpg", ".jpeg"] },
      }],
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return undefined;
  }
}

async function saveBlob(blob: Blob, name: string, handle?: SaveHandle) {
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function HeicConverter() {
  const inputId = useId();
  const itemsRef = useRef<Item[]>([]);
  const busyRef = useRef(false);
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQuality] = useState(0.9);
  const [dragging, setDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [notice, setNotice] = useState<string>();

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), []);

  const done = items.filter((item) => item.status === "done" && item.output);
  const pending = items.filter((item) => item.status === "ready" || item.status === "error").length;

  function addFiles(files: File[]) {
    const existing = new Set(items.map(({ file }) => `${file.name}-${file.size}-${file.lastModified}`));
    const unique = files.filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`));
    const remainingBytes = MAX_TOTAL_BYTES - totalInputBytes(items);
    const accepted: File[] = [];
    let acceptedBytes = 0;
    let rejectedByCount = 0;
    let rejectedBySize = 0;
    for (const file of unique) {
      if (accepted.length >= MAX_FILES - items.length) rejectedByCount++;
      else if (acceptedBytes + file.size > remainingBytes) rejectedBySize++;
      else { accepted.push(file); acceptedBytes += file.size; }
    }
    setItems((current) => [...current, ...accepted.map((file) => ({ id: crypto.randomUUID(), file, status: "ready" as const }))]);
    const warnings = [
      rejectedByCount && `${rejectedByCount} file vượt giới hạn ${MAX_FILES} ảnh`,
      rejectedBySize && `${rejectedBySize} file vượt giới hạn tổng ${formatSize(MAX_TOTAL_BYTES)}`,
    ].filter(Boolean);
    setNotice(warnings.length ? `${warnings.join("; ")}.` : undefined);
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!converting && !zipping) addFiles(Array.from(event.dataTransfer.files));
  }

  function remove(id: string) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((candidate) => candidate.id !== id);
    });
  }

  function clear() {
    items.forEach((item) => item.preview && URL.revokeObjectURL(item.preview));
    setItems([]);
    setNotice(undefined);
  }

  async function convert() {
    const targets = items.filter((item) => item.status !== "done");
    if (!targets.length || busyRef.current) return;
    busyRef.current = true;
    setConverting(true);
    setNotice(undefined);
    try {
      const { heicTo, isHeic } = await import("heic-to");
      for (const target of targets) {
        if (target.preview) URL.revokeObjectURL(target.preview);
        setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: "converting", output: undefined, preview: undefined, error: undefined } : item));
        try {
          if (!(await isHeic(target.file))) {
            setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: "error", error: "File này không phải ảnh HEIC/HEIF hợp lệ." } : item));
            continue;
          }
          const output = await heicTo({ blob: target.file, type: "image/jpeg", quality });
          if (!output.size) throw new Error("Empty image");
          const preview = URL.createObjectURL(output);
          setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: "done", output, preview } : item));
        } catch (error) {
          setItems((current) => current.map((item) => item.id === target.id ? { ...item, status: "error", error: errorMessage(error) } : item));
        }
      }
    } catch {
      setNotice("Không thể tải bộ chuyển đổi trên thiết bị này. Hãy tải lại trang rồi thử lại.");
    } finally {
      busyRef.current = false;
      setConverting(false);
    }
  }

  async function downloadOne(item: Item) {
    if (!item.output) return;
    const name = jpgName(item.file.name);
    const handle = await pickSaveTarget(name, "image/jpeg");
    if (handle === null) return;
    try {
      await saveBlob(item.output, name, handle);
      setNotice(`Đã lưu ${name}. Nếu không thấy, hãy kiểm tra thư mục Downloads.`);
    } catch { setNotice("Không thể lưu ảnh. Hãy thử Chrome hoặc Edge."); }
  }

  async function downloadAll() {
    if (!done.length || busyRef.current) return;
    if (done.length === 1) return downloadOne(done[0]);
    if (done.length > MAX_ZIP_FILES) {
      setNotice(`ZIP được giới hạn ${MAX_ZIP_FILES} ảnh để tránh dùng quá nhiều bộ nhớ trên điện thoại. Hãy tải từng ảnh riêng.`);
      return;
    }
    busyRef.current = true;
    setZipping(true);
    try {
      const name = "heic-to-jpg.zip";
      const handle = await pickSaveTarget(name, "application/zip");
      if (handle === null) return;
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const used = new Set<string>();
      done.forEach((item, index) => {
        let filename = jpgName(item.file.name);
        if (used.has(filename.toLowerCase())) filename = filename.replace(/\.jpg$/i, `-${index + 1}.jpg`);
        used.add(filename.toLowerCase());
        zip.file(filename, item.output!);
      });
      await saveBlob(await zip.generateAsync({ type: "blob" }), name, handle);
      setNotice(`Đã lưu ${done.length} ảnh trong ${name}.`);
    } catch { setNotice("Không thể lưu ZIP. Hãy thử tải từng ảnh riêng."); }
    finally { busyRef.current = false; setZipping(false); }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f7f2] text-[#18332b]">
      <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(#8eaa9f_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-[#f6c85f]/25 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#173f35] text-white shadow-lg"><Images size={21} /></span>
            <span><strong className="block text-base leading-tight">HEIC Simple</strong><span className="text-xs text-[#60756e]">Ảnh iPhone, dùng ở mọi nơi</span></span>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#dbe3dd] bg-white/80 px-4 py-2 text-xs font-medium text-[#506861] sm:flex"><LockKeyhole size={14} /> Xử lý riêng tư trên thiết bị</div>
        </header>

        <section className="mx-auto w-full max-w-3xl flex-1 py-12 sm:py-16">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5eee9] px-3 py-1.5 text-xs font-semibold text-[#2f6655]"><Sparkles size={14} /> Miễn phí · Không cần đăng ký</div>
            <h1 className="text-balance text-4xl font-black tracking-[-0.045em] text-[#163b31] sm:text-5xl">Đổi ảnh HEIC sang JPG<span className="block text-[#de8c35]">nhanh và thật đơn giản.</span></h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-6 text-[#60756e] sm:text-base">Chọn ảnh từ thiết bị. Ảnh được xử lý ngay trên thiết bị và không gửi lên máy chủ.</p>
          </div>

          <div className="rounded-[28px] border border-[#d8e1dc] bg-white/90 p-3 shadow-[0_22px_70px_-28px_rgba(28,65,54,.35)] sm:p-5">
            <input id={inputId} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" onChange={onInput} disabled={converting || zipping} />
            <label htmlFor={inputId} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
              className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-5 text-center transition ${dragging ? "border-[#de8c35] bg-[#fff8ea]" : "border-[#bfd0c8] bg-[#f5f8f5] hover:border-[#5d8f7d]"} ${converting || zipping ? "pointer-events-none opacity-60" : ""}`}>
              <span className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#dfece5] text-[#286250]"><UploadCloud size={31} /></span>
              <span className="text-lg font-bold text-[#24483e]">Chọn ảnh HEIC/HEIF từ thiết bị</span>
              <span className="mt-1.5 text-sm text-[#71857e]">Chạm để chọn ảnh hoặc kéo thả trên máy tính</span>
              <span className="mt-5 rounded-lg border border-[#d5dfd9] bg-white px-4 py-2 text-xs font-semibold shadow-sm">Chọn ảnh</span>
              <span className="mt-3 text-[11px] text-[#8b9b95]">Hỗ trợ .HEIC và .HEIF · Tối đa {MAX_FILES} ảnh</span>
            </label>

            {notice && <div role="status" className="mt-3 flex items-center justify-between rounded-xl bg-[#fff5df] px-4 py-3 text-xs font-medium text-[#895b1d]"><span>{notice}</span><button onClick={() => setNotice(undefined)} aria-label="Đóng" className="rounded p-1 hover:bg-black/5"><X size={14} /></button></div>}

            {!!items.length && <div className="mt-5">
              <div className="mb-3 flex items-center justify-between px-1"><div><h2 className="text-sm font-bold">Ảnh đã chọn ({items.length})</h2><p className="text-xs text-[#7b8e87]">Chất lượng JPG: {Math.round(quality * 100)}%</p></div><button onClick={clear} disabled={converting || zipping} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#a64c42] hover:bg-[#fff0ed]"><Trash2 size={14} /> Xóa tất cả</button></div>
              <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                {items.map((item) => <article key={item.id} className="flex items-center gap-3 rounded-xl border border-[#e1e8e4] bg-[#fafcfb] p-3">
                  {item.preview ? <img src={item.preview} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#e8f0ec] text-[#4d7669]"><FileImage size={22} /></span>}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.file.name}</p><p className={`mt-0.5 text-xs ${item.status === "error" ? "text-[#b24f43]" : "text-[#82928d]"}`}>{item.status === "ready" && `${formatSize(item.file.size)} · Sẵn sàng`}{item.status === "converting" && "Đang chuyển đổi…"}{item.status === "done" && `${formatSize(item.output?.size ?? 0)} · Hoàn tất`}{item.status === "error" && item.error}</p></div>
                  <div className="flex items-center gap-1">{item.status === "converting" && <LoaderCircle className="animate-spin text-[#de8c35]" size={19} />}{item.status === "done" && <><span className="grid h-7 w-7 place-items-center rounded-full bg-[#dff3e8] text-[#278159]"><Check size={15} /></span><button onClick={() => void downloadOne(item)} aria-label={`Tải ${jpgName(item.file.name)}`} className="rounded-lg p-2 hover:bg-[#e8f0ec]"><ArrowDownToLine size={17} /></button></>}{!converting && !zipping && <button onClick={() => remove(item.id)} aria-label={`Xóa ${item.file.name}`} className="rounded-lg p-2 text-[#8b9b95] hover:bg-[#fff0ed]"><X size={17} /></button>}</div>
                </article>)}
              </div>
              <div className="mt-5 rounded-xl bg-[#f3f6f4] p-4"><label htmlFor="quality" className="mb-2 flex justify-between text-xs font-semibold"><span>Chất lượng ảnh</span><span>{Math.round(quality * 100)}%</span></label><input id="quality" type="range" min="0.5" max="1" step="0.05" value={quality} onChange={(e) => setQuality(Number(e.target.value))} disabled={converting || zipping || !!done.length} className="h-2 w-full accent-[#de8c35] disabled:opacity-50" /></div>
              {done.length > MAX_ZIP_FILES && <p role="status" className="mt-3 text-center text-xs text-[#895b1d]">ZIP tối đa {MAX_ZIP_FILES} ảnh để giảm dùng bộ nhớ. Bạn vẫn có thể tải từng ảnh JPG.</p>}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">{!!pending && <button onClick={() => void convert()} disabled={converting || zipping} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#173f35] px-5 font-bold text-white transition hover:bg-[#215546] disabled:opacity-50">{converting ? <><LoaderCircle className="mr-2 animate-spin" size={18} /> Đang chuyển đổi…</> : <><Zap className="mr-2" size={18} /> Chuyển {pending} ảnh sang JPG</>}</button>}{!!done.length && <button onClick={() => void downloadAll()} disabled={zipping || converting} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#de8c35] px-5 font-bold text-[#2e2518] hover:bg-[#eda14b] disabled:opacity-50">{zipping ? <><LoaderCircle className="mr-2 animate-spin" size={18} /> Đang tạo ZIP…</> : <><ArrowDownToLine className="mr-2" size={18} /> {done.length === 1 ? "Tải ảnh JPG" : `Tải ${done.length} ảnh (.ZIP)`}</>}</button>}</div>
            </div>}
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">{[[LockKeyhole, "Riêng tư", "Không gửi ảnh lên máy chủ"], [Zap, "Ổn định", "Xử lý tối đa 20 ảnh mỗi lượt"], [ArrowDownToLine, "Tiện lợi", "Tải từng JPG hoặc ZIP nhỏ"]].map(([Icon, title, desc]) => { const Feature = Icon as typeof LockKeyhole; return <div key={title as string} className="flex items-center gap-3 rounded-2xl border border-[#dfe6e1] bg-white/55 p-4"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#e5eee9] text-[#386c5c]"><Feature size={17} /></span><span><strong className="block text-xs">{title as string}</strong><span className="text-[11px] text-[#7a8e87]">{desc as string}</span></span></div>; })}</div>
        </section>
        <footer className="pb-2 text-center text-[11px] text-[#879891]">HEIC Simple · Hoạt động hoàn toàn trong trình duyệt</footer>
      </div>
    </main>
  );
}
