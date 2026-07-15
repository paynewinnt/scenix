import path from 'node:path';
import { TestRunner, type TestCaseInput } from 'core';
import { getCanonicalRunDir } from '../config/run-dir.js';
import { resolveGeneratedReportPath } from './report-binding.js';
import { getDeviceById } from './device-service.js';
import {
  reserveRunResources,
  selectQueuedRunsForDispatch,
  type RunResourceReservation,
} from './run-coordinator.js';
import {
  admitQueuedRunRecord,
  getQueuedRunRecord,
  listCoordinatedRunsByStatus,
  listExecutableRunItems,
  markActiveRunAsError,
  markQueuedRunAsErrorRecord,
  markRunFinished,
  markRunItemFinished,
  markRunItemRunning,
} from './run-repository.js';
import { generateSuiteSummaryReport } from './run-report-service.js';
import { mergeRunStatus, type RunStatus } from './run-status.js';
import {
  aggregateErrorMessageFromItems,
  broadcastRunUpdate,
  getRunItems,
} from './run-read-service.js';
import type { ExecutableRunItem, RunPlatform } from './run-types.js';

interface AdmittedRun {
  runId: string;
  suiteName: string;
  platform: RunPlatform;
  deviceId?: string;
  deviceUdid?: string;
  deviceConfig?: TestCaseInput['deviceConfig'];
  items: ExecutableRunItem[];
  reservation: RunResourceReservation;
}

const runner = new TestRunner();
const caseReportDir = path.join(getCanonicalRunDir(), 'report');

let scheduling = false;
let scheduleRequested = false;

export async function scheduleQueuedRuns(): Promise<void> {
  if (scheduling) {
    scheduleRequested = true;
    return;
  }

  scheduling = true;

  try {
    do {
      scheduleRequested = false;
      await dispatchQueuedRuns();
    } while (scheduleRequested);
  } finally {
    scheduling = false;
  }
}

async function dispatchQueuedRuns(): Promise<void> {
  const queuedRuns = listCoordinatedRunsByStatus('queued');
  if (queuedRuns.length === 0) {
    return;
  }

  const runningRuns = listCoordinatedRunsByStatus('running');
  const runsToStart = selectQueuedRunsForDispatch(queuedRuns, runningRuns);

  for (const run of runsToStart) {
    const admittedRun = await admitQueuedRun(run.id);
    if (!admittedRun) {
      continue;
    }

    void executeQueuedRun(admittedRun)
      .catch((error) => {
        console.error(`[TestRun ${admittedRun.runId}] Unhandled error:`, error);
      })
      .finally(() => {
        admittedRun.reservation.release();
        void scheduleQueuedRuns();
      });
  }
}

async function admitQueuedRun(runId: string): Promise<AdmittedRun | null> {
  const runRecord = getQueuedRunRecord(runId);
  if (!runRecord) {
    return null;
  }

  const items = listExecutableRunItems(runId);
  if (items.length === 0) {
    markQueuedRunAsError(runId, '测试套件没有可执行的测试用例');
    return null;
  }
  if (items.some((item) => item.steps.trim().length === 0)) {
    markQueuedRunAsError(runId, '测试用例定义缺失，无法继续执行');
    return null;
  }

  let deviceUdid: string | undefined;
  let deviceConfig: TestCaseInput['deviceConfig'];

  if (runRecord.platform !== 'web') {
    if (!runRecord.deviceId) {
      markQueuedRunAsError(runId, '移动端测试套件缺少目标设备');
      return null;
    }

    const device = await getDeviceById(runRecord.deviceId, {
      forceRefresh: true,
      includeRuntimeStatus: false,
    });

    if (!device) {
      return null;
    }

    if (device.platform !== runRecord.platform) {
      markQueuedRunAsError(
        runId,
        `Selected device platform ${device.platform} does not match test suite platform ${runRecord.platform}`,
      );
      return null;
    }

    deviceUdid = device.udid;
    deviceConfig =
      runRecord.platform === 'ios'
        ? {
            udid: device.udid,
            wdaHost: device.wdaHost,
            wdaPort: device.wdaPort,
          }
        : undefined;
  }

  const reservation = reserveRunResources(
    {
      platform: runRecord.platform,
      deviceId: runRecord.deviceId,
    },
    runId,
  );
  if (!reservation) {
    return null;
  }

  try {
    const actualStart = new Date().toISOString();
    const admitted = admitQueuedRunRecord(runId, items[0].itemId, actualStart);
    if (!admitted) {
      reservation.release();
      return null;
    }

    broadcastRunUpdate(runId);

    return {
      runId,
      suiteName: runRecord.suiteName,
      platform: runRecord.platform,
      deviceId: runRecord.deviceId,
      deviceUdid,
      deviceConfig,
      items,
      reservation,
    };
  } catch (error) {
    reservation.release();
    throw error;
  }
}

async function executeQueuedRun(run: AdmittedRun): Promise<void> {
  try {
    let suiteStatus: Exclude<RunStatus, 'queued' | 'pending' | 'running'> = 'passed';
    let suiteErrorMessage: string | null = null;
    let suiteFinishedAt = new Date().toISOString();

    for (const [index, testCase] of run.items.entries()) {
      if (index > 0) {
        const itemStart = new Date().toISOString();
        markRunItemRunning(testCase.itemId, itemStart);
        broadcastRunUpdate(run.runId);
      }

      try {
        const result = await runner.run({
          id: testCase.testCaseId,
          name: testCase.testCaseName,
          platform: testCase.platform,
          steps: testCase.steps,
          deviceUdid: run.deviceUdid,
          deviceConfig: run.deviceConfig,
          reportFileName: `case-${run.runId}-${testCase.itemId}`,
        });

        const reportPath = resolveGeneratedReportPath(caseReportDir, result.reportPath);

        markRunItemFinished({
          itemId: testCase.itemId,
          status: result.status,
          finishedAt: result.finishedAt,
          reportPath,
          errorMessage: result.errorMessage ?? null,
        });

        if (result.status === 'failed' || result.status === 'error') {
          const outcome = updateSuiteOutcome(
            suiteStatus,
            suiteErrorMessage,
            result.status,
            result.errorMessage ?? `${testCase.testCaseName} ${result.status === 'error' ? '执行异常' : '执行失败'}`,
          );
          suiteStatus = outcome.status;
          suiteErrorMessage = outcome.errorMessage;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const finishedAt = new Date().toISOString();

        markRunItemFinished({
          itemId: testCase.itemId,
          status: 'error',
          finishedAt,
          reportPath: null,
          errorMessage,
        });

        const outcome = updateSuiteOutcome(suiteStatus, suiteErrorMessage, 'error', errorMessage);
        suiteStatus = outcome.status;
        suiteErrorMessage = outcome.errorMessage;
      }

      suiteFinishedAt = new Date().toISOString();
      broadcastRunUpdate(run.runId);
    }

    const items = getRunItems(run.runId);
    const aggregateReportPath =
      items.length > 1
        ? generateSuiteSummaryReport(caseReportDir, {
            runId: run.runId,
            suiteName: run.suiteName,
            platform: run.platform,
            status: suiteStatus,
            startedAt: items[0]?.startedAt ?? suiteFinishedAt,
            finishedAt: suiteFinishedAt,
            errorMessage: aggregateErrorMessageFromItems(items, suiteErrorMessage),
            items,
          })
        : items[0]?.reportPath ?? null;
    const aggregateErrorMessage = aggregateErrorMessageFromItems(items, suiteErrorMessage);

    markRunFinished({
      runId: run.runId,
      status: suiteStatus,
      finishedAt: suiteFinishedAt,
      reportPath: aggregateReportPath,
      errorMessage: aggregateErrorMessage,
    });

    broadcastRunUpdate(run.runId);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);

    markActiveRunAsError(run.runId, errorMessage, finishedAt);
    broadcastRunUpdate(run.runId);
    throw error;
  }
}

function updateSuiteOutcome(
  currentStatus: Exclude<RunStatus, 'queued' | 'pending' | 'running'>,
  currentErrorMessage: string | null,
  nextStatus: Exclude<RunStatus, 'queued' | 'pending' | 'running' | 'passed'>,
  nextErrorMessage: string,
): {
  status: Exclude<RunStatus, 'queued' | 'pending' | 'running'>;
  errorMessage: string | null;
} {
  const mergedStatus = mergeRunStatus(
    currentStatus,
    nextStatus,
  ) as Exclude<RunStatus, 'queued' | 'pending' | 'running'>;

  return {
    status: mergedStatus,
    errorMessage: !currentErrorMessage || mergedStatus !== currentStatus ? nextErrorMessage : currentErrorMessage,
  };
}

function markQueuedRunAsError(runId: string, errorMessage: string): void {
  const updated = markQueuedRunAsErrorRecord(runId, errorMessage, new Date().toISOString());
  if (!updated) {
    return;
  }

  broadcastRunUpdate(runId);
  void scheduleQueuedRuns();
}
