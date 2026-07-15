import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export interface ReportFile {
  absolutePath: string;
  name: string;
  mtime: number;
}

export function resolveGeneratedReportPath(reportDir: string, generatedPath?: string): string | null {
  if (!generatedPath) {
    return null;
  }

  const absoluteReportDir = path.resolve(reportDir);
  const absoluteGeneratedPath = path.resolve(generatedPath);
  const relativePath = path.relative(absoluteReportDir, absoluteGeneratedPath);

  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    path.extname(relativePath).toLowerCase() !== '.html' ||
    !existsSync(absoluteGeneratedPath)
  ) {
    return null;
  }

  return `/reports/report/${relativePath.split(path.sep).join('/')}`;
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
