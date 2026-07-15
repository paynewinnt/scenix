import cors from 'cors';
import express from 'express';
import { getAllowedCorsOrigins } from './config/network.js';
import { resolveFromWorkspaceRoot } from './config/paths.js';
import { getCanonicalRunDir } from './config/run-dir.js';
import { devicesRouter } from './routes/devices.js';
import { eventsRouter } from './routes/events.js';
import { readinessRouter } from './routes/readiness.js';
import { testCasesRouter } from './routes/test-cases.js';
import { testRunsRouter } from './routes/test-runs.js';
import { testSuitesRouter } from './routes/test-suites.js';

export function createApp(): express.Express {
  const app = express();
  const allowedOrigins = getAllowedCorsOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
      },
    }),
  );
  app.use(express.json());

  app.use('/reports', express.static(getCanonicalRunDir()));
  app.use('/midscene_run', express.static(resolveFromWorkspaceRoot('midscene_run')));

  app.use('/api/test-runs/events', eventsRouter);
  app.use('/api/test-cases', testCasesRouter);
  app.use('/api/test-suites', testSuitesRouter);
  app.use('/api/test-runs', testRunsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/readiness', readinessRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
