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
  // @ts-expect-error -- @midscene/web may not have type declarations
  const { PageAgent } = await import('@midscene/web/playwright');

  const browser = await chromium.launch({ headless: options.headless ?? true });
  const context = await browser.newContext();
  const page = await context.newPage();

  if (options.baseUrl) {
    await page.goto(options.baseUrl);
  }

  const agent = new PageAgent(page);

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
