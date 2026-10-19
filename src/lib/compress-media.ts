/**
 * Comprime imágenes en el navegador a formato JPEG optimizado antes de subirlas a Supabase Storage.
 * - Reduce imágenes y capturas PNG/JPEG de varios MB a ~60-120 KB sin pérdida visual notable.
 * - Usa image/jpeg (.jpg) para garantizar 100% de compatibilidad con WhatsApp (Evolution API),
 *   exportación de reportes PDF (jsPDF), OCR (Tesseract) e IA Vision.
 * - No modifica stickers WebP, videos, audios, documentos ni GIFs animados.
 */
export async function compressImageIfApplicable(
  file: File,
  maxDimension = 1600,
  quality = 0.78
): Promise<File> {
  if (typeof window === "undefined") return file;
  const type = (file.type || "").toLowerCase();
  if (
    !type.startsWith("image/") ||
    type === "image/gif" ||
    type === "image/svg+xml" ||
    type === "image/webp"
  ) {
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
        // Fondo blanco por si la imagen original era un PNG con transparencia
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "") || "imagen";
            const compressedFile = new File([blob], `${baseName}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
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
