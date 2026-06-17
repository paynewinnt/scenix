import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

export interface ReportFile {
  absolutePath: string;
  name: string;
  mtime: number;
}

export type ReportSnapshot = Set<string>;

export function createReportSnapshot(reportDir: string): ReportSnapshot {
  return new Set(listReportFiles(reportDir).map((file) => file.absolutePath));
}

export async function waitForNewReportFile(
  reportDir: string,
  snapshot: ReportSnapshot,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<ReportFile | null> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const reportFile = findNewReportFile(reportDir, snapshot);
    if (reportFile) {
      return reportFile;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return findNewReportFile(reportDir, snapshot);
}

export function findNewReportFile(reportDir: string, snapshot: ReportSnapshot): ReportFile | null {
  const candidates = listReportFiles(reportDir)
    .filter((file) => !snapshot.has(file.absolutePath))
    .sort((a, b) => b.mtime - a.mtime);

  return candidates[0] ?? null;
}

export function bindReportFile(reportDir: string, reportFile: ReportFile, targetFileName: string): string {
  const targetAbsolutePath = path.join(reportDir, targetFileName);

  if (reportFile.absolutePath !== targetAbsolutePath) {
    mkdirSync(reportDir, { recursive: true });
    rmSync(targetAbsolutePath, { force: true });

    try {
      renameSync(reportFile.absolutePath, targetAbsolutePath);
    } catch {
      copyFileSync(reportFile.absolutePath, targetAbsolutePath);
      rmSync(reportFile.absolutePath, { force: true });
    }
  }

  return toPublicReportPath(targetFileName);
}

export function inferLegacyReportPath(reportDir: string, startedAt: number, finishedAt?: number): string | null {
  const upperBound = finishedAt ? finishedAt + 120_000 : startedAt + 300_000;
  const candidates = listReportFiles(reportDir)
    .filter((file) => file.mtime >= startedAt && file.mtime <= upperBound)
    .sort((a, b) => b.mtime - a.mtime);

  return candidates[0] ? toPublicReportPath(candidates[0].name) : null;
}

export function listReportFiles(reportDir: string): ReportFile[] {
  if (!existsSync(reportDir)) {
    return [];
  }

  return readdirSync(reportDir)
    .filter((name) => name.endsWith('.html'))
    .map((name) => {
      const absolutePath = path.join(reportDir, name);
      return {
        absolutePath,
        name,
        mtime: statSync(absolutePath).mtimeMs,
      };
    });
}

function toPublicReportPath(fileName: string): string {
  return `/reports/report/${fileName}`;
}
