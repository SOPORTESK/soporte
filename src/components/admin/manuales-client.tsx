"use client";

import { useState, useCallback } from "react";
import { UploadCloud, File, Image as ImageIcon, Video, X, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ManualesClient({ onUploadComplete }: { onUploadComplete?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/admin/manuales/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al subir archivos");
      }

      toast.success("¡Archivos procesados e indexados correctamente!");
      setFiles([]);
      router.refresh();
      if (onUploadComplete) onUploadComplete();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Error procesando el archivo");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm mb-8">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <UploadCloud className="h-5 w-5 text-brand-600" /> 
        Subir Nuevos Manuales
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Sube PDFs, imágenes o documentos de texto. El sistema extraerá el contenido, lo dividirá en fragmentos (chunks) y lo preparará para que la IA lo consulte.
      </p>

      {/* Dropzone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative rounded-xl border-2 border-dashed p-8 transition-colors flex flex-col items-center justify-center text-center cursor-pointer
          ${isDragging ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20" : "border-border hover:border-brand-300 hover:bg-muted/50"}
          ${uploading ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="h-12 w-12 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 grid place-items-center mb-3">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="font-medium">Arrastra tus archivos aquí o haz clic para explorar</p>
        <p className="text-xs text-muted-foreground mt-1">Soporta PDF, JPG, PNG, TXT y CSV (Max 10MB por archivo)</p>
      </div>

      {/* Lista de archivos a subir */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-medium">Archivos seleccionados ({files.length})</h3>
          <ul className="max-h-60 overflow-y-auto space-y-2 pr-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  {f.type.includes("pdf") ? (
                    <File className="h-5 w-5 text-red-500 shrink-0" />
                  ) : f.type.includes("image") ? (
                    <ImageIcon className="h-5 w-5 text-sky-500 shrink-0" />
                  ) : f.type.includes("video") ? (
                    <Video className="h-5 w-5 text-violet-500 shrink-0" />
                  ) : (
                    <File className="h-5 w-5 text-gray-500 shrink-0" />
                  )}
                  <div className="truncate">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                {!uploading && (
                  <button onClick={() => removeFile(i)} className="p-1 hover:bg-red-100 hover:text-red-600 rounded text-muted-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="flex justify-end pt-2">
            <button
              onClick={uploadFiles}
              disabled={uploading}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Procesando con IA...
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" /> Indexar {files.length} archivo{files.length > 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
