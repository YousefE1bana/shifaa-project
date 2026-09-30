import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from 'playwright/test';

import {
  openPatientEncounter,
  openPatientRecords,
} from '../tests/e2e/support/feature-010-accessibility-fixtures.js';

const viewport = { width: 1440, height: 900 };
const sampleCount = 20;
const warmups = 3;

async function installObservers(page: Page) {
  await page.addInitScript(() => {
    (
      window as Window & {
        __f010Lcp?: number;
        __f010InputFrames?: Array<{ value: string; ms: number }>;
      }
    ).__f010Lcp = 0;
    (
      window as Window & { __f010InputFrames?: Array<{ value: string; ms: number }> }
    ).__f010InputFrames = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (window as Window & { __f010Lcp?: number }).__f010Lcp = entry.startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    document.addEventListener(
      'input',
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
        const eventTime = event.timeStamp;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            (
              window as Window & { __f010InputFrames?: Array<{ value: string; ms: number }> }
            ).__f010InputFrames?.push({
              value: target.value,
              ms: performance.now() - eventTime,
            });
          }),
        );
      },
      true,
    );
  });
}

test('patient routes: cold LCP and real message input-to-render', async ({
  browser,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error('C28 browser measurement requires the configured local base URL.');
  const recordsLcp: number[] = [];
  const encounterLcp: number[] = [];
  const inputToRender: number[] = [];
  const encounterId = 'a1000000-0000-4000-8000-000000000010';

  for (let index = 0; index < warmups + sampleCount; index += 1) {
    const recordsContext = await browser.newContext({
      baseURL,
      locale: 'en-EG',
      viewport,
      reducedMotion: 'reduce',
    });
    try {
      const page = await recordsContext.newPage();
      await installObservers(page);
      await openPatientRecords(page, 'en-EG', viewport);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const lcp = await page.evaluate(
        () => (window as Window & { __f010Lcp?: number }).__f010Lcp ?? 0,
      );
      expect(Number.isFinite(lcp) && lcp > 0).toBe(true);
      if (index >= warmups) recordsLcp.push(lcp);
    } finally {
      await recordsContext.close();
    }

    const encounterContext = await browser.newContext({
      baseURL,
      locale: 'en-EG',
      viewport,
      reducedMotion: 'reduce',
    });
    try {
      const page = await encounterContext.newPage();
      await installObservers(page);
      await openPatientEncounter(page, 'en-EG', viewport);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const lcp = await page.evaluate(
        () => (window as Window & { __f010Lcp?: number }).__f010Lcp ?? 0,
      );
      expect(Number.isFinite(lcp) && lcp > 0).toBe(true);
      const textbox = page.getByRole('textbox', { name: 'Write a message' });
      await expect(textbox).toBeVisible();
      const before = await textbox.inputValue();
      await textbox.pressSequentially('x');
      await expect.poll(() => textbox.inputValue()).toBe(`${before}x`);
      await page.waitForFunction(
        (expected) =>
          (
            (window as Window & { __f010InputFrames?: Array<{ value: string; ms: number }> })
              .__f010InputFrames ?? []
          ).some((entry) => entry.value === expected),
        `${before}x`,
      );
      const frame = await page.evaluate(
        (expected) =>
          (
            window as Window & { __f010InputFrames?: Array<{ value: string; ms: number }> }
          ).__f010InputFrames?.findLast((entry) => entry.value === expected)?.ms ?? 0,
        `${before}x`,
      );
      expect(Number.isFinite(frame) && frame >= 0).toBe(true);
      if (index >= warmups) {
        encounterLcp.push(lcp);
        inputToRender.push(frame);
      }
    } finally {
      await encounterContext.close();
    }
  }

  expect(recordsLcp).toHaveLength(sampleCount);
  expect(encounterLcp).toHaveLength(sampleCount);
  expect(inputToRender).toHaveLength(sampleCount);
  const output =
    process.env.SHIFAA_PERF_BROWSER_OUTPUT ?? testInfo.outputPath('browser-performance.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        browser: 'desktop-chromium-loopback-fixture-rest',
        browser_version: browser.version(),
        viewport,
        locale: 'en-EG',
        reduced_motion: 'reduce',
        server: 'Expo web development server, warm during sampling',
        navigation_cache: 'fresh browser context and empty cache per navigation',
        throttling: 'none',
        sample_count: sampleCount,
        warmups_excluded: warmups,
        navigation:
          'cold BrowserContext per route; Expo server warm; REST responses from approved synthetic fixture helper',
        base_url: baseURL,
        measurements_ms: {
          records_lcp: recordsLcp,
          encounter_lcp: encounterLcp,
          message_input_to_render: inputToRender,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  expect(baseURL).toContain('127.0.0.1');
});
