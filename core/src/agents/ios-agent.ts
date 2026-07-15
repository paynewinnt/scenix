/**
 * iOS Agent - Midscene.js iOS SDK integration
 *
 * Uses Midscene with WebDriverAgent (WDA) to control iOS devices
 * and simulators with natural language instructions.
 */

export interface IOSAgentOptions {
  udid?: string;
  wdaUrl?: string;
  wdaHost?: string;
  wdaPort?: number;
  aiActionContext?: string;
  testId?: string;
  generateReport?: boolean;
  reportFileName?: string;
}

export async function createIOSAgent(options: IOSAgentOptions = {}) {
  const aiActionContext =
    options.aiActionContext ??
    'If any permission dialog appears, tap Allow. If a system alert appears, dismiss it.';
  const wdaTarget = parseWdaTarget(options);

  let iosModule: typeof import('@midscene/ios') | null = null;
  try {
    iosModule = await import('@midscene/ios');
  } catch {
    // Older Midscene installations expose only the generic WDA agent.
  }

  if (iosModule) {
    const { IOSAgent, IOSDevice } = iosModule;
    const device = new IOSDevice(wdaTarget);
    const agent = new IOSAgent(device, {
      aiActionContext,
      testId: options.testId,
      generateReport: options.generateReport,
      reportFileName: options.reportFileName,
    });

    return {
      agent,

      async aiAction(instruction: string): Promise<void> {
        await agent.aiAction(instruction);
      },

      async aiAssert(assertion: string): Promise<void> {
        await agent.aiAssert(assertion);
      },

      async aiQuery<T>(dataShape: string, instruction: string): Promise<T> {
        return agent.aiQuery(dataShape, { prompt: instruction });
      },

      async destroy(): Promise<string | undefined> {
        await agent.destroy();
        return agent.reportFile ?? undefined;
      },
    };
  }

  // Fallback for older Midscene setups already using WDA directly.
  // @ts-expect-error -- older @midscene/core releases expose this class without declarations
  const { AgentOverWebDriverProtocol } = await import('@midscene/core');
  const wdaUrl = `${wdaTarget.wdaProtocol ?? 'http:'}//${wdaTarget.wdaHost ?? 'localhost'}:${wdaTarget.wdaPort ?? 8100}`;
  const agent = new AgentOverWebDriverProtocol(wdaUrl, {
    aiActionContext,
    testId: options.testId,
    generateReport: options.generateReport,
    reportFileName: options.reportFileName,
  });

  return {
    agent,

    async aiAction(instruction: string): Promise<void> {
      await agent.aiAction(instruction);
    },

    async aiAssert(assertion: string): Promise<void> {
      await agent.aiAssert(assertion);
    },

    async aiQuery<T>(dataShape: string, instruction: string): Promise<T> {
      return agent.aiQuery(dataShape, { prompt: instruction });
    },

    async destroy(): Promise<string | undefined> {
      await agent.destroy();
      return agent.reportFile ?? undefined;
    },
  };
}

function parseWdaTarget(options: IOSAgentOptions): {
  wdaProtocol?: string;
  wdaHost?: string;
  wdaPort?: number;
} {
  if (options.wdaHost || options.wdaPort) {
    return {
      wdaProtocol: 'http:',
      wdaHost: options.wdaHost ?? 'localhost',
      wdaPort: options.wdaPort ?? 8100,
    };
  }

  const url = new URL(options.wdaUrl ?? 'http://localhost:8100');
  const port = Number(url.port || '8100');

  return {
    wdaProtocol: url.protocol,
    wdaHost: url.hostname,
    wdaPort: Number.isFinite(port) ? port : 8100,
  };
}
