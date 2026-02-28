/**
 * Unified Test Runner
 *
 * Parses natural-language test steps and dispatches them
 * to the appropriate platform agent (Web / Android / iOS).
 * Falls back to Appium for unsupported operations.
 */

import { createWebAgent } from '../agents/web-agent.js';
import { createAndroidAgent } from '../agents/android-agent.js';
import { createIOSAgent } from '../agents/ios-agent.js';

export interface TestCaseInput {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  steps: string;
  deviceUdid?: string;
}

export interface TestResult {
  testCaseId: string;
  status: 'passed' | 'failed' | 'error';
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
  reportPath?: string;
}

export class TestRunner {
  async run(testCase: TestCaseInput): Promise<TestResult> {
    const startedAt = new Date().toISOString();

    try {
      const steps = this.parseSteps(testCase.steps);
      await this.executeSteps(testCase.platform, steps, testCase.deviceUdid);

      return {
        testCaseId: testCase.id,
        status: 'passed',
        startedAt,
        finishedAt: new Date().toISOString(),
        reportPath: `midscene_run/report/${testCase.id}.html`,
      };
    } catch (err) {
      return {
        testCaseId: testCase.id,
        status: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private parseSteps(stepsText: string): string[] {
    return stepsText
      .split('\n')
      .map((line) => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean);
  }

  private async executeSteps(
    platform: 'web' | 'android' | 'ios',
    steps: string[],
    deviceUdid?: string,
  ): Promise<void> {
    if (platform === 'web') {
      const agent = await createWebAgent({ headless: true });
      try {
        for (const step of steps) {
          if (step.toLowerCase().startsWith('断言') || step.toLowerCase().startsWith('assert')) {
            await agent.aiAssert(step);
          } else {
            await agent.aiAction(step);
          }
        }
      } finally {
        await agent.destroy();
      }
    } else if (platform === 'android') {
      const agent = await createAndroidAgent({ udid: deviceUdid });
      try {
        for (const step of steps) {
          if (step.toLowerCase().startsWith('断言') || step.toLowerCase().startsWith('assert')) {
            await agent.aiAssert(step);
          } else {
            await agent.aiAction(step);
          }
        }
      } finally {
        await agent.destroy();
      }
    } else if (platform === 'ios') {
      const agent = await createIOSAgent({ udid: deviceUdid });
      try {
        for (const step of steps) {
          if (step.toLowerCase().startsWith('断言') || step.toLowerCase().startsWith('assert')) {
            await agent.aiAssert(step);
          } else {
            await agent.aiAction(step);
          }
        }
      } finally {
        await agent.destroy();
      }
    }
  }
}
