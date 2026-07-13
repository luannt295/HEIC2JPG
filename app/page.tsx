import type { Metadata } from "next";
import { HeicConverter } from "./heic-converter";

export const metadata: Metadata = {
  title: "Đổi HEIC sang JPG miễn phí | HEIC Simple",
  description:
    "Chuyển tối đa 200 ảnh HEIC từ iPhone sang JPG ngay trên thiết bị, không tải ảnh lên máy chủ.",
};

export default function Home() {
  return <HeicConverter />;
}
