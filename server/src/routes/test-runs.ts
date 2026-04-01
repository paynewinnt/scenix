import { Router } from 'express';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, toCamelCase } from '../db/index.js';
import { getCanonicalRunDir } from '../config/run-dir.js';
import { broadcast } from '../sse/event-bus.js';
import { TestRunner, type TestCaseInput } from 'core';
import { getDeviceById } from '../services/device-service.js';

type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';

interface TestRunItem {
  id: string;
  testRunId: string;
  testCaseId: string;
  testCaseName: string;
  platform: 'web' | 'android' | 'ios';
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  reportPath?: string;
  errorMessage?: string;
  sortOrder: number;
}

export interface TestRun {
  id: string;
  suiteId?: string;
  suiteName: string;
  testCaseId?: string;
  testCaseName?: string;
  platform: 'web' | 'android' | 'ios';
  deviceId?: string;
  deviceConfig?: {
    udid?: string;
    wdaHost?: string;
    wdaPort?: number;
  };
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  reportPath?: string;
  errorMessage?: string;
  items: TestRunItem[];
}

const runner = new TestRunner();

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

testRunsRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const run = getRunById(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (run.status === 'pending' || run.status === 'running') {
    return res.status(400).json({ error: 'Cannot delete a test run that is still pending or running' });
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

  db.prepare('DELETE FROM test_run_items WHERE test_run_id = ?').run(req.params.id);
  db.prepare('DELETE FROM test_runs WHERE id = ?').run(req.params.id);

  for (const reportPath of reportPaths) {
    deleteReportFile(reportPath);
  }

  broadcast('test-run:deleted', { id: req.params.id });
  res.status(204).send();
});

testRunsRouter.post('/', async (req, res) => {
  const db = getDb();
  const { suiteId, deviceId } = req.body as { suiteId?: string; deviceId?: string };

  if (!suiteId) {
    return res.status(400).json({ error: 'Missing required field: suiteId' });
  }

  const suite = getSuiteForExecution(suiteId);
  if (!suite) {
    return res.status(404).json({ error: 'Test suite not found' });
  }

  if (suite.testCases.length === 0) {
    return res.status(400).json({ error: '测试套件至少需要包含一个测试用例' });
  }

  let device:
    | {
        id: string;
        udid: string;
        platform: 'android' | 'ios';
        wdaHost?: string;
        wdaPort?: number;
      }
    | undefined;

  if (suite.platform === 'web' && deviceId) {
    return res.status(400).json({ error: 'Web test suites must not specify a device' });
  }

  if (suite.platform !== 'web') {
    if (!deviceId) {
      return res.status(400).json({ error: `Missing required field: deviceId for ${suite.platform} test suite` });
    }

    device = await getDeviceById(String(deviceId));
    if (!device) {
      return res.status(400).json({ error: 'Selected device is not connected or no longer available' });
    }

    if (device.platform !== suite.platform) {
      return res.status(400).json({ error: `Selected device platform ${device.platform} does not match test suite platform ${suite.platform}` });
    }
  }

  const rawUdid = device?.udid;
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();
  const firstCase = suite.testCases[0];

  db.prepare(
    `INSERT INTO test_runs (
      id, test_case_id, test_case_name, suite_id, suite_name, platform, device_id, status, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    runId,
    firstCase.id,
    firstCase.name,
    suite.id,
    suite.name,
    suite.platform,
    deviceId ?? null,
    now,
  );

  const itemInsert = db.prepare(
    `INSERT INTO test_run_items (
      id, test_run_id, test_case_id, test_case_name, platform, status, started_at, sort_order
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  );

  suite.testCases.forEach((testCase, index) => {
    itemInsert.run(
      crypto.randomUUID(),
      runId,
      testCase.id,
      testCase.name,
      testCase.platform,
      now,
      index,
    );
  });

  const createdRun = getRunById(runId);
  if (createdRun) {
    broadcast('test-run:created', createdRun);
    res.status(201).json(createdRun);
  } else {
    res.status(201).json({ id: runId });
  }

  executeSuiteRun(
    runId,
    suite,
    {
      deviceId,
      deviceUdid: rawUdid,
      deviceConfig:
        suite.platform === 'ios'
          ? {
              udid: rawUdid,
              wdaHost: device?.wdaHost,
              wdaPort: device?.wdaPort,
            }
          : undefined,
    },
  ).catch((err) => {
    console.error(`[TestRun ${runId}] Unhandled error:`, err);
  });
});

async function executeSuiteRun(
  runId: string,
  suite: {
    id: string;
    name: string;
    platform: 'web' | 'android' | 'ios';
    testCases: Array<{
      id: string;
      name: string;
      platform: 'web' | 'android' | 'ios';
      steps: string;
    }>;
  },
  device: {
    deviceId?: string;
    deviceUdid?: string;
    deviceConfig?: TestCaseInput['deviceConfig'];
  },
): Promise<void> {
  const db = getDb();

  db.prepare('UPDATE test_runs SET status = ? WHERE id = ?').run('running', runId);
  broadcastRunUpdate(runId);

  let suiteStatus: RunStatus = 'passed';
  let suiteErrorMessage: string | null = null;
  let suiteFinishedAt = new Date().toISOString();

  for (const testCase of suite.testCases) {
    const runItem = db
      .prepare('SELECT * FROM test_run_items WHERE test_run_id = ? AND test_case_id = ?')
      .get(runId, testCase.id) as Record<string, unknown> | undefined;

    if (!runItem) {
      continue;
    }

    const itemId = String(runItem.id);
    const itemStart = new Date().toISOString();
    db.prepare('UPDATE test_run_items SET status = ?, started_at = ? WHERE id = ?').run('running', itemStart, itemId);
    broadcastRunUpdate(runId);

    const beforeExec = Date.now();

    try {
      const result = await runner.run({
        id: testCase.id,
        name: testCase.name,
        platform: testCase.platform,
        steps: testCase.steps,
        deviceUdid: device.deviceUdid,
        deviceConfig: device.deviceConfig,
      });

      const reportPath = await waitForLatestReport(beforeExec, result.finishedAt);

      db.prepare(
        `UPDATE test_run_items
         SET status = ?, finished_at = ?, report_path = ?, error_message = ?
         WHERE id = ?`,
      ).run(result.status, result.finishedAt, reportPath, result.errorMessage ?? null, itemId);

      if (result.status !== 'passed') {
        suiteStatus = result.status;
        if (!suiteErrorMessage) {
          suiteErrorMessage = result.errorMessage ?? `${testCase.name} 执行失败`;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const finishedAt = new Date().toISOString();
      const reportPath = await waitForLatestReport(beforeExec, finishedAt);

      db.prepare(
        `UPDATE test_run_items
         SET status = 'error', finished_at = ?, report_path = ?, error_message = ?
         WHERE id = ?`,
      ).run(finishedAt, reportPath, errorMessage, itemId);

      suiteStatus = 'error';
      if (!suiteErrorMessage) {
        suiteErrorMessage = errorMessage;
      }
    }

    suiteFinishedAt = new Date().toISOString();
    broadcastRunUpdate(runId);
  }

  const items = getRunItems(runId);
  const aggregateReportPath =
    items.length > 1
      ? generateSuiteSummaryReport({
          runId,
          suiteName: suite.name,
          platform: suite.platform,
          status: suiteStatus,
          startedAt: items[0]?.startedAt ?? suiteFinishedAt,
          finishedAt: suiteFinishedAt,
          errorMessage: aggregateErrorMessageFromItems(items, suiteErrorMessage),
          items,
        })
      : items[0]?.reportPath ?? null;
  const aggregateErrorMessage =
    aggregateErrorMessageFromItems(items, suiteErrorMessage);

  db.prepare(
    `UPDATE test_runs
     SET status = ?, finished_at = ?, report_path = ?, error_message = ?
     WHERE id = ?`,
  ).run(suiteStatus, suiteFinishedAt, aggregateReportPath, aggregateErrorMessage, runId);

  broadcastRunUpdate(runId);
}

function listRuns(): TestRun[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM test_runs ORDER BY started_at DESC').all() as Record<string, unknown>[];
  return rows.map((row) => assembleRun(row));
}

function getRunById(id: string): TestRun | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? assembleRun(row) : null;
}

function assembleRun(row: Record<string, unknown>): TestRun {
  const runId = String(row.id);
  const items = getRunItems(runId);
  const normalizedItems = items.length > 0 ? items : [buildLegacyItem(row)];
  const persistedReportPath = normalizeReportPath(
    row.report_path as string | null | undefined,
    row,
    normalizedItems,
  );
  const effectiveReportPath =
    normalizedItems.length > 1
      ? persistedReportPath ??
        ensurePersistedSuiteSummaryReport({
          runId,
          suiteName: String(row.suite_name ?? row.test_case_name),
          platform: row.platform as 'web' | 'android' | 'ios',
          status: row.status as RunStatus,
          startedAt: String(row.started_at),
          finishedAt: row.finished_at ? String(row.finished_at) : undefined,
          errorMessage: row.error_message ? String(row.error_message) : undefined,
          items: normalizedItems,
        })
      : persistedReportPath ?? normalizedItems[0]?.reportPath;

  return {
    id: runId,
    suiteId: row.suite_id ? String(row.suite_id) : undefined,
    suiteName: String(row.suite_name ?? row.test_case_name),
    testCaseId: row.test_case_id ? String(row.test_case_id) : undefined,
    testCaseName: row.test_case_name ? String(row.test_case_name) : undefined,
    platform: row.platform as 'web' | 'android' | 'ios',
    deviceId: row.device_id ? String(row.device_id) : undefined,
    status: row.status as RunStatus,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    reportPath: effectiveReportPath ?? undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    items: normalizedItems,
  };
}

function aggregateErrorMessageFromItems(
  items: TestRunItem[],
  suiteErrorMessage: string | null,
): string | null {
  return suiteErrorMessage ?? items.find((item) => item.errorMessage)?.errorMessage ?? null;
}

function getRunItems(runId: string): TestRunItem[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM test_run_items WHERE test_run_id = ? ORDER BY sort_order ASC, started_at ASC')
    .all(runId) as Record<string, unknown>[];

  return rows.map((row) => {
    const normalizedReportPath = normalizeReportPath(
      row.report_path as string | null | undefined,
      row,
      [],
    );

    return {
      id: String(row.id),
      testRunId: String(row.test_run_id),
      testCaseId: String(row.test_case_id),
      testCaseName: String(row.test_case_name),
      platform: row.platform as 'web' | 'android' | 'ios',
      status: row.status as RunStatus,
      startedAt: String(row.started_at),
      finishedAt: row.finished_at ? String(row.finished_at) : undefined,
      reportPath: normalizedReportPath ?? undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      sortOrder: Number(row.sort_order ?? 0),
    };
  });
}

function buildLegacyItem(row: Record<string, unknown>): TestRunItem {
  return {
    id: `legacy-${String(row.id)}`,
    testRunId: String(row.id),
    testCaseId: String(row.test_case_id),
    testCaseName: String(row.test_case_name),
    platform: row.platform as 'web' | 'android' | 'ios',
    status: row.status as RunStatus,
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    reportPath: normalizeReportPath(row.report_path as string | null | undefined, row, []) ?? undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    sortOrder: 0,
  };
}

function broadcastRunUpdate(runId: string): void {
  const run = getRunById(runId);
  if (run) {
    broadcast('test-run:updated', run);
  }
}

function getSuiteForExecution(suiteId: string): {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  testCases: Array<{
    id: string;
    name: string;
    platform: 'web' | 'android' | 'ios';
    steps: string;
  }>;
} | null {
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
    .all(suiteId) as Record<string, unknown>[];

  if (rows.length === 0) {
    return null;
  }

  return {
    id: String(rows[0].id),
    name: String(rows[0].name),
    platform: rows[0].platform as 'web' | 'android' | 'ios',
    testCases: rows
      .filter((row) => row.case_id)
      .map((row) => ({
        id: String(row.case_id),
        name: String(row.case_name),
        platform: row.case_platform as 'web' | 'android' | 'ios',
        steps: String(row.case_steps),
      })),
  };
}

async function waitForLatestReport(afterTimestamp: number, finishedAt?: string): Promise<string | null> {
  const deadline = Date.now() + 3_000;

  while (Date.now() <= deadline) {
    const reportPath = findLatestReport(afterTimestamp, finishedAt);
    if (reportPath) {
      return reportPath;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return findLatestReport(afterTimestamp, finishedAt);
}

function findLatestReport(afterTimestamp: number, finishedAt?: string): string | null {
  const upperBound = finishedAt ? new Date(finishedAt).getTime() + 120_000 : Number.POSITIVE_INFINITY;
  const candidates = listReportFiles()
    .filter((file) => file.mtime >= afterTimestamp && file.mtime <= upperBound)
    .sort((a, b) => b.mtime - a.mtime);

  if (candidates.length > 0) {
    return `/reports/report/${candidates[0].name}`;
  }

  return null;
}

function normalizeReportPath(
  reportPath: string | null | undefined,
  row: Record<string, unknown>,
  items: Array<{ reportPath?: string }>,
): string | null {
  if (reportPath) {
    return reportPath;
  }

  const inferredFromItems = items.find((item) => item.reportPath)?.reportPath;
  if (inferredFromItems) {
    return inferredFromItems;
  }

  const startedAt = typeof row.started_at === 'string' ? new Date(row.started_at).getTime() : NaN;
  if (Number.isNaN(startedAt)) {
    return null;
  }

  const finishedAt =
    typeof row.finished_at === 'string'
      ? new Date(row.finished_at).getTime() + 120_000
      : startedAt + 300_000;

  const candidates = listReportFiles()
    .filter((file) => file.mtime >= startedAt && file.mtime <= finishedAt)
    .sort((a, b) => b.mtime - a.mtime);

  return candidates.length > 0 ? `/reports/report/${candidates[0].name}` : null;
}

function listReportFiles(): Array<{ name: string; mtime: number; absolutePath: string }> {
  const files: Array<{ name: string; mtime: number; absolutePath: string }> = [];

  for (const reportDir of getReportDirs()) {
    if (!existsSync(reportDir)) {
      continue;
    }

    for (const name of readdirSync(reportDir)) {
      if (!name.endsWith('.html')) {
        continue;
      }

      const absolutePath = path.join(reportDir, name);
      files.push({
        name,
        mtime: statSync(absolutePath).mtimeMs,
        absolutePath,
      });
    }
  }

  return files;
}

function getReportDirs(): string[] {
  return [path.join(getCanonicalRunDir(), 'report')];
}

function deleteReportFile(reportPath: string): void {
  if (!reportPath.startsWith('/reports/')) {
    return;
  }

  const relativePath = reportPath.replace(/^\/reports\//, '');
  try {
    rmSync(path.join(getCanonicalRunDir(), relativePath), { force: true });
  } catch {
    // Ignore cleanup errors.
  }
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
  const reportPath = generateSuiteSummaryReport(run);
  const db = getDb();
  db.prepare('UPDATE test_runs SET report_path = ? WHERE id = ?').run(reportPath, run.runId);
  return reportPath;
}

function generateSuiteSummaryReport(run: {
  runId: string;
  suiteName: string;
  platform: 'web' | 'android' | 'ios';
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string | null;
  items: TestRunItem[];
}): string {
  const reportDir = path.join(getCanonicalRunDir(), 'report');
  mkdirSync(reportDir, { recursive: true });

  const fileName = `suite-${run.runId}.html`;
  const absolutePath = path.join(reportDir, fileName);
  const reportPath = `/reports/report/${fileName}`;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(run.suiteName)} - 套件报告</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --card: #ffffff;
      --line: #d9e2f2;
      --text: #10233d;
      --muted: #5b6b82;
      --pass: #1f8f4d;
      --fail: #d14343;
      --run: #276ef1;
      --pend: #7a8699;
      --error: #d97706;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      font-family: "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
      background: linear-gradient(180deg, #eef4ff 0%, var(--bg) 45%, #edf2f7 100%);
      color: var(--text);
    }
    .wrap { max-width: 1100px; margin: 0 auto; }
    .hero, .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 12px 32px rgba(16, 35, 61, 0.08);
    }
    .hero { padding: 28px; margin-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .meta-item {
      background: #f8fbff;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
    }
    .meta-label { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .meta-value { font-size: 15px; font-weight: 600; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      color: white;
      background: ${statusColor(run.status)};
    }
    .panel { padding: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: 13px; }
    .tag {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 10px;
      color: white;
      font-size: 12px;
      font-weight: 700;
      background: var(--pend);
    }
    .tag.passed { background: var(--pass); }
    .tag.failed { background: var(--fail); }
    .tag.running { background: var(--run); }
    .tag.pending { background: var(--pend); }
    .tag.error { background: var(--error); }
    a { color: #276ef1; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    .error { color: var(--fail); }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="status">${statusLabel(run.status)}</div>
      <h1>${escapeHtml(run.suiteName)}</h1>
      <div>${escapeHtml(run.platform.toUpperCase())} 套件执行总报告</div>
      <div class="meta">
        <div class="meta-item"><div class="meta-label">开始时间</div><div class="meta-value">${escapeHtml(formatChinaDateTime(run.startedAt))}</div></div>
        <div class="meta-item"><div class="meta-label">结束时间</div><div class="meta-value">${escapeHtml(formatChinaDateTime(run.finishedAt))}</div></div>
        <div class="meta-item"><div class="meta-label">用例数量</div><div class="meta-value">${String(run.items.length)}</div></div>
        <div class="meta-item"><div class="meta-label">运行 ID</div><div class="meta-value">${escapeHtml(run.runId)}</div></div>
      </div>
      ${run.errorMessage ? `<p class="error">错误信息：${escapeHtml(run.errorMessage)}</p>` : ''}
    </section>
    <section class="panel">
      <table>
        <thead>
          <tr>
            <th>顺序</th>
            <th>用例名称</th>
            <th>状态</th>
            <th>开始时间</th>
            <th>结束时间</th>
            <th>报告</th>
            <th>错误信息</th>
          </tr>
        </thead>
        <tbody>
          ${run.items
            .map(
              (item, index) => `<tr>
            <td>${String(index + 1)}</td>
            <td>${escapeHtml(item.testCaseName)}</td>
            <td><span class="tag ${escapeHtml(item.status)}">${statusLabel(item.status)}</span></td>
            <td>${escapeHtml(formatChinaDateTime(item.startedAt))}</td>
            <td>${escapeHtml(formatChinaDateTime(item.finishedAt))}</td>
            <td>${item.reportPath ? `<a href="${escapeHtml(item.reportPath)}" target="_blank" rel="noreferrer">查看用例报告</a>` : '-'}</td>
            <td class="error">${escapeHtml(item.errorMessage ?? '-')}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>
  </div>
</body>
</html>`;

  writeFileSync(absolutePath, html, 'utf8');
  return reportPath;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusLabel(status: RunStatus): string {
  return {
    passed: '通过',
    failed: '失败',
    running: '运行中',
    pending: '等待中',
    error: '异常',
  }[status];
}

function statusColor(status: RunStatus): string {
  return {
    passed: '#1f8f4d',
    failed: '#d14343',
    running: '#276ef1',
    pending: '#7a8699',
    error: '#d97706',
  }[status];
}

function formatChinaDateTime(value?: string): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(/\//g, '-');
}
