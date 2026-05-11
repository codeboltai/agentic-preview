import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../utils.js';
import { pathToArtifactFileUrl } from '../utils.js';

function normalizeRequestPath(urlPath) {
  const parsed = new URL(urlPath, 'http://localhost');
  return decodeURIComponent(parsed.pathname || '/');
}

function safeJoin(base, requestPath) {
  const normalized = requestPath.replace(/^\/+/, '');
  const full = path.resolve(base, normalized);
  const trustedBase = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (!full.startsWith(trustedBase) && full !== base) {
    return path.join(base, 'index.html');
  }
  return full;
}

function detectContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.pdf': 'application/pdf',
  };
  return map[extension] || 'application/octet-stream';
}

async function createStaticServer(rootDir, entrypoint = 'index.html') {
  const server = http.createServer(async (request, response) => {
    try {
      const cleaned = normalizeRequestPath(request.url || '/');
      const requestPath = cleaned === '/' ? `/${entrypoint}` : cleaned;
      let target = safeJoin(rootDir, requestPath);
      const stat = await fs.stat(target).catch(() => null);
      if (stat && stat.isDirectory()) {
        target = path.join(target, entrypoint);
      }
      const file = await fs.readFile(target).catch(() => null);
      if (!file) {
        response.statusCode = 404;
        response.end('File not found');
        return;
      }
      response.setHeader('Content-Type', detectContentType(target));
      response.statusCode = 200;
      response.end(file);
    } catch (error) {
      response.statusCode = 500;
      response.end(error?.message || 'Server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) return reject(error);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine assigned preview port');
  }
  const port = address.port;

  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    stop: async () => new Promise((resolve) => server.close(resolve)),
    url: baseUrl,
    port,
  };
}

export function getBuiltinProviders() {
  return [
    {
      providerId: 'builtin-static',
      name: 'Local Static Preview',
      kind: 'local',
      managed: true,
      requiredCredentials: [],
      supportsStop: true,
      artifactTypes: ['static_site', 'dynamic_site'],
      async start(context) {
        const root = context.artifact.sourceType === 'directory'
          ? context.artifact.path
          : path.dirname(context.artifact.path);
        const server = await createStaticServer(root, context.artifact.entrypoint || 'index.html');
        return {
          kind: 'url',
          openIn: 'browser',
          url: server.url,
          previewId: context.previewId,
          label: context.artifact.title || 'Static Artifact',
          message: 'Serving directory in local preview.',
          metadata: {
            root,
            resolvedEntryPoint: context.artifact.entrypoint || 'index.html',
            provider: 'builtin-static',
            artifactType: context.artifact.type,
            sessionId: newId('builtin-static'),
          },
          stop: async () => {
            await server.stop();
          },
          raw: {
            port: server.port,
          },
        };
      },
      description: 'Serves local files for static/dynamic artifacts from disk.',
    },
    {
      providerId: 'builtin-file',
      name: 'Local File Preview',
      kind: 'local',
      managed: false,
      requiredCredentials: [],
      supportsStop: false,
      artifactTypes: ['file', 'image', 'video'],
      async start(context) {
        return {
          kind: 'url',
          openIn: 'browser',
          url: pathToArtifactFileUrl(context.artifact.path),
          previewId: context.previewId,
          label: context.artifact.title || 'File Artifact',
          message: `Serving local artifact file from ${context.artifact.path}`,
          metadata: {
            filePath: context.artifact.path,
            provider: 'builtin-file',
            artifactType: context.artifact.type,
          },
        };
      },
      description: 'Opens local files (images/videos) in browser.',
    },
    {
      providerId: 'builtin-url',
      name: 'Direct URL Preview',
      kind: 'local',
      managed: false,
      requiredCredentials: [],
      supportsStop: false,
      artifactTypes: ['url'],
      async start(context) {
        return {
          kind: 'url',
          openIn: 'browser',
          url: context.artifact.path,
          previewId: context.previewId,
          label: context.artifact.title || context.artifact.path,
          message: 'Opening direct URL artifact.',
          metadata: {
            provider: 'builtin-url',
            artifactType: context.artifact.type,
          },
        };
      },
      description: 'Returns URL artifacts as-is.',
    },
  ];
}
