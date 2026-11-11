/**
 * Foto do cliente para o navegador enviar: gira pela orientação da câmera,
 * reduz para no máximo `maxSide` px e regrava em JPEG. Regravar no canvas
 * descarta os metadados (EXIF com GPS) da foto original.
 */
export async function compressPhoto(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const source: ImageBitmap | HTMLImageElement = 'createImageBitmap' in window
    ? await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImage(file))
    : await loadImage(file);
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/jpeg', quality));
  if (!blob) throw new Error('Não deu para ler esta foto.');
  return blob;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não deu para ler esta foto.')); };
    img.src = url;
  });
}
