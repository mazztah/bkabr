"use client";

import { useRef, useState } from "react";
import { SANDBOX_COLORS, StickyNote, useSandbox } from "@/lib/sandbox-context";

const FONTS = ["sans-serif", "serif", "monospace", "cursive"];

export default function SandboxNote({ note }: { note: StickyNote }) {
  const { updateNote, deleteNote } = useSandbox();
  const [showTools, setShowTools] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, x: note.x, y: note.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      updateNote(note.id, { x: dragRef.current.x + dx, y: dragRef.current.y + dy });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: note.w, h: note.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      updateNote(note.id, {
        w: Math.max(140, resizeRef.current.w + dw),
        h: Math.max(100, resizeRef.current.h + dh),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      style={{
        position: "fixed",
        left: note.x,
        top: note.y,
        width: note.w,
        height: note.h,
        background: note.color,
        zIndex: 200,
      }}
      className="pointer-events-auto flex flex-col rounded-lg shadow-lg ring-1 ring-black/10"
      onMouseEnter={() => setShowTools(true)}
      onMouseLeave={() => setShowTools(false)}
    >
      <div
        onMouseDown={onDragStart}
        className="flex cursor-grab items-center justify-between rounded-t-lg bg-black/10 px-2 py-1 active:cursor-grabbing"
      >
        <span className="text-[10px] font-semibold text-black/50">✥ Notiz</span>
        {showTools && (
          <button
            onClick={() => deleteNote(note.id)}
            className="rounded px-1.5 text-xs text-black/60 hover:bg-black/10"
            title="Löschen"
          >
            🗑
          </button>
        )}
      </div>

      <textarea
        value={note.text}
        onChange={(e) => updateNote(note.id, { text: e.target.value })}
        style={{ fontSize: note.fontSize, fontFamily: note.fontFamily }}
        className="flex-1 resize-none bg-transparent p-2 text-black/80 outline-none placeholder:text-black/40"
        placeholder="Notiz eingeben…"
      />

      {showTools && (
        <div className="flex items-center gap-1 rounded-b-lg bg-black/10 px-2 py-1">
          {SANDBOX_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => updateNote(note.id, { color: c })}
              style={{ background: c }}
              className="h-3.5 w-3.5 rounded-full ring-1 ring-black/20"
              title="Farbe"
            />
          ))}
          <select
            value={note.fontFamily}
            onChange={(e) => updateNote(note.id, { fontFamily: e.target.value })}
            className="ml-1 rounded bg-transparent text-[10px] text-black/60"
            title="Schriftart"
          >
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={note.fontSize}
            onChange={(e) => updateNote(note.id, { fontSize: Number(e.target.value) })}
            className="rounded bg-transparent text-[10px] text-black/60"
            title="Schriftgröße"
          >
            {[11, 14, 18, 24].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        onMouseDown={onResizeStart}
        className="absolute bottom-0.5 right-0.5 h-3 w-3 cursor-nwse-resize opacity-40"
        title="Größe ändern"
      >
        ◢
      </div>
    </div>
  );
}
