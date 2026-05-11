# SKILL: agentic-preview CLI Provider Development

Use this skill when you need to create, debug, or test artifact preview providers for
`agentic-preview`.

## Scope

- Run and verify the local preview CLI.
- Register custom command providers.
- Validate provider request/response payloads.
- Troubleshoot preview start/stop flows.

## Project path

- `D:\CodeBoltapps\agentic-preview`

## Prerequisites

- Node.js 18+.
- Project dependencies installed (`npm install` in `D:\CodeBoltapps\agentic-preview`).

## Quick verification sequence

1. `node src/index.js providers list --json`  
   Confirms built-in providers are present.
2. `node src/index.js preview <path> --json`  
   Verifies baseline preview flow and returns `previewId`.
3. `node src/index.js list --json`  
   Confirms active session appears.
4. `node src/index.js stop <previewId> --json`  
   Confirms managed session stops cleanly.

## Register a custom provider

```bash
node src/index.js providers add-command \
  --id my-provider \
  --name "My Provider" \
  --command "node ./my-provider.js" \
  --artifact-types "static_site,dynamic_site" \
  --managed \
  --supports-stop \
  --stop-command "node ./my-provider.js"
```

Key expectations:

- `--command` executes on every `preview` request.
- Payload is sent as JSON on stdin.
- Script must emit a JSON object on stdout.
- `--stop-command` receives stop payload when `agentic-preview stop <previewId>` is called.

### Built-in sample provider pack

- Source: `samples/command-provider/provider.js`
- Register:

```bash
node src/index.js providers add-command \
  --id sample-command-provider \
  --name "Sample Command Provider" \
  --command "node D:\\Codeboltapps\\agentic-preview\\samples\\command-provider\\provider.js" \
  --artifact-types "static_site,dynamic_site,image,video,file,url" \
  --managed \
  --supports-stop \
  --stop-command "node D:\\Codeboltapps\\agentic-preview\\samples\\command-provider\\provider.js"
```

- Use it:

```bash
node src/index.js preview . --json
```

- Remove provider later:

```bash
node src/index.js providers remove sample-command-provider
```

## Provider input payload (start)

- `action: "start"`
- `previewId`
- `providerId`
- `artifact` (id, kind, type, path, entrypoint, sourceType, title)
- `options` (CLI reserved options block)

## Provider output payload (required)

- `url` (string, required)
- `kind` (usually `url`)
- `openIn` (`browser` typically)

Optional:
- `label`
- `message`
- `metadata`

## Stop payload contract

Payload when stopping:

- `action: "stop"`
- `previewId`
- `providerId`
- `artifact`

Return is not strictly parsed beyond successful process exit for stop flows.

## Error patterns to catch

- `Command returned no JSON output`: stdout was not JSON.
- `No provider supports artifact type`: provider list doesn't support that artifact type.
- `Provider ... is disabled or unavailable`: provider not enabled in CLI config.

## Example provider stub

Create `my-provider.js`:

```js
const fs = require('fs');

const payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');

if (payload.action === 'stop') {
  console.log(JSON.stringify({ ok: true, message: 'stopped' }));
  process.exit(0);
}

console.log(JSON.stringify({
  kind: 'url',
  openIn: 'browser',
  url: `file://${payload.artifact.path}`,
  label: 'My Provider',
  message: 'started',
}));
```

## After changes

- Re-run `node src/index.js preview <path> --json`.
- Confirm URL returned.
- Stop if managed: `node src/index.js stop <previewId> --json`.
