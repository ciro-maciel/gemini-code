// What one message can carry, and the side the model actually reads (a 4K print is sent at this size).
export const MAX_FILES = 10;
export const MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_SIDE = 1568;

export const formatSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/*
 * What a paste attaches. Text wins: Notes, Word, Pages and rich web pages copy
 * a picture of the text next to the text itself, and taking the picture threw
 * the words away. Files are attached only when nothing else came, or when the
 * text is just their names, which is what Finder puts beside a copied file.
 */
export function pastedFiles(clipboardData) {
  const files = [...(clipboardData?.files ?? [])];
  if (!files.length) return [];
  const text = clipboardData.getData('text/plain').trim();
  if (!text) return files;
  const names = new Set(files.map((file) => file.name));
  const isOnlyNames = text
    .split(/\r?\n/)
    .every((line) => names.has(line.trim()));
  return isOnlyNames ? files : [];
}

/** A big image is redrawn at IMAGE_SIDE before it leaves the browser. */
export async function shrinkImage(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = IMAGE_SIDE / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.86),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
    type: 'image/jpeg',
  });
}
