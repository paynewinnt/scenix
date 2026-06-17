import type { RunQueueBlockedReason } from './run-coordinator.js';
import type { RunStatus } from './run-status.js';

export type RunPlatform = 'web' | 'android' | 'ios';

export interface TestRunItem {
  id: string;
  testRunId: string;
  testCaseId: string;
  testCaseName: string;
  platform: RunPlatform;
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
  platform: RunPlatform;
  deviceId?: string;
  deviceConfig?: {
    udid?: string;
    wdaHost?: string;
    wdaPort?: number;
  };
  status: RunStatus;
  queuedAt?: string;
  dispatchedAt?: string;
  startedAt: string;
  finishedAt?: string;
  reportPath?: string;
  errorMessage?: string;
  queuePosition?: number;
  blockedReason?: RunQueueBlockedReason;
  items: TestRunItem[];
}

export interface ExecutableRunItem {
  itemId: string;
  testCaseId: string;
  testCaseName: string;
  platform: RunPlatform;
  steps: string;
}

export interface TestSuiteForExecution {
  id: string;
  name: string;
  platform: RunPlatform;
  testCases: Array<{
    id: string;
    name: string;
    platform: RunPlatform;
    steps: string;
  }>;
}
