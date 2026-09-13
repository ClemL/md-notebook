/**
 * Pasted images are re-encoded as PNG data URLs so they survive in localStorage and can be written
 * straight back to the clipboard (Chromium's ClipboardItem accepts image/png). Large screenshots
 * are downscaled until they fit a budget, because the whole notebook shares a few megabytes.
 */

export type StoredImage = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  addedAt: number;
  name?: string;
};

const MAX_EDGE = [1400, 1000, 700, 500];
const BUDGET_BYTES = 1_200_000;

export function isImageType(type: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(type);
}

function loadBitmap(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The clipboard image could not be decoded."));
    };
    img.src = url;
  });
}

function render(img: HTMLImageElement, maxEdge: number): { dataUrl: string; w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable, so the image cannot be stored.");
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/png"), w, h };
}

/** Decode, downscale to the first size that fits the budget, and return a PNG data URL. */
export async function storeImage(blob: Blob, name?: string): Promise<StoredImage> {
  const img = await loadBitmap(blob);
  let best = render(img, MAX_EDGE[0]);
  for (const edge of MAX_EDGE.slice(1)) {
    if (best.dataUrl.length <= BUDGET_BYTES) break;
    best = render(img, edge);
  }
  return {
    dataUrl: best.dataUrl,
    width: best.w,
    height: best.h,
    bytes: best.dataUrl.length,
    addedAt: Date.now(),
    name,
  };
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(",");
  const type = header.match(/data:([^;]+)/)?.[1] ?? "image/png";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function copyImage(image: StoredImage): Promise<void> {
  const blob = dataUrlToBlob(image.dataUrl);
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("This browser cannot write images to the clipboard.");
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

/** First image found on a DataTransfer, whether pasted or dropped. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && isImageType(item.type)) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(data.files ?? [])) {
    if (isImageType(file.type)) return file;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads an image off the clipboard, if one is there. Returns null for a text-only clipboard. */
export async function readClipboardImage(): Promise<Blob | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => isImageType(t));
      if (type) return await item.getType(type);
    }
  } catch {
    // Permission denied or an unreadable flavor: fall back to the text path.
  }
  return null;
}
