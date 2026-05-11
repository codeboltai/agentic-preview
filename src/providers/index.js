import { getBuiltinProviders } from './builtin.js';
import { createCommandProvider } from './command.js';

export async function getAvailableProviders(config) {
  const providers = new Map();
  const enabled = new Set(config.enabledProviders || []);
  for (const provider of getBuiltinProviders()) {
    if (enabled.size === 0 || enabled.has(provider.providerId)) {
      providers.set(provider.providerId, provider);
    }
  }

  for (const providerConfig of config.customProviders || []) {
    if (!providerConfig.providerId || !providerConfig.command) {
      continue;
    }
    if (enabled.size > 0 && !enabled.has(providerConfig.providerId)) {
      continue;
    }
    if (providers.has(providerConfig.providerId)) {
      continue;
    }

    providers.set(providerConfig.providerId, createCommandProvider({
      providerId: providerConfig.providerId,
      name: providerConfig.name,
      providerType: providerConfig.providerType,
      managed: providerConfig.managed,
      supportsStop: providerConfig.supportsStop,
      artifactTypes: providerConfig.artifactTypes,
      command: providerConfig.command,
      stopCommand: providerConfig.stopCommand,
      description: providerConfig.description,
      options: providerConfig.options || {},
      timeoutMs: providerConfig.timeoutMs,
      stopTimeoutMs: providerConfig.stopTimeoutMs,
    }));
  }

  return providers;
}
