import path from 'node:path';
import { getCanonicalRunDir } from '../config/run-dir.js';
import { broadcast } from '../sse/event-bus.js';
import { peekCachedDevices } from './device-service.js';
import {
  listCoordinatedRunsByStatus,
  listRunItemRecords,
  listRunRecords,
  getRunRecordById,
  updateRunReportPath,
  type RunItemRecord,
  type RunRecord,
} from './run-repository.js';
import {
  observeQueuedRuns,
  type RunQueueBlockedReason,
} from './run-coordinator.js';
import { inferLegacyReportPath } from './report-binding.js';
import { generateSuiteSummaryReport } from './run-report-service.js';
import { isTerminalRunStatus, type RunStatus } from './run-status.js';
import type { TestRun, TestRunItem } from './run-types.js';

export type {
  ExecutableRunItem,
  RunPlatform,
  TestRun,
  TestRunItem,
  TestSuiteForExecution,
} from './run-types.js';

const caseReportDir = path.join(getCanonicalRunDir(), 'report');
type ReportPathTimingRecord = {
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  queued_at?: string | null;
  dispatched_at?: string | null;
};

export function listRuns(): TestRun[] {
  const queuedObservations = buildQueuedRunObservationMap();
  return listRunRecords().map((row) => assembleRun(row, queuedObservations));
}

export function getRunById(id: string): TestRun | null {
  const row = getRunRecordById(id);
  if (!row) {
    return null;
  }

  return assembleRun(row, buildQueuedRunObservationMap());
}

export function getRunItems(runId: string): TestRunItem[] {
  return listRunItemRecords(runId).map(mapRunItemRecord);
}

export function aggregateErrorMessageFromItems(
  items: TestRunItem[],
  suiteErrorMessage: string | null,
): string | null {
  return suiteErrorMessage ?? items.find((item) => item.errorMessage)?.errorMessage ?? null;
}

export function broadcastRunUpdate(runId: string): void {
  const run = getRunById(runId);
  if (run) {
    broadcast('test-run:updated', run);
  }
}

function assembleRun(
  row: RunRecord,
  queuedObservations: Map<string, { queuePosition: number; blockedReason: RunQueueBlockedReason }>,
): TestRun {
  const runId = String(row.id);
  const queuedAt = resolveQueuedAt(row);
  const dispatchedAt = resolveDispatchedAt(row, row.status);
  const displayStartedAt = dispatchedAt ?? queuedAt ?? String(row.started_at);
  const items = getRunItems(runId);
  const normalizedItems = items.length > 0 ? items : [buildLegacyItem(row)];
  const persistedReportPath = normalizeReportPath(row.report_path, row, normalizedItems);
  const effectiveReportPath = isTerminalRunStatus(row.status)
    ? normalizedItems.length > 1
      ? persistedReportPath ??
        ensurePersistedSuiteSummaryReport({
          runId,
          suiteName: String(row.suite_name ?? row.test_case_name),
          platform: row.platform,
          status: row.status,
          startedAt: displayStartedAt,
          finishedAt: row.finished_at ?? undefined,
          errorMessage: row.error_message ?? undefined,
          items: normalizedItems,
        })
      : persistedReportPath ?? normalizedItems[0]?.reportPath
    : persistedReportPath ?? undefined;
  const queuedObservation = row.status === 'queued' ? queuedObservations.get(runId) : undefined;

  return {
    id: runId,
    suiteId: row.suite_id ?? undefined,
    suiteName: String(row.suite_name ?? row.test_case_name),
    testCaseId: row.test_case_id ?? undefined,
    testCaseName: row.test_case_name ?? undefined,
    platform: row.platform,
    deviceId: row.device_id ?? undefined,
    status: row.status,
    queuedAt,
    dispatchedAt,
    startedAt: displayStartedAt,
    finishedAt: row.finished_at ?? undefined,
    reportPath: effectiveReportPath ?? undefined,
    errorMessage: row.error_message ?? undefined,
    queuePosition: queuedObservation?.queuePosition,
    blockedReason: queuedObservation?.blockedReason,
    items: normalizedItems,
  };
}

function mapRunItemRecord(row: RunItemRecord): TestRunItem {
  const normalizedReportPath = normalizeReportPath(row.report_path, row, []);

  return {
    id: String(row.id),
    testRunId: String(row.test_run_id),
    testCaseId: String(row.test_case_id),
    testCaseName: String(row.test_case_name),
    platform: row.platform,
    status: row.status,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ?? undefined,
    reportPath: normalizedReportPath ?? undefined,
    errorMessage: row.error_message ?? undefined,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function buildLegacyItem(row: RunRecord): TestRunItem {
  return {
    id: `legacy-${String(row.id)}`,
    testRunId: String(row.id),
    testCaseId: String(row.test_case_id),
    testCaseName: String(row.test_case_name),
    platform: row.platform,
    status: row.status,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ?? undefined,
    reportPath: normalizeReportPath(row.report_path, row, []) ?? undefined,
    errorMessage: row.error_message ?? undefined,
    sortOrder: 0,
  };
}

function buildQueuedRunObservationMap(): Map<string, { queuePosition: number; blockedReason: RunQueueBlockedReason }> {
  const queuedRuns = listCoordinatedRunsByStatus('queued');
  if (queuedRuns.length === 0) {
    return new Map();
  }

  const runningRuns = listCoordinatedRunsByStatus('running');
  const cachedDevices = peekCachedDevices();
  const disconnectedDeviceIds = cachedDevices.length > 0
    ? queuedRuns
        .filter((run) => run.deviceId && !cachedDevices.some((device) => device.id === run.deviceId))
        .map((run) => String(run.deviceId))
    : [];

  return observeQueuedRuns(queuedRuns, runningRuns, { disconnectedDeviceIds });
}

function normalizeReportPath(
  reportPath: string | null | undefined,
  row: ReportPathTimingRecord,
  items: Array<{ reportPath?: string }>,
): string | null {
  if (reportPath) {
    return reportPath;
  }

  const status = row.status as RunStatus | undefined;
  if (!status || !isTerminalRunStatus(status)) {
    return null;
  }

  const inferredFromItems = items.length === 1 ? items[0]?.reportPath : undefined;
  if (inferredFromItems) {
    return inferredFromItems;
  }

  const startedAtValue = resolveDispatchedAt(row, status) ?? resolveQueuedAt(row);
  const startedAt = typeof startedAtValue === 'string' ? new Date(startedAtValue).getTime() : NaN;
  if (Number.isNaN(startedAt)) {
    return null;
  }

  const finishedAt = typeof row.finished_at === 'string' ? new Date(row.finished_at).getTime() : undefined;
  return inferLegacyReportPath(caseReportDir, startedAt, finishedAt);
}

function ensurePersistedSuiteSummaryReport(run: {
  runId: string;
  suiteName: string;
  platform: 'web' | 'android' | 'ios';
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
  items: TestRunItem[];
}): string | null {
  const reportPath = generateSuiteSummaryReport(caseReportDir, run);
  updateRunReportPath(run.runId, reportPath);
  return reportPath;
}

function resolveQueuedAt(
  row: Pick<ReportPathTimingRecord, 'queued_at' | 'started_at'>,
): string | undefined {
  if (typeof row.queued_at === 'string' && row.queued_at.trim()) {
    return String(row.queued_at);
  }

  if (typeof row.started_at === 'string' && row.started_at.trim()) {
    return String(row.started_at);
  }

  return undefined;
}

function resolveDispatchedAt(
  row: Pick<ReportPathTimingRecord, 'dispatched_at' | 'started_at'>,
  status: RunStatus,
): string | undefined {
  if (typeof row.dispatched_at === 'string' && row.dispatched_at.trim()) {
    return String(row.dispatched_at);
  }

  if (status !== 'queued' && typeof row.started_at === 'string' && row.started_at.trim()) {
    return String(row.started_at);
  }

  return undefined;
}
