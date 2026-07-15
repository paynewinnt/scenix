/**
 * Web Agent - Playwright + Midscene.js integration
 *
 * Uses Midscene's @midscene/web package to drive browser automation
 * with natural language instructions.
 */

import type { Page } from 'playwright';

export interface WebAgentOptions {
  headless?: boolean;
  baseUrl?: string;
  testId?: string;
  generateReport?: boolean;
  reportFileName?: string;
  locale?: string;
  timezoneId?: string;
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
  try {
    const context = await browser.newContext({
      locale: resolveBrowserSetting(options.locale, 'MIDSCENE_BROWSER_LOCALE'),
      timezoneId: resolveBrowserSetting(options.timezoneId, 'MIDSCENE_BROWSER_TIMEZONE'),
    });

    try {
      const page = await context.newPage();
      const navigateToUrl = async (url: string): Promise<void> => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('load');

        if (isBingUrl(page.url())) {
          await page.locator('#sb_form_q, input[name="q"]').first().waitFor({
            state: 'visible',
            timeout: 15_000,
          });
        }
      };

      if (options.baseUrl) {
        await navigateToUrl(options.baseUrl);
      }

      const agent = new PlaywrightAgent(page, {
        testId: options.testId,
        generateReport: options.generateReport,
        reportFileName: options.reportFileName,
      });

      return {
        agent,
        page,

        /** Execute an AI action described in natural language */
        async aiAction(instruction: string): Promise<void> {
          const expectedBingQuery = await getExpectedBingQuery(page, instruction);
          const actionInstruction = expectedBingQuery && !hasSearchResultExpectation(instruction)
            ? `${instruction}。完成后确认已进入“${expectedBingQuery}”的搜索结果页；如果仍停留在首页，请继续执行。`
            : instruction;

          await agent.aiAction(actionInstruction);

          if (expectedBingQuery) {
            await verifyBingSearchSubmission(page, expectedBingQuery);
          }
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
          await navigateToUrl(url);
        },

        /** Finalize the report before releasing browser resources. */
        async destroy(): Promise<string | undefined> {
          let firstError: unknown;

          try {
            await agent.destroy();
          } catch (error) {
            firstError = error;
          }

          try {
            await context.close();
          } catch (error) {
            firstError ??= error;
          }

          try {
            await browser.close();
          } catch (error) {
            firstError ??= error;
          }

          if (firstError) {
            throw firstError;
          }

          return agent.reportFile ?? undefined;
        },
      };
    } catch (error) {
      try {
        await context.close();
      } catch (cleanupError) {
        console.error('Failed to close browser context after Web Agent setup error:', cleanupError);
      }
      throw error;
    }
  } catch (error) {
    try {
      await browser.close();
    } catch (cleanupError) {
      console.error('Failed to close browser after Web Agent setup error:', cleanupError);
    }
    throw error;
  }
}

function isBingUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'bing.com' || hostname.endsWith('.bing.com');
  } catch {
    return false;
  }
}

function resolveBrowserSetting(value: string | undefined, envName: string): string | undefined {
  return value?.trim() || process.env[envName]?.trim() || undefined;
}

async function getExpectedBingQuery(page: Page, instruction: string): Promise<string | undefined> {
  if (!isBingUrl(page.url()) || !isSearchSubmitInstruction(instruction)) {
    return undefined;
  }

  const query = await page
    .locator('#sb_form_q, input[name="q"], textarea[name="q"]')
    .first()
    .inputValue()
    .catch(() => '');

  return query.trim() || undefined;
}

function isSearchSubmitInstruction(instruction: string): boolean {
  const hasClickVerb = /点击|点按|轻触|\b(?:click|tap|press)\b/i.test(instruction);
  const hasSearchIntent = /搜索|查找|\bsearch\b/i.test(instruction);
  const hasSubmitControl = /按钮|图标|放大镜|\b(?:button|icon|magnifier)\b/i.test(instruction);
  return hasClickVerb && hasSearchIntent && hasSubmitControl;
}

function hasSearchResultExpectation(instruction: string): boolean {
  return /搜索结果|结果页|\bsearch results?\b|\bresults? page\b/i.test(instruction);
}

async function verifyBingSearchSubmission(page: Page, expectedQuery: string): Promise<void> {
  const normalizedExpectedQuery = expectedQuery.trim().toLocaleLowerCase();

  try {
    await page.waitForURL(
      (url) => {
        const actualQuery = url.searchParams.get('q')?.trim().toLocaleLowerCase();
        return isBingUrl(url.toString())
          && url.pathname.toLowerCase() === '/search'
          && actualQuery === normalizedExpectedQuery;
      },
      { timeout: 10_000 },
    );
    await page.locator('#b_results').waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    const currentUrl = page.url();
    let actualQuery: string | null = null;
    try {
      actualQuery = new URL(currentUrl).searchParams.get('q');
    } catch {
      // Keep the original URL in the diagnostic below.
    }
    throw new Error(
      `Bing 搜索提交未完成：期望关键词“${expectedQuery}”，实际关键词“${actualQuery ?? '无'}”，当前地址 ${currentUrl}`,
    );
  }
}
