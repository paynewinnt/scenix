import type { TestRun } from '../services/api';

export interface ReportEntry {
  key: string;
  label: string;
  reportPath?: string;
  itemId?: string;
  status: TestRun['status'];
  type: 'suite' | 'item';
}

export function buildReportEntries(run: TestRun): ReportEntry[] {
  const entries: ReportEntry[] = [
    {
      key: 'suite',
      label: '套件总报告',
      reportPath: run.reportPath,
      status: run.status,
      type: 'suite',
    },
  ];

  for (const item of run.items) {
    entries.push({
      key: item.id,
      label: item.testCaseName,
      reportPath: item.reportPath,
      itemId: item.id,
      status: item.status,
      type: 'item',
    });
  }

  return entries;
}

export function resolveSelectedReportEntry(
  run: TestRun,
  requestedItemId?: string | null,
): ReportEntry | null {
  const entries = buildReportEntries(run);

  if (requestedItemId) {
    const requestedItem = entries.find((entry) => entry.type === 'item' && entry.itemId === requestedItemId);
    if (requestedItem?.reportPath) {
      return requestedItem;
    }
  }

  if (entries[0]?.reportPath) {
    return entries[0];
  }

  return entries.find((entry) => entry.reportPath) ?? entries[0] ?? null;
}
