# agentic-preview

`agentic-preview` is a local-first CLI that creates preview URLs for artifacts.

## Installation

```bash
# From npm
npm i @codebolt/agentic-preview
# Start with
npx agentic-preview --help
```

```bash
# Local development
npm install
npm link
```

## Usage

```bash
# Basic preview
agentic-preview preview ./my-app
agentic-preview preview ./index.html --type image
# Preview a remote URL artifact
agentic-preview preview "https://example.com" --type url

# Preview output formats
agentic-preview --json preview ./my-app
agentic-preview --json preview ./static-page.html
agentic-preview --json providers list

# Session management
# Show only currently running previews by default
agentic-preview list
# Show all sessions including stopped/closed previews
agentic-preview list --all
agentic-preview stop <previewId>

# Provider management
agentic-preview providers list
agentic-preview providers add-command --id my-provider --name "My Provider" --command "node ./provider.js" --artifact-types "static_site,dynamic_site" --required-credentials "MY_PROVIDER_API_KEY"
agentic-preview providers default static_site my-provider
agentic-preview providers enable my-provider # prompts to capture required keys once missing
agentic-preview providers disable my-provider
agentic-preview providers remove my-provider
```

## Behaviour

### Artifact types

- `static_site` (default for folders)
- `dynamic_site`
- `image`
- `video`
- `file`
- `url`

If you do not pass `--type`, folder inputs default to `static_site`.

### Built-in providers

`agentic-preview` ships with:

- `builtin-static` (managed): local static file server for `static_site` and `dynamic_site`.
- `builtin-file` (non-managed): opens local media/text files directly.
- `builtin-url` (non-managed): passes through URL artifacts.

Managed providers create preview sessions that can be stopped with `agentic-preview stop <previewId>`.

### Configuration

Configuration is stored at:

- `<HOME>/.agentic-preview/config.json` by default
- or overridden with `AGENTIC_PREVIEW_HOME`.

Example:

```bash
setx AGENTIC_PREVIEW_HOME "C:\Users\%USERNAME%\.agentic-preview-home"
```

### Create a custom command provider

You can register your own preview provider using `providers add-command`.

#### 1) Register provider

```bash
agentic-preview providers add-command \
  --id my-cmd-provider \
  --name "My Command Provider" \
  --command "node ./my-provider.js" \
  --artifact-types "static_site,dynamic_site" \
  --required-credentials "MY_PROVIDER_TOKEN" \
  --managed \
  --supports-stop \
  --stop-command "node ./my-provider.js" \
  --description "Optional description"
```

Flags:

- `--id` unique provider identifier.
- `--name` display name.
- `--command` command to execute on preview start.
- `--artifact-types` comma-separated supported artifact types.
- `--required-credentials` comma-separated credential keys required by the provider.
- `--managed` (optional) marks session as managed.
- `--supports-stop` (optional) enables explicit `stop` flow.
- `--stop-command` required if `--supports-stop` is set and you want explicit stop support.
- `--timeout-ms` optional command timeout.
- `--description` optional metadata.

Notes:

- `providers enable <providerId>` will prompt for any missing credential values before enabling.
- captured credentials are stored at `<HOME>/.agentic-preview/config.json` in `providerCredentials`.

#### 2) Provider command contract (important)

`agentic-preview` invokes your provider by:

- launching the command with shell
- passing JSON payload on **stdin**
- expecting a JSON response on **stdout**.

Start payload shape (example):

```json
{
  "action": "start",
  "previewId": "preview-....",
  "providerId": "my-cmd-provider",
  "artifact": {
    "id": "artifact-...",
    "kind": "directory|file|url",
    "type": "static_site",
    "path": "C:\\path\\to\\artifact",
    "entrypoint": "index.html",
    "sourceType": "directory|file",
    "title": "my-app"
  },
  "options": {}
}
```

Your command must print JSON with:

```json
{
  "kind": "url",
  "openIn": "browser",
  "url": "https://... | file:///...",
  "label": "optional human label",
  "message": "optional status text",
  "metadata": {}
}
```

- `kind` should be `url` for now.
- `openIn` can be `browser` (default) and is used by callers that may also support dynamic panels in other integrations.
- `url` is required and is shown in the UI/CLI.

Optional `stop` command (if enabled):

- `agentic-preview` will invoke `--stop-command` with this payload on `stop`:

```json
{
  "action": "stop",
  "previewId": "preview-...",
  "providerId": "my-cmd-provider",
  "artifact": { ... }
}
```

If no `stop` output is required, exit code 0 is enough.

#### 3) Minimal example provider script

`my-provider.js`:

```js
const fs = require('fs');

const input = fs.readFileSync(0, 'utf8');
const payload = JSON.parse(input || '{}');

if (payload.action === 'stop') {
  // optional cleanup
  console.log(JSON.stringify({ ok: true, message: 'Stopped' }));
  process.exit(0);
}

console.log(JSON.stringify({
  kind: 'url',
  openIn: 'browser',
  url: `file://${payload.artifact.path}`,
  label: 'Local command provider',
  message: `Preview started for ${payload.artifact.title}`,
}));
```

#### 4) Remove/update providers

- Add again with same `--id` to replace.
- Remove:

```bash
agentic-preview providers remove my-cmd-provider
```

- Use `providers disable` to keep config but mark disabled.

### Try the sample provider pack

`agentic-preview` includes a runnable sample provider in:

`samples/command-provider`

Register it with:

```bash
node src/index.js providers add-command --id sample-command-provider --name "Sample Command Provider" --command "node <repo-root>/samples/command-provider/provider.js" --artifact-types "static_site,dynamic_site,image,video,file,url" --managed --supports-stop --stop-command "node <repo-root>/samples/command-provider/provider.js" --description "Local sample command provider"
```

Then preview and stop:

```bash
node src/index.js preview . --json
node src/index.js stop <previewId> --json
```

### Useful commands

```bash
agentic-preview providers default static_site my-cmd-provider
agentic-preview providers enable my-cmd-provider
agentic-preview providers disable my-cmd-provider
agentic-preview --json providers list
agentic-preview --json list
agentic-preview --json stop preview-xxxx
```

### Troubleshooting

- "Provider ... is not available or disabled": check `providers list` and provider `enabled` state.
- `Command returned no JSON output`: your provider script did not print a valid JSON object to stdout.
- `No provider supports artifact type`: no enabled provider matches the artifact type.
