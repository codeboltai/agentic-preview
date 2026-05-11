import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { loadConfig, writeConfig } from './config.js';

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const HEALTH_PATH = '/health';
const DAEMON_ENTRY = join(PACKAGE_DIR, 'daemon.js');

async function requestJson(port, method, endpoint, body) {
  const url = new URL(`http://127.0.0.1:${port}${endpoint}`);
  const controller = new AbortController();
  const timeoutMs = 30000;
  const timeout = setTimeout(() => {
    controller.abort(new Error('Request timed out'));
  }, timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return { status: response.status, payload: null };
  }
  return {
    status: response.status,
    payload: (() => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    })(),
  };
}

async function isHealthy(port) {
  try {
    const result = await requestJson(port, 'GET', HEALTH_PATH);
    return result?.status === 200;
  } catch {
    return false;
  }
}

export async function ensureDaemon() {
  const config = await loadConfig();
  let port = Number(config.daemonPort) || 37111;
  if (!(await isHealthy(port))) {
    const spawned = spawn(process.execPath, [DAEMON_ENTRY, `--port=${port}`], {
      detached: true,
      stdio: 'ignore',
    });
    spawned.unref();

    let attempt = 0;
    while (attempt < 20) {
      await wait(250);
      if (await isHealthy(port)) {
        break;
      }
      attempt += 1;
    }

    if (!(await isHealthy(port))) {
      // try a single fallback port
      port += 1;
      await writeConfig({ ...config, daemonPort: port });
      const fallback = spawn(process.execPath, [DAEMON_ENTRY, `--port=${port}`], {
        detached: true,
        stdio: 'ignore',
      });
      fallback.unref();
      const fallbackAttempts = 20;
      for (let i = 0; i < fallbackAttempts; i += 1) {
        await wait(250);
        if (await isHealthy(port)) {
          break;
        }
      }
      if (!(await isHealthy(port))) {
        throw new Error('Unable to start agentic-preview daemon.');
      }
    }
  }
  return port;
}

export async function daemonRequest(method, endpoint, body) {
  const port = await ensureDaemon();
  const result = await requestJson(port, method, endpoint, body);
  if (!result || !result.status) {
    throw new Error('No response from agentic-preview daemon.');
  }
  if (result.status >= 400) {
    const message = typeof result.payload === 'string'
      ? result.payload
      : result.payload?.error || result.payload?.message || `HTTP ${result.status}`;
    const error = new Error(message);
    error.status = result.status;
    throw error;
  }
  return result.payload;
}
