import { fileExists, artifactTypeFromPath, isRemoteUrl } from './utils.js';
import path from 'node:path';

export async function buildArtifactDescriptor(input, overrideType) {
  const artifactPath = input.trim();
  const isUrl = isRemoteUrl(artifactPath);
  if (isUrl) {
    return {
      id: `artifact-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: 'url',
      type: 'url',
      sourceType: 'url',
      path: artifactPath,
      entrypoint: undefined,
      title: 'Url Artifact',
      metadata: {},
    };
  }

  const normalizedPath = path.resolve(artifactPath);
  const stat = await fileExists(normalizedPath);
  if (!stat) {
    throw new Error(`Input path does not exist: ${artifactPath}`);
  }

  const sourceType = stat.isDirectory() ? 'directory' : 'file';
  const inferredType = overrideType
    || (sourceType === 'directory' ? 'static_site' : artifactTypeFromPath(normalizedPath));

  return {
    id: `artifact-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: sourceType,
    type: inferredType,
    sourceType,
    path: normalizedPath,
    entrypoint: sourceType === 'directory' ? 'index.html' : path.basename(normalizedPath),
    title: path.basename(normalizedPath),
    metadata: {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      mode: stat.mode,
    },
  };
}
