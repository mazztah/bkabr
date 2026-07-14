"use client";

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";

export default function Dropzone({ compact = false }: { compact?: boolean }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFiles, isAnalyzing } = useStore();

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadFiles(Array.from(files));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragActive(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed transition-colors text-center ${
        isDragActive ? "border-primary bg-secondary" : "border-border hover:border-primary"
      } ${compact ? "p-4" : "p-10"}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,application/pdf,image/jpeg,image/png,text/plain"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {isAnalyzing ? (
        <p className="text-sm text-muted-foreground animate-pulse">
          KI analysiert Dokument(e) …
        </p>
      ) : (
        <>
          <div className="text-3xl mb-2">📤</div>
          <p className={compact ? "text-sm font-medium" : "text-lg font-medium"}>
            Dateien per Drag & Drop oder Klick hochladen
          </p>
          {!compact && (
            <p className="text-sm text-muted-foreground mt-1">
              PDF, JPG, PNG, TXT – KI erkennt automatisch Betriebskosten-, Neben- und
              Heizkostenabrechnungen sowie Mietverträge
            </p>
          )}
        </>
      )}
    </div>
  );
}
