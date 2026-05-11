import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_NAME = 'agentic-preview';
const CONFIG_DIR = join(homedir(), `.${APP_NAME}`);
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  version: 1,
  daemonPort: 37111,
  enabledProviders: ['builtin-static', 'builtin-file', 'builtin-url'],
  defaults: {
    static_site: 'builtin-static',
    dynamic_site: 'builtin-static',
    image: 'builtin-file',
    video: 'builtin-file',
    file: 'builtin-file',
    url: 'builtin-url',
  },
  customProviders: [],
};

export function getConfigDir() {
  return CONFIG_DIR;
}

export async function ensureConfigDir() {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig() {
  await ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    await writeConfig(DEFAULT_CONFIG);
    return structuredClone(DEFAULT_CONFIG);
  }

  const raw = await readFile(CONFIG_FILE, 'utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const config = {
    ...DEFAULT_CONFIG,
    ...(parsed || {}),
    defaults: { ...DEFAULT_CONFIG.defaults, ...(parsed || {}).defaults },
    enabledProviders: Array.isArray((parsed || {}).enabledProviders)
      ? [...new Set((parsed || {}).enabledProviders)]
      : [...DEFAULT_CONFIG.enabledProviders],
    customProviders: Array.isArray((parsed || {}).customProviders)
      ? (parsed || {}).customProviders
      : [],
  };

  return config;
}

export async function writeConfig(config) {
  await ensureConfigDir();
  const safeConfig = {
    version: config.version || DEFAULT_CONFIG.version,
    daemonPort: config.daemonPort || DEFAULT_CONFIG.daemonPort,
    enabledProviders: Array.from(new Set(config.enabledProviders || [])),
    defaults: config.defaults || DEFAULT_CONFIG.defaults,
    customProviders: (config.customProviders || []).map((provider) => ({ ...provider })),
  };
  await writeFile(CONFIG_FILE, JSON.stringify(safeConfig, null, 2), 'utf8');
}

export async function setDefaultProvider(artifactType, providerId) {
  const config = await loadConfig();
  config.defaults[artifactType] = providerId;
  await writeConfig(config);
  return config;
}

export async function setProviderEnabled(providerId, enabled) {
  const config = await loadConfig();
  const providers = new Set(config.enabledProviders || []);
  if (enabled) {
    providers.add(providerId);
  } else {
    providers.delete(providerId);
  }
  config.enabledProviders = Array.from(providers);
  await writeConfig(config);
  return config;
}

export async function addCustomProvider(providerConfig) {
  const config = await loadConfig();
  const providerId = providerConfig?.providerId;
  if (!providerId) {
    throw new Error('providerId is required to add a provider');
  }
  const providers = Array.isArray(config.customProviders) ? [...config.customProviders] : [];
  const existingIndex = providers.findIndex((provider) => provider.providerId === providerId);
  const nextProvider = {
    providerId,
    name: providerConfig.name || providerId,
    providerType: providerConfig.providerType || 'command',
    command: providerConfig.command || '',
    artifactTypes: Array.isArray(providerConfig.artifactTypes) ? providerConfig.artifactTypes : ['file'],
    managed: Boolean(providerConfig.managed),
    supportsStop: Boolean(providerConfig.supportsStop),
    description: providerConfig.description || '',
    enabled: providerConfig.enabled !== false,
    options: providerConfig.options || {},
    stopCommand: providerConfig.stopCommand || null,
    stopTimeoutMs: Number.isFinite(providerConfig.stopTimeoutMs) ? providerConfig.stopTimeoutMs : 10000,
  };
  if (existingIndex >= 0) {
    providers[existingIndex] = nextProvider;
  } else {
    providers.push(nextProvider);
  }
  config.customProviders = providers;
  if (!config.enabledProviders.includes(providerId)) {
    config.enabledProviders.push(providerId);
  }
  if (!config.defaults[providerConfig.artifactTypes?.[0]]) {
    config.defaults[providerConfig.artifactTypes?.[0]] = providerId;
  }
  await writeConfig(config);
  return config;
}

export async function removeCustomProvider(providerId) {
  const config = await loadConfig();
  config.customProviders = (config.customProviders || []).filter((provider) => provider.providerId !== providerId);
  config.enabledProviders = (config.enabledProviders || []).filter((id) => id !== providerId);
  for (const [artifactType, configuredProviderId] of Object.entries(config.defaults || {})) {
    if (configuredProviderId === providerId) {
      config.defaults[artifactType] = undefined;
    }
  }
  const defaults = { ...config.defaults };
  for (const [artifactType, configuredProviderId] of Object.entries(defaults)) {
    if (!configuredProviderId) delete config.defaults[artifactType];
  }
  await writeConfig(config);
  return config;
}
