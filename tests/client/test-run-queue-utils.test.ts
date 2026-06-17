import { describe, expect, it } from 'vitest';
import { buildQueueStatusSummary } from '../../client/src/pages/test-run-queue-utils';
import type { TestRun } from '../../client/src/services/api';

describe('test-run-queue-utils', () => {
  it('renders queue position and blocked reason for queued runs', () => {
    const summary = buildQueueStatusSummary(
      buildRun({
        status: 'queued',
        queuePosition: 2,
        blockedReason: 'waiting_device_busy',
      }),
    );

    expect(summary).toBe('同资源第 2 位 · 等待目标设备空闲');
  });

  it('falls back to a default queued message when details are missing', () => {
    const summary = buildQueueStatusSummary(
      buildRun({
        status: 'queued',
        queuePosition: undefined,
        blockedReason: undefined,
      }),
    );

    expect(summary).toBe('等待调度中');
  });

  it('returns a dash for non-queued runs', () => {
    const summary = buildQueueStatusSummary(
      buildRun({
        status: 'running',
        queuePosition: 1,
        blockedReason: 'awaiting_dispatch',
      }),
    );

    expect(summary).toBe('-');
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
