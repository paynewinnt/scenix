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
import { applyAIConfigDefaultsToEnv } from '../config/ai-config.js';

class StepExecutionError extends Error {
  reportPath?: string;
}

class InfrastructureError extends Error {
  reportPath?: string;
}

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
  reportFileName?: string;
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
      const diagnostics = applyAIConfigDefaultsToEnv();
      if (!diagnostics.ready) {
        throw new InfrastructureError(`AI 配置未就绪：${diagnostics.issues.join('；')}`);
      }

      const steps = this.parseSteps(testCase.steps);
      if (steps.length === 0) {
        throw new InfrastructureError('测试用例没有可执行步骤');
      }

      const reportPath = await this.executeSteps(
        testCase.platform,
        steps,
        testCase.deviceUdid,
        testCase.deviceConfig,
        testCase.id,
        testCase.reportFileName,
      );

      return {
        testCaseId: testCase.id,
        status: 'passed',
        startedAt,
        finishedAt: new Date().toISOString(),
        reportPath,
      };
    } catch (err) {
      return {
        testCaseId: testCase.id,
        status: err instanceof StepExecutionError ? 'failed' : 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        errorMessage: err instanceof Error ? err.message : String(err),
        reportPath: getErrorReportPath(err),
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
    testId?: string,
    reportFileName?: string,
  ): Promise<string | undefined> {
    let agent: TestAgent;

    if (platform === 'web') {
      agent = await createWebAgent({ headless: true, testId, reportFileName });
    } else if (platform === 'android') {
      agent = await createAndroidAgent({ udid: deviceUdid, testId, reportFileName });
    } else {
      agent = await createIOSAgent({
        udid: deviceUdid,
        wdaHost: deviceConfig?.wdaHost,
        wdaPort: deviceConfig?.wdaPort,
        testId,
        reportFileName,
      });
    }

    let executionError: unknown;
    try {
      await this.runAgentSteps(agent, steps);
    } catch (error) {
      executionError = error;
    }

    let reportPath: string | undefined;
    try {
      reportPath = await agent.destroy();
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      const executionMessage = executionError instanceof Error ? `${executionError.message}；` : '';
      throw new InfrastructureError(`${executionMessage}执行资源清理或报告生成失败：${cleanupMessage}`);
    }

    if (executionError) {
      const error = normalizeExecutionError(executionError);
      error.reportPath = reportPath;
      throw error;
    }

    return reportPath;
  }

  private async runAgentSteps(
    agent: TestAgent,
    steps: string[],
  ): Promise<void> {
    for (const step of steps) {
      try {
        const navigationUrl = agent.goto ? resolveWebNavigationUrl(step) : undefined;
        if (navigationUrl) {
          await agent.goto!(navigationUrl);
        } else if (step.toLowerCase().startsWith('断言') || step.toLowerCase().startsWith('assert')) {
          await agent.aiAssert(step);
        } else {
          await agent.aiAction(step);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isInfrastructureFailure(message)) {
          throw new InfrastructureError(`执行环境异常：${message}`);
        }
        throw new StepExecutionError(
          `步骤执行失败，最多已尝试 3 次重规划：${step}${message ? `。失败原因：${message}` : ''}`,
        );
      }
    }
  }
}

interface TestAgent {
  aiAction(instruction: string): Promise<void>;
  aiAssert(assertion: string): Promise<void>;
  goto?(url: string): Promise<void>;
  destroy(): Promise<string | undefined>;
}

function resolveWebNavigationUrl(step: string): string | undefined {
  const explicitUrl = step.match(/https?:\/\/[^\s，。；;]+/i)?.[0].replace(/[\])}）]+$/, '');
  if (explicitUrl) {
    return explicitUrl;
  }

  const normalized = step.replace(/\s+/g, ' ').trim();
  if (
    /^(?:打开|访问)\s*(?:bing|必应)\s*(?:的\s*)?首页$/i.test(normalized)
    || /^(?:open|visit)\s+(?:the\s+)?bing\s+(?:home\s?page|homepage)$/i.test(normalized)
  ) {
    return 'https://www.bing.com/';
  }

  return undefined;
}

function normalizeExecutionError(error: unknown): StepExecutionError | InfrastructureError {
  if (error instanceof StepExecutionError || error instanceof InfrastructureError) {
    return error;
  }
  return new InfrastructureError(error instanceof Error ? error.message : String(error));
}

function getErrorReportPath(error: unknown): string | undefined {
  if (error instanceof StepExecutionError || error instanceof InfrastructureError) {
    return error.reportPath;
  }
  return undefined;
}

function isInfrastructureFailure(message: string): boolean {
  return [
    /api[ _-]?key/i,
    /midscene_model/i,
    /codex(?: app-server|-cli)?/i,
    /\b(?:401|403|429)\b/,
    /rate limit/i,
    /fetch failed/i,
    /network error/i,
    /net::ERR_/i,
    /\b(?:ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN)\w*/i,
    /socket hang up/i,
    /no android devices/i,
    /\badb\b/i,
    /webdriveragent|\bwda\b|webdriver/i,
    /device.*(?:offline|disconnected|not found)/i,
    /unable to connect/i,
    /browserType\.launch/i,
    /executable doesn't exist/i,
    /target page, context or browser has been closed/i,
  ].some((pattern) => pattern.test(message));
}
