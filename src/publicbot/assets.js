import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

function extension(contentType = '', name = '') {
  return TYPES.get(contentType.split(';')[0].toLowerCase()) || path.extname(name).toLowerCase();
}

export async function saveAttachment(attachment, directory, prefix = 'asset') {
  if (!attachment?.url) throw new Error('Attach an image file.');
  const contentType = String(attachment.contentType || '').toLowerCase();
  const ext = extension(contentType, attachment.name);
  if (!TYPES.has(contentType.split(';')[0]) && !['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    throw new Error('Use a PNG, JPEG, WebP or GIF image.');
  }
  if (attachment.size && attachment.size > MAX_BYTES) throw new Error('Images must be 10 MB or smaller.');
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`Discord rejected the image download (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('Images must be 10 MB or smaller.');
  const safePrefix = String(prefix).replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) || 'asset';
  const name = `${safePrefix}-${randomUUID()}${ext || '.bin'}`;
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, name);
  await writeFile(filePath, buffer, { flag: 'wx' });
  return { path: filePath, name, contentType: contentType || 'image/*', bytes: buffer.length };
}

export function fileForAsset(asset) {
  return asset?.path && asset?.name && existsSync(asset.path) ? { attachment: asset.path, name: asset.name } : null;
}

export function embedAssetUrl(asset) {
  return asset?.path && asset?.name && existsSync(asset.path) ? `attachment://${asset.name}` : undefined;
}
