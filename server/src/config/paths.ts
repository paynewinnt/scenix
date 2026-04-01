import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));

export const serverRootDir = path.resolve(configDir, '../..');
export const workspaceRootDir = path.resolve(serverRootDir, '..');

export function resolveFromWorkspaceRoot(targetPath: string): string {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(workspaceRootDir, targetPath);
}

export function resolveFromServerRoot(targetPath: string): string {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(serverRootDir, targetPath);
}
