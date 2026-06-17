import { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Duplex } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/src/app';
import { initDatabase } from '../../server/src/db';
import { resetRunCoordinator } from '../../server/src/services/run-coordinator';
import {
  STARTUP_RECOVERY_ERROR,
  recoverInterruptedRunsOnStartup,
} from '../../server/src/services/run-recovery-service';

interface ApiHarness {
  app: ReturnType<typeof createApp>;
  db: ReturnType<typeof initDatabase>;
  tempDir: string;
}

interface InjectedResponse<TBody = unknown> {
  status: number;
  body: TBody | null;
  text: string;
  headers: Record<string, string | string[]>;
}

const harnesses: ApiHarness[] = [];

beforeEach(() => {
  resetRunCoordinator();
});

afterEach(() => {
  resetRunCoordinator();

  while (harnesses.length > 0) {
    const harness = harnesses.pop()!;
    harness.db.close();
    rmSync(harness.tempDir, { recursive: true, force: true });
  }
});

describe('test-runs API', () => {
  it('creates, lists, reads, and deletes queued runs over HTTP', async () => {
    const harness = await createHarness();
    const suite = seedWebSuite(harness.db);
    seedRunningWebRun(harness.db, suite);

    const createResponse = await injectJsonRequest<{
      id: string;
      status: string;
      queuePosition: number;
      blockedReason: string;
    }>(harness.app, {
      method: 'POST',
      url: '/api/test-runs',
      json: { suiteId: suite.suiteId },
    });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      status: 'queued',
      queuePosition: 1,
      blockedReason: 'waiting_web_slot',
    });

    const createdRunId = String(createResponse.body?.id);

    const listResponse = await injectJsonRequest<Array<{ id: string; status: string }>>(harness.app, {
      method: 'GET',
      url: '/api/test-runs',
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body?.some((run) => run.id === createdRunId && run.status === 'queued')).toBe(true);

    const getResponse = await injectJsonRequest<{
      id: string;
      queuePosition: number;
      blockedReason: string;
    }>(harness.app, {
      method: 'GET',
      url: `/api/test-runs/${createdRunId}`,
    });
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      id: createdRunId,
      queuePosition: 1,
      blockedReason: 'waiting_web_slot',
    });

    const deleteResponse = await injectJsonRequest(harness.app, {
      method: 'DELETE',
      url: `/api/test-runs/${createdRunId}`,
    });
    expect(deleteResponse.status).toBe(204);

    const missingResponse = await injectJsonRequest<{ error: string }>(harness.app, {
      method: 'GET',
      url: `/api/test-runs/${createdRunId}`,
    });
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body).toEqual({ error: 'Not found' });
  });

  it('rejects deleting a running run over HTTP', async () => {
    const harness = await createHarness();
    const suite = seedWebSuite(harness.db);
    const runningRunId = seedRunningWebRun(harness.db, suite);

    const deleteResponse = await injectJsonRequest<{ error: string }>(harness.app, {
      method: 'DELETE',
      url: `/api/test-runs/${runningRunId}`,
    });

    expect(deleteResponse.status).toBe(400);
    expect(deleteResponse.body).toEqual({
      error: 'Cannot delete a test run that is still running',
    });
  });

  it('surfaces startup recovery through the run read API', async () => {
    const harness = await createHarness();
    const suite = seedWebSuite(harness.db);
    const interruptedRunId = seedInterruptedRun(harness.db, suite);

    await recoverInterruptedRunsOnStartup();

    const response = await injectJsonRequest<{
      status: string;
      errorMessage: string;
      items: Array<{ status: string; errorMessage: string }>;
    }>(harness.app, {
      method: 'GET',
      url: `/api/test-runs/${interruptedRunId}`,
    });
    expect(response.status).toBe(200);
    expect(response.body?.status).toBe('error');
    expect(response.body?.errorMessage).toBe(STARTUP_RECOVERY_ERROR);
    expect(response.body?.items.map((item) => item.status)).toEqual(['error', 'error']);
    expect(response.body?.items.every((item) => item.errorMessage === STARTUP_RECOVERY_ERROR)).toBe(true);
  });

  it('rejects platform changes for test cases that are already part of a suite', async () => {
    const harness = await createHarness();
    const suite = seedWebSuite(harness.db);

    const response = await injectJsonRequest<{ error: string }>(harness.app, {
      method: 'PUT',
      url: `/api/test-cases/${suite.testCaseId}`,
      json: { platform: 'android' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: '测试用例已被测试套件引用，不能直接修改平台',
    });
  });

  it('keeps historical run items when a non-first suite case is deleted', async () => {
    const harness = await createHarness();
    const suite = seedTwoCaseWebSuite(harness.db);
    const runId = seedPassedTwoCaseRun(harness.db, suite);

    const deleteResponse = await injectJsonRequest(harness.app, {
      method: 'DELETE',
      url: `/api/test-cases/${suite.secondCaseId}`,
    });
    expect(deleteResponse.status).toBe(204);

    const runResponse = await injectJsonRequest<{
      id: string;
      items: Array<{ testCaseId: string; testCaseName: string; status: string }>;
    }>(harness.app, {
      method: 'GET',
      url: `/api/test-runs/${runId}`,
    });

    expect(runResponse.status).toBe(200);
    expect(runResponse.body?.items).toHaveLength(2);
    expect(runResponse.body?.items.map((item) => item.testCaseId)).toEqual([
      suite.firstCaseId,
      suite.secondCaseId,
    ]);
    expect(runResponse.body?.items.map((item) => item.testCaseName)).toEqual([
      suite.firstCaseName,
      suite.secondCaseName,
    ]);
  });
});

async function createHarness(): Promise<ApiHarness> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'scenix-test-runs-api-'));
  const db = initDatabase(path.join(tempDir, 'app.db'));

  const harness = {
    tempDir,
    db,
    app: createApp(),
  };
  harnesses.push(harness);
  return harness;
}

function seedWebSuite(db: ReturnType<typeof initDatabase>): {
  suiteId: string;
  suiteName: string;
  testCaseId: string;
  testCaseName: string;
} {
  const now = '2026-04-22T10:00:00.000Z';
  const suiteId = 'suite-web-1';
  const suiteName = '登录套件';
  const testCaseId = 'case-web-1';
  const testCaseName = '登录用例';

  db.prepare(
    `INSERT INTO test_cases (id, name, platform, steps, created_at, updated_at)
     VALUES (?, ?, 'web', ?, ?, ?)`,
  ).run(
    testCaseId,
    testCaseName,
    '1. 打开登录页\n2. 输入账号密码',
    now,
    now,
  );

  db.prepare(
    `INSERT INTO test_suites (id, name, platform, created_at, updated_at)
     VALUES (?, ?, 'web', ?, ?)`,
  ).run(
    suiteId,
    suiteName,
    now,
    now,
  );

  db.prepare(
    `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order)
     VALUES (?, ?, 0)`,
  ).run(
    suiteId,
    testCaseId,
  );

  return { suiteId, suiteName, testCaseId, testCaseName };
}

function seedTwoCaseWebSuite(db: ReturnType<typeof initDatabase>): {
  suiteId: string;
  suiteName: string;
  firstCaseId: string;
  firstCaseName: string;
  secondCaseId: string;
  secondCaseName: string;
} {
  const now = '2026-04-22T10:00:00.000Z';
  const suiteId = 'suite-web-two-cases';
  const suiteName = '双用例套件';
  const firstCaseId = 'case-web-first';
  const firstCaseName = '第一步登录';
  const secondCaseId = 'case-web-second';
  const secondCaseName = '第二步断言';

  const insertCase = db.prepare(
    `INSERT INTO test_cases (id, name, platform, steps, created_at, updated_at)
     VALUES (?, ?, 'web', ?, ?, ?)`,
  );
  insertCase.run(firstCaseId, firstCaseName, '1. 打开登录页', now, now);
  insertCase.run(secondCaseId, secondCaseName, '1. 断言登录成功', now, now);

  db.prepare(
    `INSERT INTO test_suites (id, name, platform, created_at, updated_at)
     VALUES (?, ?, 'web', ?, ?)`,
  ).run(suiteId, suiteName, now, now);

  const insertSuiteCase = db.prepare(
    `INSERT INTO test_suite_cases (suite_id, test_case_id, sort_order)
     VALUES (?, ?, ?)`,
  );
  insertSuiteCase.run(suiteId, firstCaseId, 0);
  insertSuiteCase.run(suiteId, secondCaseId, 1);

  return {
    suiteId,
    suiteName,
    firstCaseId,
    firstCaseName,
    secondCaseId,
    secondCaseName,
  };
}

function seedPassedTwoCaseRun(
  db: ReturnType<typeof initDatabase>,
  suite: ReturnType<typeof seedTwoCaseWebSuite>,
): string {
  const runId = 'run-passed-two-cases';
  const startedAt = '2026-04-22T10:05:00.000Z';
  const finishedAt = '2026-04-22T10:10:00.000Z';

  db.prepare(
    `INSERT INTO test_runs (
      id, test_case_id, test_case_name, suite_id, suite_name, platform, status,
      queued_at, dispatched_at, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, 'web', 'passed', ?, ?, ?, ?)`,
  ).run(
    runId,
    suite.firstCaseId,
    suite.firstCaseName,
    suite.suiteId,
    suite.suiteName,
    startedAt,
    startedAt,
    startedAt,
    finishedAt,
  );

  const insertItem = db.prepare(
    `INSERT INTO test_run_items (
      id, test_run_id, test_case_id, test_case_name, platform, status, started_at, finished_at, sort_order
    ) VALUES (?, ?, ?, ?, 'web', 'passed', ?, ?, ?)`,
  );
  insertItem.run('item-passed-first', runId, suite.firstCaseId, suite.firstCaseName, startedAt, finishedAt, 0);
  insertItem.run('item-passed-second', runId, suite.secondCaseId, suite.secondCaseName, startedAt, finishedAt, 1);

  return runId;
}

function seedRunningWebRun(
  db: ReturnType<typeof initDatabase>,
  suite: ReturnType<typeof seedWebSuite>,
): string {
  const runId = 'run-running-web-1';
  const startedAt = '2026-04-22T10:05:00.000Z';

  db.prepare(
    `INSERT INTO test_runs (
      id, test_case_id, test_case_name, suite_id, suite_name, platform, status, queued_at, dispatched_at, started_at
    ) VALUES (?, ?, ?, ?, ?, 'web', 'running', ?, ?, ?)`,
  ).run(
    runId,
    suite.testCaseId,
    suite.testCaseName,
    suite.suiteId,
    suite.suiteName,
    startedAt,
    startedAt,
    startedAt,
  );

  db.prepare(
    `INSERT INTO test_run_items (
      id, test_run_id, test_case_id, test_case_name, platform, status, started_at, sort_order
    ) VALUES (?, ?, ?, ?, 'web', 'running', ?, 0)`,
  ).run(
    'item-running-web-1',
    runId,
    suite.testCaseId,
    suite.testCaseName,
    startedAt,
  );

  return runId;
}

function seedInterruptedRun(
  db: ReturnType<typeof initDatabase>,
  suite: ReturnType<typeof seedWebSuite>,
): string {
  const runId = 'run-interrupted-web-1';

  db.prepare(
    `INSERT INTO test_runs (
      id, test_case_id, test_case_name, suite_id, suite_name, platform, status, queued_at, dispatched_at, started_at
    ) VALUES (?, ?, ?, ?, ?, 'web', 'running', ?, ?, ?)`,
  ).run(
    runId,
    suite.testCaseId,
    suite.testCaseName,
    suite.suiteId,
    suite.suiteName,
    '2026-04-22T10:10:00.000Z',
    '2026-04-22T10:11:00.000Z',
    '2026-04-22T10:11:00.000Z',
  );

  db.prepare(
    `INSERT INTO test_run_items (
      id, test_run_id, test_case_id, test_case_name, platform, status, started_at, sort_order
    ) VALUES (?, ?, ?, ?, 'web', ?, ?, ?)`,
  ).run(
    'item-interrupted-web-1',
    runId,
    suite.testCaseId,
    suite.testCaseName,
    'running',
    '2026-04-22T10:11:00.000Z',
    0,
  );

  db.prepare(
    `INSERT INTO test_run_items (
      id, test_run_id, test_case_id, test_case_name, platform, status, started_at, sort_order
    ) VALUES (?, ?, ?, ?, 'web', ?, ?, ?)`,
  ).run(
    'item-interrupted-web-2',
    runId,
    suite.testCaseId,
    `${suite.testCaseName}-待执行`,
    'pending',
    '2026-04-22T10:11:00.000Z',
    1,
  );

  return runId;
}

async function injectJsonRequest<TBody = unknown>(
  app: ReturnType<typeof createApp>,
  input: {
    method: string;
    url: string;
    json?: unknown;
  },
): Promise<InjectedResponse<TBody>> {
  const payload = input.json === undefined ? undefined : JSON.stringify(input.json);
  const socket = new MockSocket();
  const req = new IncomingMessage(socket);
  req.method = input.method;
  req.url = input.url;
  req.headers = payload
    ? {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(payload)),
      }
    : {};
  req.connection = socket;
  req.socket = socket;

  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];

  res.write = ((chunk: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    if (typeof encoding === 'function') {
      callback = encoding;
    }
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    if (callback) {
      callback();
    }
    return true;
  }) as typeof res.write;

  res.end = ((chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
    if (typeof encoding === 'function') {
      callback = encoding;
    }
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    res.finished = true;
    if (callback) {
      callback();
    }
    process.nextTick(() => res.emit('finish'));
    return res;
  }) as typeof res.end;

  const responsePromise = new Promise<InjectedResponse<TBody>>((resolve, reject) => {
    res.on('finish', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const contentType = res.getHeader('content-type');
      const body =
        typeof contentType === 'string' && contentType.includes('application/json') && text.length > 0
          ? JSON.parse(text) as TBody
          : null;

      resolve({
        status: res.statusCode,
        body,
        text,
        headers: normalizeHeaders(res.getHeaders()),
      });
    });
    res.on('error', reject);
  });

  app.handle(req, res);

  if (payload) {
    req.push(payload);
  }
  req.push(null);

  const response = await responsePromise;

  return response;
}

function normalizeHeaders(
  headers: ReturnType<ServerResponse['getHeaders']>,
): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (Array.isArray(value)) {
      normalized[key] = value.map((item) => String(item));
    } else if (typeof value === 'number') {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

class MockSocket extends Duplex {
  _read(): void {}

  _write(_chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback();
  }

  override cork(): void {}

  override uncork(): void {}

  destroySoon(): void {
    this.end();
  }
}
