import dotenv from 'dotenv';
import path from 'node:path';
import { validateAIConfig } from 'core';
import { createApp } from './app.js';
import { initDatabase } from './db/index.js';
import { workspaceRootDir } from './config/paths.js';
import { migrateLegacyRunArtifacts, normalizeRunDirEnv } from './config/run-dir.js';
import { recoverInterruptedRunsOnStartup } from './services/run-recovery-service.js';

dotenv.config({ path: path.resolve(workspaceRootDir, '.env') });
normalizeRunDirEnv();
migrateLegacyRunArtifacts();

initDatabase();

const aiWarnings = validateAIConfig();
if (aiWarnings.length > 0) {
  console.warn('--- AI Configuration Warnings ---');
  for (const w of aiWarnings) {
    console.warn(`  ⚠ ${w}`);
  }
  console.warn('---------------------------------');
}

const app = createApp();
const PORT = process.env.SERVER_PORT ?? 3001;

void recoverInterruptedRunsOnStartup().catch((error) => {
  console.error('Failed to recover queued test runs on startup:', error);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
