import dotenv from 'dotenv';
import path from 'node:path';
import { validateAIConfig } from 'core';
import { createApp } from './app.js';
import { initDatabase } from './db/index.js';
import { workspaceRootDir } from './config/paths.js';
import { migrateLegacyRunArtifacts, normalizeRunDirEnv } from './config/run-dir.js';
import { isLoopbackHost, resolveServerNetworkConfig } from './config/network.js';
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

async function startServer(): Promise<void> {
  const network = resolveServerNetworkConfig();
  await recoverInterruptedRunsOnStartup();

  if (!isLoopbackHost(network.host)) {
    console.warn(
      'WARNING: Scenix is listening remotely without authentication. Use a trusted network and restrictive firewall.',
    );
  }

  app.listen(network.port, network.host, () => {
    console.log(`Server running on http://${network.host}:${network.port}`);
  });
}

void startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});
