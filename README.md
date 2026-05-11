# agentic-preview

`agentic-preview` is a local-first CLI that creates preview URLs for artifacts.

## Installation (local development)

```bash
cd D:\Codeboltapps\agentic-preview
npm install
npm link
```

## Usage

```bash
agentic-preview preview ./my-app
agentic-preview preview ./index.html --type image
agentic-preview stop <previewId>
agentic-preview list

agentic-preview providers list
agentic-preview providers add-command --id my-provider --name "My Provider" --command "node ./provider.js" --artifact-types "static_site,dynamic_site"
agentic-preview providers default static_site my-provider
```

## Behaviour

- Local/static providers are executed in a daemon process so they can be stopped.
- Remote-style providers are still supported by command-provider integration and can return a URL immediately.
- `--json` prints machine-readable output across commands.
