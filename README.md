# HEIC2JPG

Công cụ TypeScript chuyển ảnh HEIC/HEIF từ iPhone sang JPG ngay trong trình duyệt.

**Live demo:** https://heic-jpg-converter-200.pages.dev/

## Tính năng

- Chọn hoặc kéo thả tối đa 20 ảnh HEIC/HEIF, tổng dung lượng tối đa 200 MB.
- Điều chỉnh chất lượng JPG từ 50% đến 100%.
- Tải từng ảnh JPG hoặc tải tối đa 10 ảnh trong một file ZIP.
- Ảnh được xử lý trực tiếp trên thiết bị, không gửi lên máy chủ.
- Giao diện responsive cho máy tính và điện thoại.

## Chạy local

Yêu cầu Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Mở URL được Vite hiển thị trong terminal.

## Build

```bash
npm run build
```

Bản static dùng cho Cloudflare Pages được tạo bằng:

```bash
npx vite build --config vite.static.config.ts
```

Output nằm trong `dist/client`.

## Công nghệ

- TypeScript
- Vite
- `heic-to`
- JSZip
- Cloudflare Pages

## Tác giả

**luannt295**
