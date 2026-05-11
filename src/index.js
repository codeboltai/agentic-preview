#!/usr/bin/env node
import { Command } from 'commander';
import { buildArtifactDescriptor } from './artifact.js';
import { daemonRequest } from './ipc.js';
import { loadConfig, setDefaultProvider, setProviderEnabled, addCustomProvider, removeCustomProvider } from './config.js';
import { getAvailableProviders } from './providers/index.js';

function formatOutput(value, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(value.message || value.error || 'Preview result');
  if (value.previewId) console.log(`previewId: ${value.previewId}`);
  if (value.url) console.log(`url: ${value.url}`);
  if (value.providerId) console.log(`provider: ${value.providerId}`);
  if (value.canStop !== undefined) console.log(`canStop: ${value.canStop}`);
}

const program = new Command();
program.name('agentic-preview')
  .description('Instant preview CLI for local file/folder artifacts')
  .option('--json', 'Print machine readable JSON output');

program.command('preview <artifactPath>')
  .description('Create preview for a file or folder')
  .option('-t, --type <type>', 'Override artifact type')
  .option('-p, --provider <providerId>', 'Override preview provider')
  .option('--name <name>', 'Optional label for output')
  .action(async (artifactPath, options) => {
    try {
      const artifact = await buildArtifactDescriptor(artifactPath, options.type);
      if (options.name) artifact.title = options.name;
      const config = await loadConfig();
      const providers = await getAvailableProviders(config);

      const preferred = options.provider;
      if (preferred && !providers.has(preferred)) {
        throw new Error(`Provider ${preferred} is not available, disabled, or does not support this artifact type.`);
      }

      const response = await daemonRequest('POST', '/start', {
        artifact,
        providerId: options.provider,
        options: {
          requestedBy: 'cli',
        },
      });

      formatOutput({
        previewId: response.previewId,
        artifactId: response.artifactId,
        providerId: response.providerId,
        url: response.url,
        canStop: response.canStop,
        message: `Preview available: ${response.url}`,
      }, program.opts().json);
    } catch (error) {
      const payload = { error: error.message || String(error) };
      formatOutput(payload, program.opts().json);
      process.exit(1);
    }
  });

program.command('stop <previewId>')
  .description('Stop a managed preview session by previewId')
  .action(async (previewId) => {
    try {
      const response = await daemonRequest('POST', '/stop', { previewId });
      formatOutput({ message: response.message || `Stopped preview ${previewId}`, previewId }, program.opts().json);
    } catch (error) {
      const payload = { error: error.message || String(error) };
      formatOutput(payload, program.opts().json);
      process.exit(1);
    }
  });

program.command('list')
  .description('List active preview sessions')
  .option('--all', 'Include closed sessions')
  .action(async (options) => {
    try {
      const commandOptions = options || {};
      const endpoint = commandOptions.all ? '/sessions?all=true' : '/sessions';
      const response = await daemonRequest('GET', endpoint);
      if (program.opts().json) {
        formatOutput(response, true);
        return;
      }
      if (!response.sessions.length) {
        console.log('No active sessions.');
        return;
      }
      for (const session of response.sessions) {
        console.log(`[${session.status}] ${session.previewId}`);
        console.log(`  artifact: ${session.artifactPath}`);
        console.log(`  provider: ${session.providerId}`);
        console.log(`  url: ${session.result?.url || 'n/a'}`);
        console.log(`  canStop: ${session.canStop}`);
      }
    } catch (error) {
      const payload = { error: error.message || String(error) };
      formatOutput(payload, program.opts().json);
      process.exit(1);
    }
  });

program.command('providers')
  .description('Manage providers')
  .addCommand(
    new Command('list')
      .description('List all providers')
      .action(async () => {
        try {
          const config = await loadConfig();
          const providers = await getAvailableProviders(config);
          const payload = Array.from(providers.values()).map((provider) => ({
            providerId: provider.providerId,
            name: provider.name,
            managed: Boolean(provider.managed),
            supportsStop: Boolean(provider.supportsStop),
            artifactTypes: provider.artifactTypes,
            kind: provider.kind,
            description: provider.description,
          }));
          if (program.opts().json) {
            formatOutput({ providers: payload }, true);
          } else {
            for (const provider of payload) {
              console.log(`${provider.providerId} - ${provider.name}`);
              console.log(`  types: ${provider.artifactTypes.join(', ')}`);
              console.log(`  managed: ${provider.managed}`);
            }
          }
        } catch (error) {
          const payload = { error: error.message || String(error) };
          formatOutput(payload, program.opts().json);
          process.exit(1);
        }
      }),
  )
  .addCommand(new Command('add-command')
    .description('Register a command provider')
    .requiredOption('--id <providerId>', 'Provider identifier')
    .requiredOption('--name <name>', 'Provider display name')
    .requiredOption('--command <command>', 'Command to execute for preview request')
    .requiredOption('--artifact-types <types>', 'Comma-separated artifact types')
    .option('--managed', 'Mark as managed provider')
    .option('--supports-stop', 'Supports external stop command')
    .option('--stop-command <command>', 'Command to stop preview')
    .option('--description <description>', 'Provider description')
    .option('--timeout-ms <timeoutMs>', 'Start timeout')
    .action(async (options) => {
      try {
        const artifactTypes = options.artifactTypes
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        if (!artifactTypes.length) {
          throw new Error('At least one artifact type is required.');
        }
        const provider = {
          providerId: options.id,
          name: options.name,
          providerType: 'command',
          command: options.command,
          artifactTypes,
          managed: options.managed || false,
          supportsStop: options.supportsStop || false,
          stopCommand: options.stopCommand || null,
          description: options.description || '',
          timeoutMs: options.timeoutMs ? Number(options.timeoutMs) : undefined,
        };
        const config = await addCustomProvider(provider);
        formatOutput({ message: `Provider ${provider.providerId} added`, config }, program.opts().json);
      } catch (error) {
        const payload = { error: error.message || String(error) };
        formatOutput(payload, program.opts().json);
        process.exit(1);
      }
    }))
  .addCommand(new Command('remove')
    .description('Remove a custom provider')
    .argument('<providerId>', 'Provider id')
    .action(async (providerId) => {
      try {
        const config = await removeCustomProvider(providerId);
        formatOutput({ message: `Provider ${providerId} removed`, config }, program.opts().json);
      } catch (error) {
        const payload = { error: error.message || String(error) };
        formatOutput(payload, program.opts().json);
        process.exit(1);
      }
    }))
  .addCommand(new Command('default')
    .description('Set default provider for artifact type')
    .argument('<artifactType>', 'Artifact type (static_site, dynamic_site, file, image, video, url)')
    .argument('<providerId>', 'Provider id')
    .action(async (artifactType, providerId) => {
      try {
        const config = await loadConfig();
        const providers = await getAvailableProviders(config);
        const provider = providers.get(providerId);
        if (!provider) {
          throw new Error(`Provider ${providerId} is not available or disabled.`);
        }
        if (!provider.artifactTypes.includes(artifactType)) {
          throw new Error(`Provider ${providerId} does not support artifact type ${artifactType}.`);
        }
        const updatedConfig = await setDefaultProvider(artifactType, providerId);
        formatOutput({
          message: `Default provider for ${artifactType} set to ${providerId}`,
          defaults: updatedConfig.defaults,
        }, program.opts().json);
      } catch (error) {
        const payload = { error: error.message || String(error) };
        formatOutput(payload, program.opts().json);
        process.exit(1);
      }
    }))
  .addCommand(new Command('enable')
    .description('Enable a provider')
    .argument('<providerId>', 'Provider id')
    .action(async (providerId) => {
      try {
        const config = await setProviderEnabled(providerId, true);
        formatOutput({ message: `Provider ${providerId} enabled`, enabledProviders: config.enabledProviders }, program.opts().json);
      } catch (error) {
        const payload = { error: error.message || String(error) };
        formatOutput(payload, program.opts().json);
        process.exit(1);
      }
    }))
  .addCommand(new Command('disable')
    .description('Disable a provider')
    .argument('<providerId>', 'Provider id')
    .action(async (providerId) => {
      try {
        const config = await setProviderEnabled(providerId, false);
        formatOutput({ message: `Provider ${providerId} disabled`, enabledProviders: config.enabledProviders }, program.opts().json);
      } catch (error) {
        const payload = { error: error.message || String(error) };
        formatOutput(payload, program.opts().json);
        process.exit(1);
      }
    }));

program.parseAsync(process.argv).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
