/**
 * Appium Agent - Traditional WebDriver-based fallback
 *
 * Used for scenarios where AI-based automation is insufficient:
 * - Multi-tab/window switching
 * - Complex gestures (multi-finger, precise drag)
 * - Deep native element inspection
 *
 * Integrates with Appium 2.x via WebDriverIO.
 */

export interface AppiumAgentOptions {
  platform: 'android' | 'ios';
  capabilities: Record<string, unknown>;
  appiumHost?: string;
  appiumPort?: number;
}

export async function createAppiumAgent(options: AppiumAgentOptions) {
  const { remote } = await import('webdriverio');

  const host = options.appiumHost ?? process.env.APPIUM_HOST ?? '127.0.0.1';
  const port = options.appiumPort ?? Number(process.env.APPIUM_PORT ?? 4723);

  const defaultCaps =
    options.platform === 'android'
      ? {
          platformName: 'Android',
          'appium:automationName': 'UiAutomator2',
        }
      : {
          platformName: 'iOS',
          'appium:automationName': 'XCUITest',
        };

  const driver = await remote({
    hostname: host,
    port,
    capabilities: { ...defaultCaps, ...options.capabilities },
  });

  return {
    driver,

    /** Find element by accessibility id */
    async findByAccessibilityId(id: string) {
      return driver.$(`~${id}`);
    },

    /** Find element by XPath */
    async findByXPath(xpath: string) {
      return driver.$(xpath);
    },

    /** Tap on element found by text */
    async tapByText(text: string) {
      const el = await driver.$(`//*[contains(@text,"${text}") or contains(@label,"${text}")]`);
      await el.click();
    },

    /** Type text into element */
    async typeInto(selector: string, text: string) {
      const el = await driver.$(selector);
      await el.setValue(text);
    },

    /** Take a screenshot */
    async screenshot(): Promise<string> {
      return driver.takeScreenshot();
    },

    /** Cleanup */
    async destroy(): Promise<void> {
      await driver.deleteSession();
    },
  };
}
