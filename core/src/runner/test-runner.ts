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

class StepExecutionError extends Error {}

export interface TestCaseInput {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  steps: string;
  deviceUdid?: string;
  deviceConfig?: {
    udid?: string;
    wdaHost?: string;
    wdaPort?: number;
  };
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
      await this.executeSteps(testCase.platform, steps, testCase.deviceUdid, testCase.deviceConfig);

      return {
        testCaseId: testCase.id,
        status: 'passed',
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        testCaseId: testCase.id,
        status: err instanceof StepExecutionError ? 'failed' : 'error',
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
    deviceConfig?: TestCaseInput['deviceConfig'],
  ): Promise<void> {
    if (platform === 'web') {
      const agent = await createWebAgent({ headless: true });
      try {
        await this.runAgentSteps(agent, steps);
      } finally {
        await agent.destroy();
      }
    } else if (platform === 'android') {
      const agent = await createAndroidAgent({ udid: deviceUdid });
      try {
        await this.runAgentSteps(agent, steps);
      } finally {
        await agent.destroy();
      }
    } else if (platform === 'ios') {
      const agent = await createIOSAgent({
        udid: deviceUdid,
        wdaHost: deviceConfig?.wdaHost,
        wdaPort: deviceConfig?.wdaPort,
      });
      try {
        await this.runAgentSteps(agent, steps);
      } finally {
        await agent.destroy();
      }
    }
  }

  private async runAgentSteps(
    agent: {
      aiAction(instruction: string): Promise<void>;
      aiAssert(assertion: string): Promise<void>;
    },
    steps: string[],
  ): Promise<void> {
    for (const step of steps) {
      try {
        if (step.toLowerCase().startsWith('断言') || step.toLowerCase().startsWith('assert')) {
          await agent.aiAssert(step);
        } else {
          await agent.aiAction(step);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new StepExecutionError(
          `步骤执行失败，最多已尝试 3 次重规划：${step}${message ? `。失败原因：${message}` : ''}`,
        );
      }
    }
  }
}
