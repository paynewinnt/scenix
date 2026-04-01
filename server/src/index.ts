import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { initDatabase } from './db/index.js';
import { resolveFromWorkspaceRoot, workspaceRootDir } from './config/paths.js';
import { getCanonicalRunDir, migrateLegacyRunArtifacts, normalizeRunDirEnv } from './config/run-dir.js';
import { validateAIConfig } from 'core';
import { testCasesRouter } from './routes/test-cases.js';
import { testSuitesRouter } from './routes/test-suites.js';
import { testRunsRouter } from './routes/test-runs.js';
import { devicesRouter } from './routes/devices.js';
import { eventsRouter } from './routes/events.js';

dotenv.config({ path: path.resolve(workspaceRootDir, '.env') });
normalizeRunDirEnv();
migrateLegacyRunArtifacts();

// Initialize database
initDatabase();

// Validate AI configuration (warn only, don't block startup)
const aiWarnings = validateAIConfig();
if (aiWarnings.length > 0) {
  console.warn('--- AI Configuration Warnings ---');
  for (const w of aiWarnings) {
    console.warn(`  ⚠ ${w}`);
  }
  console.warn('---------------------------------');
}

const app = express();
const PORT = process.env.SERVER_PORT ?? 3001;

app.use(cors());
app.use(express.json());

// Serve Midscene report files as static assets
app.use('/reports', express.static(getCanonicalRunDir()));
// Also serve midscene_run directory (TestRunner default output path)
app.use('/midscene_run', express.static(resolveFromWorkspaceRoot('midscene_run')));

// SSE route must be mounted before test-runs to match /api/test-runs/events first
app.use('/api/test-runs/events', eventsRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/test-suites', testSuitesRouter);
app.use('/api/test-runs', testRunsRouter);
app.use('/api/devices', devicesRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
