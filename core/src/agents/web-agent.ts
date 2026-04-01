/**
 * Web Agent - Playwright + Midscene.js integration
 *
 * Uses Midscene's @midscene/web package to drive browser automation
 * with natural language instructions.
 */

export interface WebAgentOptions {
  headless?: boolean;
  baseUrl?: string;
}

export async function createWebAgent(options: WebAgentOptions = {}) {
  // Dynamic imports to avoid loading heavy dependencies at startup
  const { chromium } = await import('playwright');
  const { PlaywrightAgent } = await import('@midscene/web/playwright');

  const executablePath = process.env.MIDSCENE_CHROMIUM_EXECUTABLE_PATH;
  const channel = process.env.MIDSCENE_CHROMIUM_CHANNEL;
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    executablePath: executablePath || undefined,
    channel: executablePath ? undefined : channel || undefined,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  if (options.baseUrl) {
    await page.goto(options.baseUrl);
  }

  const agent = new PlaywrightAgent(page);

  return {
    agent,
    page,

    /** Execute an AI action described in natural language */
    async aiAction(instruction: string): Promise<void> {
      await agent.aiAction(instruction);
    },

    /** Assert a condition using AI vision */
    async aiAssert(assertion: string): Promise<void> {
      await agent.aiAssert(assertion);
    },

    /** Query data from the page using AI */
    async aiQuery<T>(dataShape: string, instruction: string): Promise<T> {
      return agent.aiQuery(dataShape, { prompt: instruction });
    },

    /** Navigate to a URL */
    async goto(url: string): Promise<void> {
      await page.goto(url);
    },

    /** Cleanup resources */
    async destroy(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
