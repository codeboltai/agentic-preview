# Sample Command Provider

This sample demonstrates a minimal `agentic-preview` command provider that:

- receives JSON payload on `stdin`
- returns preview JSON on `stdout`
- supports `stop` requests

Use this as a starting point for your own preview provider integrations.

## 1) Register the provider

From the `agentic-preview` project root:

```bash
node src/index.js providers add-command \
  --id sample-command-provider \
  --name "Sample Command Provider" \
  --command "node D:\\Codeboltapps\\agentic-preview\\samples\\command-provider\\provider.js" \
  --artifact-types "static_site,dynamic_site,image,video,file,url" \
  --managed \
  --supports-stop \
  --stop-command "node D:\\Codeboltapps\\agentic-preview\\samples\\command-provider\\provider.js" \
  --description "Local sample provider that returns a file or URL artifact target"
```

## 2) Try it

```bash
node src/index.js preview <artifactPath> --json
```

If managed, stop it:

```bash
node src/index.js stop <previewId> --json
```

## 3) Remove when done

```bash
node src/index.js providers remove sample-command-provider
```

## Expected behavior

- `artifact.type=url` → opens the supplied URL directly.
- `artifact` file or directory → opens a `file://` URL for the artifact path (directory resolves to entrypoint when provided).
- `stop` command writes a stop acknowledgement and exits with success.

