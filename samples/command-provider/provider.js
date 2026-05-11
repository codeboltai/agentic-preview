const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function parsePayload(input) {
  try {
    const parsed = JSON.parse(input || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function asFileUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    return pathToFileURL(path.resolve(value)).href;
  } catch {
    return '';
  }
}

function resolveStartUrl(payload = {}) {
  const artifact = payload.artifact || {};
  const rawPath = artifact.path;
  if (!rawPath) return '';

  if (artifact.type === 'url') {
    return rawPath;
  }

  if (artifact.sourceType === 'directory') {
    const entrypoint = artifact.entrypoint || 'index.html';
    return asFileUrl(path.join(rawPath, entrypoint));
  }

  return asFileUrl(rawPath);
}

function main() {
  const input = fs.readFileSync(0, 'utf8');
  const payload = parsePayload(input);
  const action = payload.action || 'start';

  if (action === 'stop') {
    const previewId = payload.previewId || 'unknown';
    console.log(JSON.stringify({
      ok: true,
      action: 'stop',
      previewId,
      message: `Stop received for ${previewId}`,
    }));
    return;
  }

  const artifact = payload.artifact || {};
  const url = resolveStartUrl(payload);
  if (!url) {
    throw new Error('Could not resolve preview URL from payload.artifact.path');
  }

  console.log(JSON.stringify({
    kind: 'url',
    openIn: 'browser',
    url,
    previewId: payload.previewId,
    label: artifact.title || 'Sample Provider Output',
    message: `Sample provider started ${payload.providerId || 'sample-command-provider'}`,
    metadata: {
      provider: payload.providerId || 'sample-command-provider',
      artifactType: artifact.type || 'unknown',
      artifactPath: artifact.path || null,
      artifactSourceType: artifact.sourceType || 'unknown',
    },
  }));
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exitCode = 1;
}

