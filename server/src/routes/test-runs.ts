import { Router } from 'express';
import crypto from 'node:crypto';

export interface TestRun {
  id: string;
  testCaseId: string;
  testCaseName: string;
  platform: string;
  deviceId?: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error';
  startedAt: string;
  finishedAt?: string;
  reportPath?: string;
  errorMessage?: string;
}

const store: TestRun[] = [];

// Simulated test execution (replace with real Midscene.js / Appium runner)
async function executeTest(run: TestRun): Promise<void> {
  run.status = 'running';

  // TODO: Integrate with core/src/runner/test-runner.ts
  // This is a placeholder that simulates test execution
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Simulate random pass/fail for demo
  const passed = Math.random() > 0.3;
  run.status = passed ? 'passed' : 'failed';
  run.finishedAt = new Date().toISOString();
  if (!passed) {
    run.errorMessage = 'AI assertion failed: expected element not found on screen';
  }
  run.reportPath = `/reports/midscene/${run.id}.html`;
}

export const testRunsRouter = Router();

testRunsRouter.get('/', (_req, res) => {
  res.json(store);
});

testRunsRouter.get('/:id', (req, res) => {
  const item = store.find((r) => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

testRunsRouter.post('/', async (req, res) => {
  const { testCaseId, deviceId } = req.body;

  // For demo, we create a run with placeholder data.
  // In production, look up the test case from the DB.
  const run: TestRun = {
    id: crypto.randomUUID(),
    testCaseId,
    testCaseName: `Test Case ${testCaseId.slice(0, 6)}`,
    platform: 'web',
    deviceId,
    status: 'pending',
    startedAt: new Date().toISOString(),
  };
  store.push(run);

  // Fire-and-forget test execution
  executeTest(run).catch((err) => {
    run.status = 'error';
    run.finishedAt = new Date().toISOString();
    run.errorMessage = String(err);
  });

  res.status(201).json(run);
});
