"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import GlassCard from "./GlassCard";
import { cn } from "@/lib/utils";

export default function GlassDropzone({
  onDrop,
  children,
}: {
  onDrop: (files: File[]) => void;
  children?: React.ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onDrop(Array.from(e.dataTransfer.files));
  };

  return (
    <GlassCard
      hover={false}
      className={cn(
        "border-2 border-dashed border-border transition-colors",
        isDragging && "border-primary bg-primary/5 scale-[1.01]"
      )}
      onClick={() => document.getElementById("gdz-file-input")?.click()}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <input
          id="gdz-file-input"
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onDrop(Array.from(e.target.files))}
        />
        <Upload className="mb-4 h-10 w-10 text-primary" />
        <p className="font-medium">Dokumente hierher ziehen</p>
        <p className="mt-1 text-sm text-muted-foreground">oder klicken zum Hochladen</p>
        {children}
      </div>
    </GlassCard>
  );
}
