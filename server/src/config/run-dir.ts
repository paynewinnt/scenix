import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { resolveFromServerRoot, resolveFromWorkspaceRoot } from './paths.js';

export function getConfiguredRunDir(): string {
  return process.env.MIDSCENE_RUN_DIR ?? 'reports/midscene';
}

export function getCanonicalRunDir(): string {
  return resolveFromWorkspaceRoot(getConfiguredRunDir());
}

export function getLegacyRunDir(): string {
  return resolveFromServerRoot(getConfiguredRunDir());
}

export function normalizeRunDirEnv(): void {
  process.env.MIDSCENE_RUN_DIR = getCanonicalRunDir();
}

export function migrateLegacyRunArtifacts(): void {
  const canonicalDir = getCanonicalRunDir();
  const legacyDir = getLegacyRunDir();

  if (canonicalDir === legacyDir || !existsSync(legacyDir)) {
    mkdirSync(canonicalDir, { recursive: true });
    return;
  }

  mkdirSync(path.dirname(canonicalDir), { recursive: true });
  mkdirSync(canonicalDir, { recursive: true });

  cpSync(legacyDir, canonicalDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });

  rmSync(legacyDir, { recursive: true, force: true });
}
