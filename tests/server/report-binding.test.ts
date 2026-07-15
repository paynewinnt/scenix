import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  inferLegacyReportPath,
  resolveGeneratedReportPath,
} from '../../server/src/services/report-binding';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('report-binding', () => {
  it('maps an explicit generated report inside the canonical report directory', () => {
    const reportDir = createTempReportDir();
    const reportPath = path.join(reportDir, 'case-run-1-item-1.html');
    writeFileSync(reportPath, '<html>ok</html>', 'utf8');

    expect(resolveGeneratedReportPath(reportDir, reportPath)).toBe(
      '/reports/report/case-run-1-item-1.html',
    );
  });

  it('rejects missing files and generated paths outside the report directory', () => {
    const reportDir = createTempReportDir();
    const outsidePath = path.join(path.dirname(reportDir), 'outside.html');
    writeFileSync(outsidePath, '<html>outside</html>', 'utf8');

    expect(resolveGeneratedReportPath(reportDir, outsidePath)).toBeNull();
    expect(resolveGeneratedReportPath(reportDir, path.join(reportDir, 'missing.html'))).toBeNull();
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
