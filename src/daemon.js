import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
import { getAvailableProviders } from './providers/index.js';
import { parseJson } from './utils.js';

const DEFAULT_PORT = 37111;
const state = new Map();

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if ((entry === '--port' || entry === '-p') && argv[i + 1]) {
      result.port = Number(argv[i + 1]);
      i += 1;
    } else if (entry.startsWith('--port=')) {
      result.port = Number(entry.slice('--port='.length));
    }
  }
  return result;
}

function parseBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      resolve(parseJson(body));
    });
  });
}

function sendJson(response, statusCode, payload) {
  const payloadString = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payloadString);
}

function isArtifactCompatible(provider, artifact) {
  return provider.artifactTypes.includes(artifact.type);
}

async function stopSession(previewId) {
  const record = state.get(previewId);
  if (!record) {
    return { status: 'not-found' };
  }

  if (!record.canStop || !record.stop) {
    return { status: 'not-supported', message: 'Provider does not support stop.' };
  }

  if (!record.stoppedAt) {
    try {
      await record.stop();
      record.stoppedAt = new Date().toISOString();
      record.status = 'stopped';
      record.updatedAt = new Date().toISOString();
    } catch (error) {
      record.status = 'error';
      record.error = error.message || String(error);
      record.updatedAt = new Date().toISOString();
      return { status: 'error', message: record.error };
    }
  }

  return { status: 'stopped', stoppedAt: record.stoppedAt };
}

function pickDefaultProvider(config, providers, artifact) {
  const requested = config.defaults?.[artifact.type];
  if (requested && providers.has(requested)) {
    const candidate = providers.get(requested);
    if (isArtifactCompatible(candidate, artifact)) {
      return candidate;
    }
  }

  for (const provider of providers.values()) {
    if (isArtifactCompatible(provider, artifact)) {
      return provider;
    }
  }

  return null;
}

async function startSession(config, body) {
  const artifact = body?.artifact;
  if (!artifact || !artifact.type || !artifact.path) {
    return { status: 400, payload: { error: 'Missing artifact payload' } };
  }

  const providers = await getAvailableProviders(config);
  const requestedProvider = body.providerId ? providers.get(body.providerId) || null : null;
  const provider = requestedProvider || pickDefaultProvider(config, providers, artifact);

  if (!provider) {
    return {
      status: 400,
      payload: { error: `No provider supports artifact type ${artifact.type}` },
    };
  }

  if (body.providerId && !requestedProvider) {
    return {
      status: 400,
      payload: {
        error: `Provider ${body.providerId} is disabled or unavailable for artifact type ${artifact.type}.`,
      },
    };
  }

  const previewId = `preview-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const context = {
    previewId,
    artifact,
    artifactType: artifact.type,
    providerId: provider.providerId,
    options: body.options || {},
    request: body,
  };

  let result;
  try {
    result = await provider.start(context);
  } catch (error) {
    return { status: 500, payload: { error: error.message || String(error) } };
  }

  if (!result || !result.url) {
    return { status: 502, payload: { error: 'Provider did not return a preview URL.' } };
  }

  const stop = typeof result.stop === 'function'
    ? result.stop
    : (provider.supportsStop || provider.managed) && typeof provider.stop === 'function'
      ? async () => provider.stop(context)
      : null;
  const canStop = Boolean(stop);

  const record = {
    id: previewId,
    providerId: provider.providerId,
    artifact,
    status: 'ready',
    canStop,
    canStopRequested: canStop,
    stop,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    result,
  };

  state.set(previewId, record);
  return {
    status: 200,
    payload: {
      previewId,
      artifactId: artifact.id,
      providerId: provider.providerId,
      kind: result.kind || 'url',
      openIn: result.openIn || 'browser',
      url: result.url,
      label: result.label || artifact.title || artifact.path,
      message: result.message || `Started with ${provider.providerId}`,
      canStop,
      createdAt: record.createdAt,
    },
  };
}

async function handleStart(request, response, config) {
  const body = await parseBody(request);
  if (!body) {
    sendJson(response, 400, { error: 'Invalid JSON payload' });
    return;
  }
  const result = await startSession(config, body || {});
  sendJson(response, result.status, result.payload);
}

async function handleStop(request, response) {
  const body = await parseBody(request);
  const previewId = body?.previewId;
  if (!previewId) {
    sendJson(response, 400, { error: 'previewId is required' });
    return;
  }
  const result = await stopSession(previewId);
  const payload = result.status === 'not-found'
    ? { error: 'Session not found' }
    : result;
  sendJson(response, result.status === 'not-found' ? 404 : 200, payload);
}

function handleList(response) {
  const sessions = Array.from(state.values()).map((record) => ({
    previewId: record.id,
    providerId: record.providerId,
    artifactId: record.artifact?.id,
    artifactPath: record.artifact?.path,
    artifactType: record.artifact?.type,
    status: record.status,
    canStop: record.canStop,
    canStopRequested: record.canStopRequested,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    result: {
      url: record.result?.url,
      kind: record.result?.kind,
      message: record.result?.message,
    },
  }));
  sendJson(response, 200, { sessions, count: sessions.length });
}

async function requestHandler(request, response) {
  const config = await loadConfig();
  const route = request.url ? new URL(request.url, 'http://127.0.0.1').pathname : '';

  if (route === '/health' && request.method === 'GET') {
    sendJson(response, 200, {
      status: 'ok',
      version: '0.1.0',
      uptimeMs: process.uptime() * 1000,
      sessionCount: state.size,
    });
    return;
  }

  if (route === '/providers' && request.method === 'GET') {
    const providers = await getAvailableProviders(config);
    const list = Array.from(providers.values()).map((provider) => ({
      providerId: provider.providerId,
      name: provider.name,
      artifactTypes: provider.artifactTypes,
      managed: Boolean(provider.managed),
      supportsStop: Boolean(provider.supportsStop),
      kind: provider.kind,
      description: provider.description,
    }));
    sendJson(response, 200, { providers: list });
    return;
  }

  if (route === '/start' && request.method === 'POST') {
    await handleStart(request, response, config);
    return;
  }

  if (route === '/stop' && request.method === 'POST') {
    await handleStop(request, response);
    return;
  }

  if (route === '/sessions' && request.method === 'GET') {
    handleList(response);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

function handleSignal() {
  for (const session of state.values()) {
    if (session.canStop && typeof session.stop === 'function') {
      session.stop().catch(() => undefined);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = Number.isFinite(args.port) ? args.port : DEFAULT_PORT;

  const server = http.createServer((request, response) => {
    request.on('error', () => {
      sendJson(response, 500, { error: 'Internal request error' });
    });
    requestHandler(request, response).catch((error) => {
      sendJson(response, 500, { error: error.message || 'Internal error' });
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`agentic-preview daemon listening on http://127.0.0.1:${port}`);
  });

  process.on('SIGTERM', () => {
    server.close();
    handleSignal();
  });
  process.on('SIGINT', () => {
    server.close();
    handleSignal();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
