import { describe, expect, it } from 'vitest';
import {
  buildReportEntries,
  resolveSelectedReportEntry,
} from '../../client/src/pages/report-detail-utils';
import type { TestRun } from '../../client/src/services/api';

describe('report-detail-utils', () => {
  it('prefers the suite summary report by default', () => {
    const run = buildRun({
      reportPath: '/reports/report/suite-run-1.html',
      items: [
        buildItem({
          id: 'item-1',
          reportPath: '/reports/report/case-run-1-item-1.html',
        }),
      ],
    });

    const selected = resolveSelectedReportEntry(run);
    expect(selected?.type).toBe('suite');
    expect(selected?.reportPath).toBe('/reports/report/suite-run-1.html');
  });

  it('falls back to the requested item report when it exists', () => {
    const run = buildRun({
      reportPath: '/reports/report/suite-run-1.html',
      items: [
        buildItem({
          id: 'item-1',
          reportPath: '/reports/report/case-run-1-item-1.html',
        }),
        buildItem({
          id: 'item-2',
          reportPath: '/reports/report/case-run-1-item-2.html',
        }),
      ],
    });

    const selected = resolveSelectedReportEntry(run, 'item-2');
    expect(selected?.type).toBe('item');
    expect(selected?.itemId).toBe('item-2');
  });

  it('falls back to the first available child report when the suite report is missing', () => {
    const run = buildRun({
      reportPath: undefined,
      items: [
        buildItem({
          id: 'item-1',
        }),
        buildItem({
          id: 'item-2',
          reportPath: '/reports/report/case-run-1-item-2.html',
        }),
      ],
    });

    const selected = resolveSelectedReportEntry(run, 'missing-item');
    expect(selected?.type).toBe('item');
    expect(selected?.itemId).toBe('item-2');
  });

  it('always includes the suite entry before child entries', () => {
    const entries = buildReportEntries(
      buildRun({
        items: [buildItem({ id: 'item-1' }), buildItem({ id: 'item-2' })],
      }),
    );

    expect(entries.map((entry) => entry.key)).toEqual(['suite', 'item-1', 'item-2']);
  });
});

function buildRun(partial: Partial<TestRun>): TestRun {
  return {
    id: 'run-1',
    suiteId: 'suite-1',
    suiteName: '回归套件',
    testCaseId: 'case-1',
    testCaseName: '登录用例',
    platform: 'web',
    status: 'passed',
    startedAt: '2026-04-22T10:00:00.000Z',
    finishedAt: '2026-04-22T10:10:00.000Z',
    items: [],
    ...partial,
  };
}

function buildItem(partial: Partial<TestRun['items'][number]>): TestRun['items'][number] {
  return {
    id: 'item-1',
    testRunId: 'run-1',
    testCaseId: 'case-1',
    testCaseName: '登录用例',
    platform: 'web',
    status: 'passed',
    startedAt: '2026-04-22T10:00:00.000Z',
    finishedAt: '2026-04-22T10:10:00.000Z',
    sortOrder: 0,
    ...partial,
  };
}
