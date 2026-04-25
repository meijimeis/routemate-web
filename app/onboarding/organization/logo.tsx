"use client";

import { supabase } from "@/lib/supabaseClient";
import { useState } from "react";

type LogoUploaderProps = {
  onChange: (url: string) => void;
};

export default function LogoUploader({ onChange }: LogoUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      const file = e.target.files?.[0];
      if (!file) return;

      const ext = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const filePath = fileName;

      const { error } = await supabase.storage
        .from("organization-logos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      const { data } = supabase.storage
        .from("organization-logos")
        .getPublicUrl(filePath);

      onChange(data.publicUrl);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      alert(error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <label className="cursor-pointer">
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={handleUpload}
      />
      <span className="px-4 py-2 border rounded text-indigo-600">
        {uploading ? "Uploading..." : "Upload Logo"}
      </span>
    </label>
  );
}
