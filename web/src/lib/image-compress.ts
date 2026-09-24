/**
 * 上传前在浏览器里压缩小票照片。
 *
 * 手机直出照片普遍 2–5 MB,而 OCR 只需要长边 2000 像素左右就足够清晰。
 * 缩到长边 MAX_EDGE、JPEG 质量 QUALITY,通常压到 300–600 KB,
 * 上传快得多,也不会撞 nginx / 应用的体积上限。PDF 原样上传。
 */

const MAX_EDGE = 2000;
const QUALITY = 0.85;
/** 已经很小且不需要缩放的图片不再重新编码,避免无谓的画质损失 */
const SKIP_BELOW_BYTES = 600 * 1024;

export interface CompressResult {
  file: File;
  originalSize: number;
  compressed: boolean;
}

export async function compressImageForUpload(file: File): Promise<CompressResult> {
  const passthrough: CompressResult = { file, originalSize: file.size, compressed: false };
  if (!file.type.startsWith('image/')) return passthrough;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return passthrough;

  let bitmap: ImageBitmap | null = null;
  try {
    // from-image:按 EXIF 方向摆正,避免竖拍照片压缩后横过来
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / longest);
    if (scale === 1 && file.size <= SKIP_BELOW_BYTES) return passthrough;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return passthrough;
    // PNG 透明底转 JPEG 时铺白,免得变成黑底
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return passthrough;

    const name = file.name.replace(/\.(png|jpe?g)$/i, '') + '.jpg';
    return {
      file: new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }),
      originalSize: file.size,
      compressed: true,
    };
  } catch {
    // 解码失败(损坏文件、不支持的编码等)就原样上传,交给服务端判断
    return passthrough;
  } finally {
    bitmap?.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
