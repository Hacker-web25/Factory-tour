"use client";

import { useState } from "react";
import { ICON_LIBRARY } from "@/lib/iconLibrary";
import { supabase, publicUrl } from "@/lib/supabase";
import { X, Upload } from "lucide-react";

type Tab = "library" | "upload";

type Props = {
  tint: string;
  onClose: () => void;
  onPick: (val: { icon_key?: string | null; icon_url?: string | null }) => void;
};

export default function IconPicker({ tint, onClose, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("library");
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `icons/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("panoramas")
        .upload(path, file);
      if (error) {
        alert(error.message);
        return;
      }
      onPick({ icon_url: publicUrl(path), icon_key: null });
      onClose();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 grid place-items-center z-50"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-panel border border-border rounded-lg w-[480px] max-w-full p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Change image</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 border-b border-border">
          <TabBtn active={tab === "library"} onClick={() => setTab("library")}>
            Built-in
          </TabBtn>
          <TabBtn active={tab === "upload"} onClick={() => setTab("upload")}>
            Upload
          </TabBtn>
        </div>

        {tab === "library" && (
          <div className="grid grid-cols-6 gap-2 max-h-[380px] overflow-auto panel-scroll">
            {ICON_LIBRARY.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => {
                  onPick({ icon_key: key, icon_url: null });
                  onClose();
                }}
                title={label}
                className="aspect-square bg-panelSoft border border-border rounded grid place-items-center hover:border-accent transition"
              >
                <Icon size={24} color={tint} />
              </button>
            ))}
          </div>
        )}

        {tab === "upload" && (
          <label
            className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${
              uploading ? "border-accent" : "border-border"
            }`}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <Upload size={28} className="mx-auto text-neutral-400 mb-2" />
            <div className="text-sm text-neutral-300">
              {uploading ? "Uploading…" : "Click to select an image"}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              PNG, JPG, SVG or WebP. Best with a transparent background.
            </div>
          </label>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs ${
        active
          ? "text-white border-b-2 border-accent"
          : "text-neutral-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
