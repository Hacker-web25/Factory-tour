"use client";

import type { Scene } from "@/lib/types";
import { publicUrl } from "@/lib/supabase";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";

export default function SceneStrip({
  scenes,
  activeId,
  onSelect,
  onDelete,
  onReorder,
  tourId,
  hidden,
}: {
  scenes: Scene[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  tourId: string;
  hidden?: boolean;
}) {
  return (
    <div
      style={hidden ? { display: "none" } : undefined}
      className="h-24 bg-panel border-t border-border flex items-center gap-2 px-3 overflow-x-auto panel-scroll"
    >
      {scenes.map((s, i) => (
        <div
          key={s.id}
          draggable
          onDragStart={(e) => {
            // For reorder-within-strip
            e.dataTransfer.setData("text/plain", String(i));
            // For drop-onto-panorama (create nav hotspot to this scene)
            e.dataTransfer.setData("application/x-scene-id", s.id);
            e.dataTransfer.effectAllowed = "copyMove";
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
            if (!isNaN(from)) onReorder(from, i);
          }}
          onClick={() => onSelect(s.id)}
          className={`relative shrink-0 w-28 h-16 rounded overflow-hidden border-2 cursor-grab active:cursor-grabbing group ${
            activeId === s.id ? "border-accent" : "border-transparent"
          }`}
          title={`Drag onto panorama to create a "go to ${s.name}" hotspot`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicUrl(s.image_path)}
            alt={s.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] px-1 truncate">
            {s.name}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(s.id);
            }}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded p-0.5"
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      <Link
        href={`/upload?tour=${tourId}`}
        className="shrink-0 w-28 h-16 rounded border-2 border-dashed border-border grid place-items-center text-neutral-400 hover:text-white hover:border-accent"
      >
        <Plus size={20} />
      </Link>
    </div>
  );
}
