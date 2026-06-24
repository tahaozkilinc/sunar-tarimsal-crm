// Tarayıcıda görsel sıkıştırma. Telefon fotoğrafları birkaç MB olabiliyor;
// depolamada yer kaplamasın diye uzun kenarı `maxDim`e indirip JPEG olarak
// `quality` ile yeniden kodlarız. Görsel değilse veya bir hata olursa orijinal
// dosya aynen döner (güvenli geri dönüş). EXIF yönü korunur.

export type CompressedImage = { blob: Blob; ext: string; contentType: string };

function extOf(name: string): string {
  const m = name.split(".").pop();
  return m && m.length > 0 && m.length <= 5 ? m.toLowerCase() : "jpg";
}

export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.7,
): Promise<CompressedImage> {
  const fallback: CompressedImage = {
    blob: file,
    ext: extOf(file.name),
    contentType: file.type || "application/octet-stream",
  };
  if (!file.type.startsWith("image/")) return fallback;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return fallback;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxDim ? maxDim / longest : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return fallback;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );

    // Sıkıştırma gerçekten küçülttüyse onu kullan; aksi halde orijinali koru.
    if (blob && blob.size > 0 && blob.size < file.size) {
      return { blob, ext: "jpg", contentType: "image/jpeg" };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
