/**
 * The local fixture provides a deterministic Chromium baseline. When a model
 * is configured, the documented natural-language flow runs against Bing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWebAgent, getAIConfigDiagnostics, TestRunner } from 'core';
import { startSearchFixture } from '../../scripts/web-search-fixture.mjs';

describe('Web Search Example', () => {
  let fixture: Awaited<ReturnType<typeof startSearchFixture>>;

  beforeAll(async () => {
    fixture = await startSearchFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('supports the complete search flow in Chromium', async () => {
    const browserAgent = await createWebAgent({
      headless: true,
      baseUrl: fixture.url,
      generateReport: false,
    });
    try {
      const { page } = browserAgent;
      await page.getByRole('searchbox', { name: '搜索框' }).click();
      await page.getByRole('searchbox', { name: '搜索框' }).fill('Midscene.js');
      await page.getByRole('button', { name: '搜索' }).click();

      await expect.poll(() => page.locator('[aria-label="搜索结果"] article').count()).toBe(2);
      await expect.poll(() => page.getByRole('status').textContent()).toContain('Midscene.js');
    } finally {
      await browserAgent.destroy();
    }
  });

  describe.skipIf(!getAIConfigDiagnostics().ready)('Midscene natural-language search', () => {
    it('executes the documented five-step test case', async () => {
      const result = await new TestRunner().run({
        id: 'example-bing-search',
        name: 'Bing 搜索 Midscene.js',
        platform: 'web',
        reportFileName: 'example-bing-search',
        steps: [
          '1. 打开 Bing 首页',
          '2. 点击搜索框',
          '3. 输入 Midscene.js',
          '4. 点击搜索按钮，并等待进入 Midscene.js 搜索结果页',
          '5. 断言搜索关键词为 Midscene.js，且至少显示一条相关结果',
        ].join('\n'),
      });

      expect(result.status, result.errorMessage).toBe('passed');
      expect(result.reportPath).toContain('example-bing-search.html');
    }, 180_000);
  });
});
