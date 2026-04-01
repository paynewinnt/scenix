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
}

export async function createIOSAgent(options: IOSAgentOptions = {}) {
  const aiActionContext =
    options.aiActionContext ??
    'If any permission dialog appears, tap Allow. If a system alert appears, dismiss it.';
  const wdaTarget = parseWdaTarget(options);

  try {
    // Midscene v1 iOS API uses IOSDevice + IOSAgent.
    const { IOSAgent, IOSDevice } = await import('@midscene/ios');
    const device = new IOSDevice(wdaTarget);
    const agent = new IOSAgent(device, { aiActionContext });

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

      async destroy(): Promise<void> {
        await agent.destroy();
      },
    };
  } catch {
    // Fallback for older Midscene setups already using WDA directly.
    // @ts-expect-error -- @midscene/core may not have type declarations
    const { AgentOverWebDriverProtocol } = await import('@midscene/core');
    const wdaUrl = `${wdaTarget.wdaProtocol ?? 'http:'}//${wdaTarget.wdaHost ?? 'localhost'}:${wdaTarget.wdaPort ?? 8100}`;
    const agent = new AgentOverWebDriverProtocol(wdaUrl, { aiActionContext });

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

      async destroy(): Promise<void> {
        await agent.destroy();
      },
    };
  }
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
