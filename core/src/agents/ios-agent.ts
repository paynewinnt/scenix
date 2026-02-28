/**
 * iOS Agent - Midscene.js iOS SDK integration
 *
 * Uses Midscene with WebDriverAgent (WDA) to control iOS devices
 * and simulators with natural language instructions.
 */

export interface IOSAgentOptions {
  udid?: string;
  wdaUrl?: string;
  aiActionContext?: string;
}

export async function createIOSAgent(options: IOSAgentOptions = {}) {
  // Midscene iOS support uses WebDriverAgent under the hood.
  // The exact import path depends on the Midscene version.
  // @ts-expect-error -- @midscene/core agent types
  const { AgentOverWebDriverProtocol } = await import('@midscene/core');

  const wdaUrl = options.wdaUrl ?? 'http://localhost:8100';

  const agent = new AgentOverWebDriverProtocol(wdaUrl, {
    aiActionContext:
      options.aiActionContext ??
      'If any permission dialog appears, tap Allow. If a system alert appears, dismiss it.',
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

    async destroy(): Promise<void> {
      await agent.destroy();
    },
  };
}
