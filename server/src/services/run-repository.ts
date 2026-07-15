import crypto from 'node:crypto';
import { getDb } from '../db/index.js';
import type { CoordinatedRun } from './run-coordinator.js';
import type { RunStatus } from './run-status.js';
import type { ExecutableRunItem, RunPlatform, TestSuiteForExecution } from './run-types.js';

export interface RunRecord {
  id: string;
  test_case_id: string | null;
  test_case_name: string | null;
  suite_id: string | null;
  suite_name: string | null;
  platform: RunPlatform;
  device_id: string | null;
  status: RunStatus;
  queued_at: string | null;
  dispatched_at: string | null;
  started_at: string;
  finished_at: string | null;
  report_path: string | null;
  error_message: string | null;
}

export interface RunItemRecord {
  id: string;
  test_run_id: string;
  test_case_id: string;
  test_case_name: string;
  platform: RunPlatform;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  report_path: string | null;
  error_message: string | null;
  sort_order: number;
  steps_snapshot: string | null;
}

export interface QueuedRunRecord {
  id: string;
  platform: RunPlatform;
  deviceId?: string;
  suiteName: string;
}

export function listRunRecords(): RunRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM test_runs
       ORDER BY COALESCE(dispatched_at, queued_at, started_at) DESC, id DESC`,
    )
    .all() as RunRecord[];
}

export function getRunRecordById(id: string): RunRecord | null {
  const db = getDb();
  return (
    (db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id) as RunRecord | undefined) ?? null
  );
}

export function listRunItemRecords(runId: string): RunItemRecord[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM test_run_items WHERE test_run_id = ? ORDER BY sort_order ASC, started_at ASC')
    .all(runId) as RunItemRecord[];
}

export function listExecutableRunItems(runId: string): ExecutableRunItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         i.id AS item_id,
         i.test_case_id,
         i.test_case_name,
         i.platform,
         COALESCE(i.steps_snapshot, c.steps) AS steps
       FROM test_run_items i
       LEFT JOIN test_cases c ON c.id = i.test_case_id
       WHERE i.test_run_id = ?
       ORDER BY i.sort_order ASC, i.started_at ASC`,
    )
    .all(runId) as Array<{
      item_id: string;
      test_case_id: string;
      test_case_name: string;
      platform: RunPlatform;
      steps: string | null;
    }>;

  return rows.map((row) => ({
    itemId: String(row.item_id),
    testCaseId: String(row.test_case_id),
    testCaseName: String(row.test_case_name),
    platform: row.platform,
    steps: typeof row.steps === 'string' ? row.steps : '',
  }));
}

export function getSuiteDefinitionById(suiteId: string): TestSuiteForExecution | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.platform, c.id AS case_id, c.name AS case_name, c.platform AS case_platform, c.steps AS case_steps
       FROM test_suites s
       LEFT JOIN test_suite_cases sc ON sc.suite_id = s.id
       LEFT JOIN test_cases c ON c.id = sc.test_case_id
       WHERE s.id = ?
       ORDER BY sc.sort_order ASC`,
    )
    .all(suiteId) as Array<{
      id: string;
      name: string;
      platform: RunPlatform;
      case_id: string | null;
      case_name: string | null;
      case_platform: RunPlatform | null;
      case_steps: string | null;
    }>;

  if (rows.length === 0) {
    return null;
  }

  return {
    id: String(rows[0].id),
    name: String(rows[0].name),
    platform: rows[0].platform,
    testCases: rows
      .filter((row) => row.case_id)
      .map((row) => ({
        id: String(row.case_id),
        name: String(row.case_name),
        platform: row.case_platform as RunPlatform,
        steps: String(row.case_steps),
      })),
  };
}

export function listCoordinatedRunsByStatus(status: Extract<RunStatus, 'queued' | 'running'>): CoordinatedRun[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, platform, device_id, queued_at, dispatched_at, started_at
       FROM test_runs
       WHERE status = ?
       ORDER BY
         CASE
           WHEN ? = 'queued' THEN COALESCE(queued_at, started_at)
           ELSE COALESCE(dispatched_at, started_at, queued_at)
         END ASC,
         id ASC`,
    )
    .all(status, status) as Array<{
      id: string;
      platform: RunPlatform;
      device_id: string | null;
      queued_at: string | null;
      dispatched_at: string | null;
      started_at: string;
    }>;

  return rows.map((row) => ({
    id: String(row.id),
    platform: row.platform,
    deviceId: row.device_id ? String(row.device_id) : undefined,
    startedAt:
      status === 'queued'
        ? row.queued_at ?? row.started_at
        : row.dispatched_at ?? row.started_at ?? row.queued_at ?? row.started_at,
  }));
}

export function createQueuedRunRecord(input: {
  suite: TestSuiteForExecution;
  deviceId?: string;
  queuedAt: string;
}): string {
  const db = getDb();
  const runId = crypto.randomUUID();
  const firstCase = input.suite.testCases[0];

  const createRun = db.transaction(() => {
    db.prepare(
      `INSERT INTO test_runs (
        id, test_case_id, test_case_name, suite_id, suite_name, platform, device_id, status, queued_at, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    ).run(
      runId,
      firstCase.id,
      firstCase.name,
      input.suite.id,
      input.suite.name,
      input.suite.platform,
      input.deviceId ?? null,
      input.queuedAt,
      input.queuedAt,
    );

    const itemInsert = db.prepare(
      `INSERT INTO test_run_items (
        id, test_run_id, test_case_id, test_case_name, platform, status, started_at, sort_order, steps_snapshot
      ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
    );

    input.suite.testCases.forEach((testCase, index) => {
      itemInsert.run(
        crypto.randomUUID(),
        runId,
        testCase.id,
        testCase.name,
        testCase.platform,
        input.queuedAt,
        index,
        testCase.steps,
      );
    });
  });

  createRun();

  return runId;
}

export function deleteRunCascade(runId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM test_runs WHERE id = ?').run(runId);
  return result.changes > 0;
}

export function getQueuedRunRecord(runId: string): QueuedRunRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, platform, device_id, suite_name, test_case_name FROM test_runs WHERE id = ? AND status = ?')
    .get(runId, 'queued') as
    | {
        id: string;
        platform: RunPlatform;
        device_id: string | null;
        suite_name: string | null;
        test_case_name: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    platform: row.platform,
    deviceId: row.device_id ? String(row.device_id) : undefined,
    suiteName: String(row.suite_name ?? row.test_case_name),
  };
}

export function admitQueuedRunRecord(runId: string, firstItemId: string, actualStart: string): boolean {
  const db = getDb();
  const admitRun = db.transaction((targetRunId: string, targetItemId: string, startedAt: string) => {
    const updateRunResult = db
      .prepare(
        `UPDATE test_runs
         SET status = 'running', dispatched_at = ?, started_at = ?, finished_at = NULL, error_message = NULL
         WHERE id = ? AND status = 'queued'`,
      )
      .run(startedAt, startedAt, targetRunId);

    if (updateRunResult.changes === 0) {
      return false;
    }

    db.prepare(
      `UPDATE test_run_items
       SET status = 'pending', finished_at = NULL, error_message = NULL
       WHERE test_run_id = ? AND status = 'queued'`,
    ).run(targetRunId);

    db.prepare(
      `UPDATE test_run_items
       SET status = 'running', started_at = ?, finished_at = NULL, error_message = NULL
       WHERE id = ?`,
    ).run(startedAt, targetItemId);

    return true;
  });

  return admitRun(runId, firstItemId, actualStart);
}

export function markRunItemRunning(itemId: string, startedAt: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE test_run_items
     SET status = 'running', started_at = ?, finished_at = NULL, error_message = NULL
     WHERE id = ?`,
  ).run(startedAt, itemId);
}

export function markRunItemFinished(input: {
  itemId: string;
  status: Exclude<RunStatus, 'queued' | 'pending' | 'running'>;
  finishedAt: string;
  reportPath?: string | null;
  errorMessage?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `UPDATE test_run_items
     SET status = ?, finished_at = ?, report_path = ?, error_message = ?
     WHERE id = ?`,
  ).run(input.status, input.finishedAt, input.reportPath ?? null, input.errorMessage ?? null, input.itemId);
}

export function markRunFinished(input: {
  runId: string;
  status: Exclude<RunStatus, 'queued' | 'pending' | 'running'>;
  finishedAt: string;
  reportPath?: string | null;
  errorMessage?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `UPDATE test_runs
     SET status = ?, finished_at = ?, report_path = ?, error_message = ?
     WHERE id = ?`,
  ).run(input.status, input.finishedAt, input.reportPath ?? null, input.errorMessage ?? null, input.runId);
}

export function updateRunReportPath(runId: string, reportPath: string): void {
  const db = getDb();
  db.prepare('UPDATE test_runs SET report_path = ? WHERE id = ?').run(reportPath, runId);
}

export function markActiveRunAsError(runId: string, errorMessage: string, finishedAt: string): void {
  const db = getDb();
  const markRunAsError = db.transaction((targetRunId: string, nextErrorMessage: string, nextFinishedAt: string) => {
    db.prepare(
      `UPDATE test_run_items
       SET status = 'error', finished_at = ?, error_message = COALESCE(error_message, ?)
       WHERE test_run_id = ? AND status IN ('queued', 'pending', 'running')`,
    ).run(nextFinishedAt, nextErrorMessage, targetRunId);

    db.prepare(
      `UPDATE test_runs
       SET status = 'error', finished_at = ?, error_message = COALESCE(error_message, ?)
       WHERE id = ?`,
    ).run(nextFinishedAt, nextErrorMessage, targetRunId);
  });

  markRunAsError(runId, errorMessage, finishedAt);
}

export function markQueuedRunAsErrorRecord(runId: string, errorMessage: string, finishedAt: string): boolean {
  const db = getDb();
  const markQueuedAsError = db.transaction((targetRunId: string, nextErrorMessage: string, nextFinishedAt: string) => {
    db.prepare(
      `UPDATE test_run_items
       SET status = 'error', finished_at = ?, error_message = COALESCE(error_message, ?)
       WHERE test_run_id = ? AND status = 'queued'`,
    ).run(nextFinishedAt, nextErrorMessage, targetRunId);

    return db.prepare(
      `UPDATE test_runs
       SET status = 'error', finished_at = ?, error_message = COALESCE(error_message, ?)
       WHERE id = ? AND status = 'queued'`,
    ).run(nextFinishedAt, nextErrorMessage, targetRunId).changes > 0;
  });

  return markQueuedAsError(runId, errorMessage, finishedAt);
}

export function recoverInterruptedRunRecords(errorMessage: string, finishedAt: string): string[] {
  const db = getDb();
  const interruptedRuns = db
    .prepare(`SELECT id FROM test_runs WHERE status IN ('pending', 'running')`)
    .all() as Array<{ id: string }>;

  if (interruptedRuns.length === 0) {
    return [];
  }

  const recoverRuns = db.transaction((runIds: string[], nextErrorMessage: string, nextFinishedAt: string) => {
    const updateRun = db.prepare(
      `UPDATE test_runs
       SET status = 'error', finished_at = ?, error_message = COALESCE(error_message, ?)
       WHERE id = ?`,
    );
    const updateItems = db.prepare(
      `UPDATE test_run_items
       SET status = 'error', finished_at = ?, error_message = COALESCE(error_message, ?)
       WHERE test_run_id = ? AND status IN ('pending', 'running')`,
    );

    for (const runId of runIds) {
      updateItems.run(nextFinishedAt, nextErrorMessage, runId);
      updateRun.run(nextFinishedAt, nextErrorMessage, runId);
    }
  });

  recoverRuns(
    interruptedRuns.map((run) => run.id),
    errorMessage,
    finishedAt,
  );

  return interruptedRuns.map((run) => run.id);
}
