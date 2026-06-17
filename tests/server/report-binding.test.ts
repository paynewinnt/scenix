import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bindReportFile,
  createReportSnapshot,
  inferLegacyReportPath,
  waitForNewReportFile,
} from '../../server/src/services/report-binding';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('report-binding', () => {
  it('waits for a new report file after a snapshot', async () => {
    const reportDir = createTempReportDir();
    const snapshot = createReportSnapshot(reportDir);
    const reportPath = path.join(reportDir, 'midscene-run.html');

    setTimeout(() => {
      writeFileSync(reportPath, '<html>ok</html>', 'utf8');
    }, 10);

    const reportFile = await waitForNewReportFile(reportDir, snapshot, {
      timeoutMs: 1_000,
      pollIntervalMs: 10,
    });

    expect(reportFile?.name).toBe('midscene-run.html');
  });

  it('binds a discovered report to a deterministic file name', () => {
    const reportDir = createTempReportDir();
    const sourcePath = path.join(reportDir, 'random-report.html');
    writeFileSync(sourcePath, '<html>bound</html>', 'utf8');

    const publicPath = bindReportFile(
      reportDir,
      {
        absolutePath: sourcePath,
        name: 'random-report.html',
        mtime: Date.now(),
      },
      'case-run-1-item-1.html',
    );

    expect(publicPath).toBe('/reports/report/case-run-1-item-1.html');
    expect(existsSync(path.join(reportDir, 'case-run-1-item-1.html'))).toBe(true);
    expect(existsSync(sourcePath)).toBe(false);
  });

  it('infers the latest legacy report inside the execution window', () => {
    const reportDir = createTempReportDir();
    const startedAt = Date.now();

    const firstPath = path.join(reportDir, 'older.html');
    writeFileSync(firstPath, '<html>older</html>', 'utf8');
    utimesSync(firstPath, new Date(startedAt - 500), new Date(startedAt - 500));

    const secondPath = path.join(reportDir, 'newer.html');
    writeFileSync(secondPath, '<html>newer</html>', 'utf8');
    utimesSync(secondPath, new Date(startedAt + 500), new Date(startedAt + 500));

    const publicPath = inferLegacyReportPath(reportDir, startedAt - 1_000, Date.now() + 1_000);
    expect(publicPath).toBe('/reports/report/newer.html');
  });
});

function createTempReportDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'scenix-report-binding-'));
  const reportDir = path.join(dir, 'report');
  mkdirSync(reportDir, { recursive: true });
  tempDirs.push(dir);
  return reportDir;
}
