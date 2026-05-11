import { getBuiltinProviders } from './builtin.js';
import { createCommandProvider } from './command.js';

function sanitizeCredentialRequirements(requirements = []) {
  return (requirements || [])
    .map((entry) => {
      if (typeof entry === 'string' && entry.trim()) {
        return {
          key: entry.trim(),
          label: entry.trim(),
          envVar: entry.trim(),
        };
      }
      if (!entry || typeof entry !== 'object') return null;

      const key = typeof entry.key === 'string' ? entry.key.trim() : '';
      if (!key) return null;

      return {
        key,
        label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : key,
        envVar: typeof entry.envVar === 'string' && entry.envVar.trim() ? entry.envVar.trim() : key,
      };
    })
    .filter(Boolean);
}

function normalizeCredentials(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const entries = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key === 'string') {
      entries[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return entries;
}

function hydrateProvider(provider, config) {
  const requirements = sanitizeCredentialRequirements(provider.requiredCredentials);
  const stored = normalizeCredentials(config.providerCredentials?.[provider.providerId]);
  const merged = {
    ...provider,
    requiredCredentials: requirements,
  };
  if (requirements.length) {
    merged.credentials = stored;
  }
  return merged;
}

async function buildCustomProvider(providerConfig, config) {
  const providerId = providerConfig?.providerId;
  if (!providerId || !providerConfig.command) {
    return null;
  }

  return hydrateProvider({
    providerId,
    name: providerConfig.name || providerId,
    providerType: providerConfig.providerType,
    managed: Boolean(providerConfig.managed),
    supportsStop: Boolean(providerConfig.supportsStop),
    artifactTypes: providerConfig.artifactTypes || ['file'],
    command: providerConfig.command,
    stopCommand: providerConfig.stopCommand,
    description: providerConfig.description || '',
    options: providerConfig.options || {},
    timeoutMs: providerConfig.timeoutMs,
    stopTimeoutMs: providerConfig.stopTimeoutMs,
    requiredCredentials: providerConfig.requiredCredentials || [],
    kind: 'command',
  }, config);
}

export async function getAllProviders(config) {
  const providers = new Map();
  for (const provider of getBuiltinProviders()) {
    providers.set(provider.providerId, hydrateProvider(provider, config));
  }
  for (const providerConfig of config.customProviders || []) {
    const provider = await buildCustomProvider(providerConfig, config);
    if (!provider) continue;
    providers.set(provider.providerId, createCommandProvider({
      providerId: provider.providerId,
      name: provider.name,
      providerType: provider.providerType,
      managed: provider.managed,
      supportsStop: provider.supportsStop,
      artifactTypes: provider.artifactTypes,
      command: provider.command,
      stopCommand: provider.stopCommand,
      description: provider.description,
      options: provider.options || {},
      timeoutMs: provider.timeoutMs,
      stopTimeoutMs: provider.stopTimeoutMs,
      credentials: provider.credentials,
    }));
    providers.set(provider.providerId, {
      ...providers.get(provider.providerId),
      credentials: provider.credentials,
      requiredCredentials: provider.requiredCredentials,
    });
  }
  return providers;
}

export async function getAvailableProviders(config) {
  const providers = await getAllProviders(config);
  const enabled = new Set(config.enabledProviders || []);
  if (enabled.size === 0) {
    return providers;
  }

  const filtered = new Map();
  for (const [providerId, provider] of providers.entries()) {
    if (enabled.has(providerId)) {
      filtered.set(providerId, provider);
    }
  }
  return filtered;
}
