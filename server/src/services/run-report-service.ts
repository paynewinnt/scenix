import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getCanonicalRunDir } from '../config/run-dir.js';
import type { RunStatus } from './run-status.js';

export interface SuiteReportItem {
  testCaseName: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  reportPath?: string;
  errorMessage?: string;
}

export interface SuiteReportInput {
  runId: string;
  suiteName: string;
  platform: 'web' | 'android' | 'ios';
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string | null;
  items: SuiteReportItem[];
}

export function deleteReportFile(reportPath: string): void {
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

export function generateSuiteSummaryReport(reportDir: string, run: SuiteReportInput): string {
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
      --queue: #8a63d2;
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
    .tag.queued { background: var(--queue); }
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
    queued: '排队中',
    running: '运行中',
    pending: '等待中',
    error: '异常',
  }[status];
}

function statusColor(status: RunStatus): string {
  return {
    passed: '#1f8f4d',
    failed: '#d14343',
    queued: '#8a63d2',
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
