import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const setupDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(setupDir, '../.env');

if (existsSync(envPath)) {
  const envText = readFileSync(envPath, 'utf8');

  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

if (process.env.MIDSCENE_REPLANNING_CYCLE_LIMIT === undefined) {
  process.env.MIDSCENE_REPLANNING_CYCLE_LIMIT = '3';
}
