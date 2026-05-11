import { spawn } from 'node:child_process';

function parseCommandJson(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // ignore and try previous line
    }
  }
  return null;
}

function runCommand(command, args, payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!command) {
      reject(new Error('No command configured.'));
      return;
    }
    const child = spawn(command, args, {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...payload.env },
    });

    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(errorOutput || `Command failed with exit code ${code}`));
        return;
      }
      const parsed = parseCommandJson(output);
      if (!parsed) {
        reject(new Error('Command returned no JSON output.'));
        return;
      }
      resolve(parsed);
    });
  });
}

export function createCommandProvider(def) {
  return {
    providerId: def.providerId,
    name: def.name || def.providerId,
    kind: 'command',
    managed: Boolean(def.managed),
    supportsStop: Boolean(def.supportsStop),
    artifactTypes: def.artifactTypes || ['static_site'],
    async start(context) {
      const payload = {
        action: 'start',
        previewId: context.previewId,
        providerId: def.providerId,
        artifact: context.artifact,
        options: {
          ...(def.options || {}),
          credentials: def.credentials || {},
        },
        credentials: def.credentials || {},
      };
      const result = await runCommand(def.command, def.args || [], payload, def.timeoutMs || 45000);
      return {
        previewId: context.previewId,
        kind: result.kind || 'url',
        openIn: result.openIn || 'browser',
        url: result.url,
        label: result.label || def.name || def.providerId,
        message: result.message || `Managed by command provider ${def.providerId}.`,
        metadata: result.metadata || {},
      };
    },
    async stop(context) {
      if (!def.stopCommand) {
        return { skipped: true };
      }
      const payload = {
        action: 'stop',
        previewId: context.previewId,
        providerId: def.providerId,
        artifact: context.artifact,
      };
      await runCommand(def.stopCommand, def.stopArgs || [], payload, def.stopTimeoutMs || 20000);
    },
    description: def.description || `Command provider ${def.providerId}`,
  };
}
