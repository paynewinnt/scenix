import { broadcast } from '../sse/event-bus.js';
import { getDeviceById } from './device-service.js';
import { scheduleQueuedRuns } from './run-execution-service.js';
import { deleteReportFile } from './run-report-service.js';
import {
  createQueuedRunRecord,
  deleteRunCascade,
  getSuiteDefinitionById,
} from './run-repository.js';
import { getRunById } from './run-read-service.js';
import type { TestRun } from './run-types.js';

export class RunCommandError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'RunCommandError';
  }
}

export async function createQueuedRun(input: {
  suiteId?: string;
  deviceId?: string;
}): Promise<{ runId: string; run: TestRun | null }> {
  if (!input.suiteId) {
    throw new RunCommandError(400, 'Missing required field: suiteId');
  }

  const suite = getSuiteDefinitionById(input.suiteId);
  if (!suite) {
    throw new RunCommandError(404, 'Test suite not found');
  }

  if (suite.testCases.length === 0) {
    throw new RunCommandError(400, '测试套件至少需要包含一个测试用例');
  }

  let resolvedDeviceId: string | undefined;

  if (suite.platform === 'web' && input.deviceId) {
    throw new RunCommandError(400, 'Web test suites must not specify a device');
  }

  if (suite.platform !== 'web') {
    if (!input.deviceId) {
      throw new RunCommandError(400, `Missing required field: deviceId for ${suite.platform} test suite`);
    }

    const device = await getDeviceById(String(input.deviceId), {
      forceRefresh: true,
      includeRuntimeStatus: false,
    });
    if (!device) {
      throw new RunCommandError(400, 'Selected device is not connected or no longer available');
    }

    if (device.platform !== suite.platform) {
      throw new RunCommandError(
        400,
        `Selected device platform ${device.platform} does not match test suite platform ${suite.platform}`,
      );
    }

    resolvedDeviceId = device.id;
  }

  const runId = createQueuedRunRecord({
    suite,
    deviceId: resolvedDeviceId,
    queuedAt: new Date().toISOString(),
  });
  const run = getRunById(runId);

  if (run) {
    broadcast('test-run:created', run);
  } else {
    broadcast('test-run:created', { id: runId });
  }

  void scheduleQueuedRuns();

  return { runId, run };
}

export async function deleteRunById(runId: string): Promise<void> {
  const run = getRunById(runId);
  if (!run) {
    throw new RunCommandError(404, 'Not found');
  }

  if (run.status === 'pending' || run.status === 'running') {
    throw new RunCommandError(400, 'Cannot delete a test run that is still running');
  }

  const reportPaths = new Set<string>();
  if (run.reportPath) {
    reportPaths.add(run.reportPath);
  }
  for (const item of run.items) {
    if (item.reportPath) {
      reportPaths.add(item.reportPath);
    }
  }

  deleteRunCascade(runId);

  for (const reportPath of reportPaths) {
    deleteReportFile(reportPath);
  }

  broadcast('test-run:deleted', { id: runId });

  if (run.status === 'queued') {
    void scheduleQueuedRuns();
  }
}
