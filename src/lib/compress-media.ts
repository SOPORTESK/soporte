/**
 * Comprime imágenes en el navegador a formato WebP ligero antes de subirlas a Supabase Storage.
 * - Reduce imágenes de varios MB a ~50-120 KB sin pérdida visual notable.
 * - No modifica videos, audios, documentos ni GIFs animados.
 */
export async function compressImageIfApplicable(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<File> {
  if (typeof window === "undefined") return file;
  const type = (file.type || "").toLowerCase();
  if (!type.startsWith("image/") || type === "image/gif" || type === "image/svg+xml") {
    return file;
  }

  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              // Si ya era más liviano el original, conservar el original
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "") || "imagen";
            const compressedFile = new File([blob], `${baseName}.webp`, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/webp",
          quality
        );
      } catch {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
