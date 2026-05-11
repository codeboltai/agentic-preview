import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function newId(prefix = 'preview') {
  return `${prefix}-${randomUUID()}`;
}

export function parseJson(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export async function fileExists(targetPath) {
  try {
    const s = await stat(targetPath);
    return s;
  } catch {
    return null;
  }
}

export function isRemoteUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'file:';
  } catch {
    return false;
  }
}

export function artifactTypeFromPath(p) {
  if (!p) return 'file';
  const lower = p.toLowerCase();
  const imageExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const videoExt = ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv'];
  const staticExt = ['.html', '.htm', '.css', '.js', '.json', '.wasm', '.txt', '.md', '.tsx', '.ts', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.dart', '.rb'];

  const ext = path.extname(lower);
  if (imageExt.includes(ext)) return 'image';
  if (videoExt.includes(ext)) return 'video';
  if (staticExt.includes(ext)) return 'static_site';
  return 'file';
}

export function pathToArtifactFileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

export async function computeArtifactSize(rootPath) {
  try {
    const s = await stat(rootPath);
    return s.size;
  } catch {
    return 0;
  }
}

export function hashString(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}
