import { Router, type Response } from 'express';
import { createQueuedRun, deleteRunById, RunCommandError } from '../services/run-command-service.js';
import { getRunById, listRuns } from '../services/run-read-service.js';

export const testRunsRouter: Router = Router();

testRunsRouter.get('/', (_req, res) => {
  res.json(listRuns());
});

testRunsRouter.get('/:id', (req, res) => {
  const run = getRunById(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(run);
});

testRunsRouter.delete('/:id', async (req, res) => {
  try {
    await deleteRunById(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleRunCommandError(error, res);
  }
});

testRunsRouter.post('/', async (req, res) => {
  try {
    const { runId, run } = await createQueuedRun(req.body as { suiteId?: string; deviceId?: string });
    res.status(201).json(run ?? { id: runId });
  } catch (error) {
    handleRunCommandError(error, res);
  }
});

function handleRunCommandError(error: unknown, res: Response): void {
  if (error instanceof RunCommandError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error('test-runs route failed:', error);
  res.status(500).json({ error: 'Internal server error' });
}
