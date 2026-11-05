"use client";

import { useRouter } from "next/navigation";
import { Uploader } from "@/components/admin/media/Uploader";

export function MediaUploadPanel() {
  const router = useRouter();
  return <Uploader onUploaded={() => router.refresh()} />;
}
