import { expect, test } from 'playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  openClinicEncounter,
  openClinicMessages,
  openClinicReferrals,
  openClinicSummary,
  openPatientEncounter,
  openPatientRecords,
  type Feature010Locale,
} from './support/feature-010-accessibility-fixtures';

async function scaleRenderedText(page: import('playwright/test').Page, multiplier: 2 | 4) {
  return page
    .locator(
      'header h1, header h2, header p, header span, header div, header a, header button, header label, header input, header [role="heading"], header [role="button"], nav a, nav button, main h1, main h2, main h3, main p, main span, main div, main a, main button, main label, main time, main bdi, main [role="heading"], main [role="button"], main [role="alert"], main [role="status"], main input, main textarea, main select, footer h1, footer h2, footer p, footer span, footer div, footer a, footer button, footer label, footer input, footer textarea, footer select, footer [role="heading"], footer [role="button"]',
    )
    .evaluateAll((nodes, scale) => {
      const baselines = nodes.flatMap((node) => {
        if (
          !(node instanceof HTMLElement) ||
          node.getClientRects().length === 0 ||
          (node.matches('div') && node.children.length > 0)
        )
          return [];
        const style = getComputedStyle(node);
        const before = Number.parseFloat(node.dataset.shifaaBaseFont ?? style.fontSize);
        const lineHeight = Number.parseFloat(node.dataset.shifaaBaseLineHeight ?? style.lineHeight);
        if (!Number.isFinite(before)) return [];
        node.dataset.shifaaBaseFont = String(before);
        if (Number.isFinite(lineHeight)) node.dataset.shifaaBaseLineHeight = String(lineHeight);
        return [{ node, before, lineHeight }];
      });
      for (const { node, before, lineHeight } of baselines) {
        node.style.setProperty('font-size', `${before * scale}px`, 'important');
        if (Number.isFinite(lineHeight))
          node.style.setProperty('line-height', `${lineHeight * scale}px`, 'important');
      }
      return baselines.flatMap(({ node, before }) => {
        const text =
          node.textContent?.trim() ||
          (node instanceof HTMLInputElement ||
          node instanceof HTMLTextAreaElement ||
          node instanceof HTMLSelectElement
            ? node.value ||
              node.getAttribute('aria-label') ||
              node.getAttribute('placeholder') ||
              ''
            : '');
        if (!text) return [];
        const rect = node.getBoundingClientRect();
        return [
          {
            text,
            before,
            after: Number.parseFloat(getComputedStyle(node).fontSize),
            tag: node.tagName.toLowerCase(),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            left: rect.left,
            right: rect.right,
          },
        ];
      });
    }, multiplier);
}

test('immutable P0 inventory enumerates all six route families and 87 states', async () => {
  const root = process.cwd();
  const inventory = JSON.parse(
    await readFile(
      path.join(
        root,
        'specs/010-encounters-referrals-contextual-chat/visual-baselines/baseline-inventory.json',
      ),
      'utf8',
    ),
  ) as { routes: Array<{ baselineId: string; states: string[] }> };
  const manifest = JSON.parse(
    await readFile(
      path.join(
        root,
        'specs/010-encounters-referrals-contextual-chat/visual-baselines/reference-manifest.json',
      ),
      'utf8',
    ),
  ) as { entryCount: number; entries: unknown[] };
  const expectedInventory = [
    {
      baselineId: 'F010-P0-PAT-RECORDS-001',
      states: [
        'loading',
        'empty',
        'pending',
        'referral-preview',
        'acceptance-review',
        'representative-acceptance-review',
        'submitting',
        'accepted',
        'permission-denied',
        'authority-lost',
        'stale',
        'offline',
        'conflict',
        'error-recoverable',
        'error-terminal',
      ],
    },
    {
      baselineId: 'F010-P0-PAT-ENCOUNTER-001',
      states: [
        'loading',
        'empty',
        'open',
        'patient-visible-note',
        'private-note-excluded',
        'chat-stale',
        'reconnecting',
        'access-ended',
        'completed',
        'permission-denied',
        'offline',
        'conflict',
        'message-success',
        'error-recoverable',
        'error-terminal',
      ],
    },
    {
      baselineId: 'F010-P0-CLN-SUMMARY-001',
      states: [
        'loading',
        'empty',
        'active',
        'start-eligible',
        'start-review',
        'start-stale',
        'private-note',
        'patient-visible-note',
        'permission-denied',
        'stale',
        'offline',
        'error-recoverable',
        'error-terminal',
      ],
    },
    {
      baselineId: 'F010-P0-CLN-ENCOUNTER-001',
      states: [
        'loading',
        'empty',
        'created',
        'open',
        'note-draft-edit',
        'note-sign-review',
        'note-signed',
        'participant-edit',
        'participant-end-review',
        'participant-removed',
        'completion-review',
        'completed',
        'permission-denied',
        'stale',
        'offline',
        'conflict',
        'error-recoverable',
        'error-terminal',
      ],
    },
    {
      baselineId: 'F010-P0-CLN-REFERRALS-001',
      states: [
        'loading',
        'empty',
        'pending',
        'accepted',
        'create-review',
        'create-success',
        'permission-denied',
        'stale',
        'offline',
        'conflict',
        'error-recoverable',
        'error-terminal',
      ],
    },
    {
      baselineId: 'F010-P0-CLN-MESSAGES-001',
      states: [
        'loading',
        'empty',
        'active',
        'send-success',
        'participant-removed',
        'access-ended',
        'chat-unavailable',
        'reconnecting',
        'stale',
        'offline',
        'permission-denied',
        'conflict',
        'error-recoverable',
        'error-terminal',
      ],
    },
  ];
  expect(inventory.routes.map((route) => route.baselineId)).toEqual([
    'F010-P0-PAT-RECORDS-001',
    'F010-P0-PAT-ENCOUNTER-001',
    'F010-P0-CLN-SUMMARY-001',
    'F010-P0-CLN-ENCOUNTER-001',
    'F010-P0-CLN-REFERRALS-001',
    'F010-P0-CLN-MESSAGES-001',
  ]);
  expect(inventory.routes.reduce((total, route) => total + route.states.length, 0)).toBe(87);
  expect(inventory.routes.map(({ baselineId, states }) => ({ baselineId, states }))).toEqual(
    expectedInventory,
  );
  expect(manifest.entryCount).toBe(408);
  expect(manifest.entries).toHaveLength(408);
  // Inventory states without a current authorized route state (including CLN summary
  // private-note and patient-visible-note) remain manifest-only product gaps.
});

const locales = [
  { lang: 'ar-EG', dir: 'rtl', handle: 'وسيلة الدخول' },
  { lang: 'en-EG', dir: 'ltr', handle: 'Sign-in handle' },
] as const;

const existingRouteFamilies: Array<{
  id: string;
  app: 'clinic' | 'patient';
  open: (
    page: import('playwright/test').Page,
    locale: Feature010Locale,
    viewport: { width: number; height: number },
  ) => Promise<void>;
}> = [
  { id: 'patient-records', app: 'patient', open: openPatientRecords },
  { id: 'patient-encounter', app: 'patient', open: openPatientEncounter },
  { id: 'clinic-summary', app: 'clinic', open: openClinicSummary },
  { id: 'clinic-encounter', app: 'clinic', open: openClinicEncounter },
  { id: 'clinic-referrals', app: 'clinic', open: openClinicReferrals },
  { id: 'clinic-messages', app: 'clinic', open: openClinicMessages },
];
const accessibilityScreenshotDir = path.join(os.tmpdir(), 'shifaa-f010-accessibility-captures');

for (const family of existingRouteFamilies) {
  test(`${family.id} live route keeps semantics and reflows with 200%/400% text in both locales`, async ({
    page,
  }, testInfo) => {
    test.skip(process.env['SHIFAA_F010_ACCESSIBILITY_APP'] !== family.app);
    for (const locale of locales) {
      await family.open(page, locale.lang, { width: 320, height: 800 });
      const main = page.getByRole('main');
      const heading = main.getByRole('heading', { level: 1 }).first();
      await expect(heading).toBeVisible();
      const semanticTree = await page.locator('body').ariaSnapshot();
      expect(semanticTree).toContain('heading');
      const captureName = `${family.id}-${locale.lang}-320x800`;
      await mkdir(accessibilityScreenshotDir, { recursive: true });
      await writeFile(
        path.join(accessibilityScreenshotDir, `${captureName}.aria.yml`),
        semanticTree,
        'utf8',
      );
      const bodyWrappers = await page.locator('body > div').evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            outerHTML: element.outerHTML.slice(0, 500),
            rect: element.getBoundingClientRect().toJSON(),
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            transitionProperty: style.transitionProperty,
            transitionDuration: style.transitionDuration,
          };
        }),
      );
      await writeFile(
        path.join(accessibilityScreenshotDir, `${captureName}-body-wrappers.json`),
        JSON.stringify(bodyWrappers, null, 2),
        'utf8',
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(accessibilityScreenshotDir, `${captureName}.png`),
        fullPage: false,
      });
      const headingText = (await heading.innerText()).trim();
      const routeLandmarks: Record<string, string[]> = {
        'patient-records': locale.lang === 'ar-EG' ? ['الإحالات'] : ['Referrals'],
        'patient-encounter':
          locale.lang === 'ar-EG' ? ['رسائل هذا الموعد'] : ['Appointment messages'],
        'clinic-summary': locale.lang === 'ar-EG' ? ['ملخص المريض'] : ['Patient summary'],
        'clinic-encounter': locale.lang === 'ar-EG' ? ['المشاركون'] : ['Participants'],
        'clinic-referrals': locale.lang === 'ar-EG' ? ['الإحالات'] : ['Referrals'],
        'clinic-messages':
          locale.lang === 'ar-EG' ? ['رسائل سياق الموعد'] : ['Appointment-context messages'],
      };
      for (const label of routeLandmarks[family.id] ?? [])
        await expect(
          main.getByRole('heading', { name: label }).first(),
          `${family.id} ${locale.lang} named route section`,
        ).toBeVisible();
      if (family.id === 'patient-records') {
        await expect(main.getByRole('radiogroup')).toBeVisible();
        await expect(main.getByRole('radio', { checked: true })).toHaveCount(1);
      } else if (family.id === 'patient-encounter') {
        await expect(
          page.getByRole('textbox', {
            name: locale.lang === 'ar-EG' ? 'اكتب رسالتك' : 'Write a message',
          }),
        ).toBeVisible();
      } else if (family.id === 'clinic-summary') {
        await expect(
          main.getByRole('region', {
            name: locale.lang === 'ar-EG' ? 'موعد المريض الحالي' : 'Current patient appointment',
          }),
        ).toBeVisible();
        await expect(
          main.getByRole('button', {
            name: locale.lang === 'ar-EG' ? 'بدء الزيارة' : 'Start encounter',
          }),
        ).toBeVisible();
      } else if (family.id === 'clinic-encounter') {
        await expect(
          main.getByRole('region', {
            name: locale.lang === 'ar-EG' ? 'سياق الزيارة' : 'Encounter context',
          }),
        ).toBeVisible();
        await expect(
          main.getByRole('region', {
            name: locale.lang === 'ar-EG' ? 'المشاركون' : 'Participants',
          }),
        ).toBeVisible();
      } else if (family.id === 'clinic-referrals') {
        await expect(
          main.getByRole('region', { name: locale.lang === 'ar-EG' ? 'الإحالات' : 'Referrals' }),
        ).toBeVisible();
        await expect(main.getByRole('article')).toBeVisible();
      } else if (family.id === 'clinic-messages') {
        await expect(main.getByRole('status')).toBeVisible();
        await expect(main.getByRole('article')).toBeVisible();
      }
      expect(
        await main.innerText(),
        `${family.id} ${locale.lang} exposes localized enum labels`,
      ).not.toMatch(
        /\b(?:checked_in|patient_visible|responsible_clinician|permission_denied|appointment_context|referral_pending)\b/,
      );
      if (['clinic-summary', 'clinic-encounter', 'clinic-referrals'].includes(family.id)) {
        const paragraphs = await main.locator('p:visible').evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return {
              text: node.textContent?.trim().slice(0, 80) ?? '',
              fontSize: Number.parseFloat(style.fontSize),
              lineHeight: Number.parseFloat(style.lineHeight),
            };
          }),
        );
        expect(
          paragraphs.length,
          `${family.id} ${locale.lang} visible body paragraphs`,
        ).toBeGreaterThan(0);
        for (const paragraph of paragraphs)
          expect(
            paragraph.lineHeight / paragraph.fontSize,
            `${family.id} ${locale.lang} body line-height for ${paragraph.text}`,
          ).toBeCloseTo(1.5, 2);
      }
      const localizedDates: Record<string, string> = {
        'patient-encounter': '2030-01-07T09:00:00Z',
        'clinic-encounter': '2026-09-29T09:00:00+03:00',
        'clinic-referrals': '2026-09-29T09:30:00+03:00',
        'clinic-messages': '2026-09-29T09:30:00+03:00',
      };
      const dateValue = localizedDates[family.id];
      if (dateValue) {
        const expectedDate = ['patient-encounter', 'clinic-messages'].includes(family.id)
          ? new Date(dateValue).toLocaleDateString(locale.lang, { timeZone: 'Africa/Cairo' })
          : new Intl.DateTimeFormat(locale.lang, {
              dateStyle: 'medium',
              timeZone: 'Africa/Cairo',
            }).format(new Date(dateValue));
        expect(
          await main.innerText(),
          `${family.id} ${locale.lang} displays localized Cairo date ${expectedDate}`,
        ).toContain(expectedDate);
      }
      const privateCanaries: Record<string, string[]> = {
        'patient-records': [
          'PRIVATE SOURCE ONLY SYNTHETIC SECRET',
          'SYNTHETIC SOURCE-ONLY METADATA',
        ],
        'patient-encounter': ['PRIVATE TEST SECRET'],
        'clinic-referrals': ['SYNTHETIC_PRIVATE_NOTE_CANARY', 'MUST_NOT_RENDER_FACILITY_NAME'],
        'clinic-messages': ['SYNTHETIC_PRIVATE_MESSAGE_CANARY', 'SYNTHETIC_PATIENT_NAME_CANARY'],
      };
      for (const canary of privateCanaries[family.id] ?? [])
        await expect(main.getByText(canary, { exact: false })).toHaveCount(0);
      const action = main
        .locator('button:visible, a:visible, input:visible, textarea:visible, select:visible')
        .first();
      await expect(
        action,
        `${family.id} ${locale.lang} has a keyboard-accessible action`,
      ).toBeVisible();
      const targets = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'main button:enabled, main a[href], main input:enabled, main textarea:enabled, main select:enabled, main [role="button"], main [role="radio"], main [role="checkbox"], header button:enabled, header a[href], header input:enabled, header [role="button"], nav button:enabled, nav a[href], nav input:enabled, nav [role="button"], footer button:enabled, footer a[href], footer input:enabled, footer textarea:enabled, footer select:enabled, footer [role="button"]',
          ),
        )
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => {
            let target = element;
            if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type))
              target = element.labels?.[0] ?? element;
            const rect = target.getBoundingClientRect();
            const referencedName = element
              .getAttribute('aria-labelledby')
              ?.split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
              .join(' ')
              .trim();
            const labelName =
              element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement
                ? Array.from(element.labels ?? [])
                    .map((label) => label.innerText.trim())
                    .join(' ')
                : '';
            const name = [
              element.getAttribute('aria-label'),
              referencedName,
              labelName,
              element.getAttribute('alt'),
              element.getAttribute('title'),
              element.getAttribute('placeholder'),
              element.textContent?.trim(),
            ].find((candidate) => candidate?.trim());
            return {
              role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
              name: name ?? '',
              width: rect.width,
              height: rect.height,
              container: element.closest('label')?.getBoundingClientRect().toJSON() ?? null,
            };
          }),
      );
      expect(targets.length, `${family.id} ${locale.lang} interactive targets`).toBeGreaterThan(0);
      for (const target of targets) {
        expect(
          target.name.trim(),
          `${family.id} ${locale.lang} ${target.role} has an accessible name`,
        ).not.toBe('');
        expect(
          target.width,
          `${family.id} ${locale.lang} ${target.role} ${target.name} target width ${JSON.stringify(target)}`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          target.height,
          `${family.id} ${locale.lang} ${target.role} ${target.name} target height`,
        ).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        document.body.tabIndex = -1;
        document.body.focus();
      });
      await page.keyboard.press('Tab');
      const focusStyle = await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return null;
        const style = getComputedStyle(active);
        return {
          outline: style.outlineStyle,
          width: Number.parseFloat(style.outlineWidth),
          shadow: style.boxShadow,
        };
      });
      expect(focusStyle).not.toBeNull();
      expect(
        (focusStyle!.outline !== 'none' && focusStyle!.width > 0) || focusStyle!.shadow !== 'none',
      ).toBe(true);
      if (family.id === 'clinic-referrals' || family.id === 'clinic-messages') {
        const navigationLinks = page.getByRole('navigation').locator('a:visible');
        expect(
          await navigationLinks.count(),
          `${family.id} ${locale.lang} navigation links`,
        ).toBeGreaterThan(0);
        for (const link of await navigationLinks.all()) {
          const bounds = await link.boundingBox();
          expect(
            bounds?.width,
            `${family.id} ${locale.lang} nav target width`,
          ).toBeGreaterThanOrEqual(44);
          expect(
            bounds?.height,
            `${family.id} ${locale.lang} nav target height`,
          ).toBeGreaterThanOrEqual(44);
        }
      }
      const textAt200 = await scaleRenderedText(page, 2);
      const headingAt200 = textAt200.find((sample) => sample.text === headingText);
      expect(headingAt200 && headingAt200.after).toBe(headingAt200!.before * 2);
      expect(
        textAt200.some(
          (sample) =>
            sample.text !== headingText &&
            sample.text.length > 12 &&
            ['div', 'p'].includes(sample.tag) &&
            sample.before === 16 &&
            sample.after === 32,
        ),
        `${family.id} ${locale.lang} description/body text scales from 16px to 32px`,
      ).toBe(true);
      const scaledControl200 = textAt200.find(
        (sample) =>
          ['input', 'textarea', 'select', 'button'].includes(sample.tag) &&
          sample.after === sample.before * 2,
      );
      expect(
        scaledControl200,
        `${family.id} ${locale.lang} visible control reaches 200% text`,
      ).toBeDefined();
      const layout200 = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        offenders: Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            text: element.innerText?.trim().slice(0, 80),
            rect: element.getBoundingClientRect().toJSON(),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            fontSize: getComputedStyle(element).fontSize,
          }))
          .filter(
            (element) =>
              element.rect.right > document.documentElement.clientWidth ||
              element.rect.left < 0 ||
              element.scrollWidth > element.clientWidth + 24,
          )
          .slice(0, 12),
      }));
      expect(
        layout200.documentWidth,
        `${family.id} ${locale.lang} 200% text overflow: ${JSON.stringify(layout200.offenders)}`,
      ).toBeLessThanOrEqual(layout200.viewportWidth);
      const clippedTextAt200 = textAt200.filter(
        (sample) =>
          (!['span', 'bdi'].includes(sample.tag) &&
            !['input', 'textarea', 'select'].includes(sample.tag) &&
            sample.scrollWidth > sample.clientWidth + 1) ||
          sample.left < 0 ||
          sample.right > 320,
      );
      expect(
        clippedTextAt200,
        `${family.id} ${locale.lang} 200% visible text is not clipped: ${JSON.stringify(clippedTextAt200)}`,
      ).toEqual([]);
      const textAt400 = await scaleRenderedText(page, 4);
      const headingAt400 = textAt400.find((sample) => sample.text === headingText);
      expect(headingAt400 && headingAt400.after).toBe(headingAt400!.before * 4);
      expect(
        textAt400.some(
          (sample) =>
            sample.text !== headingText &&
            sample.text.length > 12 &&
            ['div', 'p'].includes(sample.tag) &&
            sample.before === 16 &&
            sample.after === 64,
        ),
        `${family.id} ${locale.lang} description/body text scales from 16px to 64px`,
      ).toBe(true);
      const scaledControl400 = textAt400.find(
        (sample) =>
          ['input', 'textarea', 'select', 'button'].includes(sample.tag) &&
          sample.after === sample.before * 4,
      );
      expect(
        scaledControl400,
        `${family.id} ${locale.lang} visible control reaches 400% text`,
      ).toBeDefined();
      const clippedTextAt400 = textAt400.filter(
        (sample) =>
          (!['span', 'bdi'].includes(sample.tag) &&
            !['input', 'textarea', 'select'].includes(sample.tag) &&
            sample.scrollWidth > sample.clientWidth + 1) ||
          sample.left < 0 ||
          sample.right > 320,
      );
      expect(
        clippedTextAt400,
        `${family.id} ${locale.lang} 400% visible text is not clipped: ${JSON.stringify(clippedTextAt400)}`,
      ).toEqual([]);
      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        offenders: Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            text: element.innerText?.trim().slice(0, 96),
            rect: element.getBoundingClientRect().toJSON(),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            fontSize: getComputedStyle(element).fontSize,
          }))
          .filter(
            (element) =>
              element.rect.right > document.documentElement.clientWidth ||
              element.rect.left < 0 ||
              element.scrollWidth > element.clientWidth + 1,
          )
          .slice(0, 12),
      }));
      await page.screenshot({
        path: path.join(
          accessibilityScreenshotDir,
          `${family.id}-${locale.lang}-320x800-400-text.png`,
        ),
        fullPage: false,
      });
      await page.screenshot({
        path: path.join(
          accessibilityScreenshotDir,
          `${family.id}-${locale.lang}-320-400-text-full.png`,
        ),
        fullPage: true,
      });
      const lowerRouteContent = main.locator(
        'p:visible, button:visible, [role="radio"]:visible, [role="status"]:visible',
      );
      if (await lowerRouteContent.count()) {
        const lastContent = lowerRouteContent.last();
        await lastContent.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(
            accessibilityScreenshotDir,
            `${family.id}-${locale.lang}-320-400-text-content.png`,
          ),
          fullPage: false,
        });
      }
      expect(
        layout.documentWidth,
        `${family.id} ${locale.lang} 400% text overflow: ${JSON.stringify(layout.offenders)}`,
      ).toBeLessThanOrEqual(layout.viewportWidth);
      expect(await page.locator('html').getAttribute('lang')).toBe(locale.lang);
      expect(await page.locator('html').getAttribute('dir')).toBe(locale.dir);
      const identifiers = await main
        .locator('bdi')
        .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).direction));
      if (['clinic-summary', 'clinic-encounter', 'clinic-referrals'].includes(family.id)) {
        expect(
          identifiers.length,
          `${family.id} ${locale.lang} visible IDs have bidi isolation`,
        ).toBeGreaterThan(0);
        expect(identifiers.every((direction) => direction === 'ltr')).toBe(true);
      }
      if (['clinic-encounter', 'clinic-referrals', 'clinic-messages'].includes(family.id)) {
        const routeText = await main.innerText();
        const bidiIsolated =
          (await main.locator('bdi').count()) > 0 ||
          /[\u2066\u2067\u2068].*[\u2069]/s.test(routeText);
        expect(
          bidiIsolated,
          `${family.id} ${locale.lang} renders isolated identifiers or timestamps`,
        ).toBe(true);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const motion = await page.evaluate(() => {
        const seconds = (value: string) =>
          value.split(',').map((part) => {
            const trimmed = part.trim();
            if (trimmed === 'auto') return null;
            const amount = Number.parseFloat(trimmed);
            return Number.isFinite(amount)
              ? trimmed.endsWith('ms')
                ? amount / 1000
                : amount
              : null;
          });
        return Array.from(
          document.querySelectorAll<HTMLElement>(
            'header, header *, nav, nav *, main, main *, footer, footer *',
          ),
        )
          .filter((element) => element.getClientRects().length > 0)
          .flatMap((element) => {
            const style = getComputedStyle(element);
            const durations = [
              ...seconds(style.animationDuration),
              ...seconds(style.transitionDuration),
            ];
            const hasMotion = style.animationName !== 'none' || style.transitionProperty !== 'none';
            return durations.map((duration) => ({
              duration,
              hasMotion,
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === 'string' ? element.className : '',
              id: element.id,
              text: element.innerText?.trim().slice(0, 100) ?? '',
              outerHTML: element.outerHTML.slice(0, 500),
              path: [element, element.parentElement, element.parentElement?.parentElement]
                .filter((node): node is HTMLElement => node instanceof HTMLElement)
                .map(
                  (node) =>
                    `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().replace(/\s+/g, '.')}` : ''}`,
                ),
              animationName: style.animationName,
              transitionProperty: style.transitionProperty,
              animationDuration: style.animationDuration,
              transitionDuration: style.transitionDuration,
            }));
          });
      });
      expect(
        motion.length,
        `${family.id} ${locale.lang} reduced-motion content profile is nonempty`,
      ).toBeGreaterThan(0);
      const moving = motion.filter(({ duration, hasMotion }) =>
        duration === null ? hasMotion : duration > 0.001,
      );
      expect(moving, `${family.id} ${locale.lang} reduced-motion offenders`).toEqual([]);
    }
  });
}

test('clinic summary sign-in remains operable and reflows at 200% text on compact screens', async ({
  page,
}) => {
  test.skip(process.env['SHIFAA_F010_ACCESSIBILITY_APP'] !== 'clinic');
  for (const locale of locales) {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/patients/92000000-0000-4000-8000-000000000001/summary');
    if (locale.lang === 'en-EG') await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator(`html[lang="${locale.lang}"][dir="${locale.dir}"]`)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
    await expect(page.getByLabel(locale.handle)).toBeVisible();
    await page.getByLabel(locale.handle).fill('synthetic-staff-accessibility');

    const heading = page.getByRole('heading', {
      name: locale.lang === 'ar-EG' ? 'دخول موظف العيادة' : 'Clinic staff sign-in',
    });
    const headingText = await heading.innerText();
    const scaledAt200 = await scaleRenderedText(page, 2);
    expect(
      scaledAt200.some(
        (sample) => sample.text === headingText && sample.after >= sample.before * 2,
      ),
    ).toBe(true);
    expect(
      scaledAt200.some(
        (sample) =>
          sample.tag === 'input' &&
          sample.text === 'synthetic-staff-accessibility' &&
          sample.after >= sample.before * 2,
      ),
    ).toBe(true);
    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(
      layout.documentWidth,
      `${locale.lang} horizontal overflow at 200% text`,
    ).toBeLessThanOrEqual(layout.viewportWidth);

    const scaledAt400 = await scaleRenderedText(page, 4);
    expect(
      scaledAt400.some(
        (sample) => sample.text === headingText && sample.after >= sample.before * 4,
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );

    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const rect = active.getBoundingClientRect();
      const style = getComputedStyle(active);
      return {
        name: active.getAttribute('aria-label') ?? active.textContent?.trim(),
        width: rect.width,
        height: rect.height,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(focused).not.toBeNull();
    expect(focused!.width).toBeGreaterThanOrEqual(44);
    expect(focused!.height).toBeGreaterThanOrEqual(44);
    expect(focused!.outlineStyle).not.toBe('none');
    expect(parseFloat(focused!.outlineWidth)).toBeGreaterThan(0);
  }
});

test('clinic summary keeps its current state separate from inventory-only note states', async ({
  page,
}) => {
  test.skip(process.env['SHIFAA_F010_ACCESSIBILITY_APP'] !== 'clinic');
  await page.setViewportSize({ width: 768, height: 1024 });
  const patientId = '92000000-0000-4000-8000-000000000001';
  const appointmentId = '93000000-0000-4000-8000-000000000001';
  const facilityId = '94000000-0000-4000-8000-000000000001';
  const doctorId = '95000000-0000-4000-8000-000000000001';
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/v1/, '');
    if (path === '/auth/login')
      return route.fulfill({
        status: 200,
        json: { kind: 'challenge', challenge_id: '96000000-0000-4000-8000-000000000099' },
      });
    if (path === '/auth/otp/verify')
      return route.fulfill({
        status: 200,
        json: { kind: 'session', access_token: 'synthetic-clinic-token', aal: 2 },
      });
    if (path === '/appointments')
      return route.fulfill({
        status: 200,
        json: {
          items: [
            {
              id: appointmentId,
              patientId,
              facilityId,
              doctorId,
              startsAt: '2026-10-01T09:00:00Z',
              endsAt: '2026-10-01T09:20:00Z',
              timezone: 'Africa/Cairo',
              civilDate: '2026-10-01',
              status: 'checked_in',
              feeMinorUnits: 0,
              currency: 'EGP',
              paymentMethod: 'cash_on_arrival',
              version: 1,
            },
          ],
          freshness: 'fresh',
        },
      });
    if (path.endsWith('/queues'))
      return route.fulfill({
        status: 200,
        json: {
          facilityId,
          doctorId,
          civilDate: '2026-10-01',
          version: 1,
          nextCursor: null,
          freshness: 'fresh',
          entries: [
            {
              id: '96000000-0000-4000-8000-000000000001',
              appointmentId,
              facilityId,
              doctorId,
              civilDate: '2026-10-01',
              queueNumber: 1,
              state: 'called',
              version: 1,
            },
          ],
        },
      });
    return route.fulfill({ status: 404, json: { status: 404, title: 'Not found' } });
  });
  await page.goto('/patients/92000000-0000-4000-8000-000000000001/summary');
  await page.getByLabel('وسيلة الدخول').fill('synthetic-clinic-staff');
  await page.getByLabel('كلمة المرور').fill('synthetic-password');
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByLabel('رمز التحقق').fill('123456');
  await page.getByRole('button', { name: 'تحقق' }).click();
  await expect(page.getByText('مؤهل لبدء الزيارة')).toBeVisible();
  // Product-state absence is recorded, not treated as an accessibility regression: the
  // current summary route has no authorized note-read operation or note section.
  await expect(page.getByRole('heading', { name: 'الملاحظات الموقعة' })).toHaveCount(0);
});

test('clinic encounter route exposes named clinical sections and isolated identifiers in both locales', async ({
  page,
}) => {
  test.skip(process.env['SHIFAA_F010_ACCESSIBILITY_APP'] !== 'clinic');
  const encounterId = '97000000-0000-4000-8000-000000000001';
  const requests: string[] = [];
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/v1/, '');
    requests.push(`${route.request().method()} ${path}?${url.searchParams.toString()}`);
    if (path === '/auth/login')
      return route.fulfill({
        status: 200,
        json: { kind: 'challenge', challenge_id: '96000000-0000-4000-8000-000000000099' },
      });
    if (path === '/auth/otp/verify')
      return route.fulfill({
        status: 200,
        json: { kind: 'session', access_token: 'synthetic-clinic-token', aal: 2 },
      });
    if (path === `/encounters/${encounterId}`)
      return route.fulfill({ status: 403, json: { status: 403, title: 'Forbidden' } });
    return route.fulfill({ status: 404, json: { status: 404, title: 'Not found' } });
  });
  for (const locale of [
    {
      lang: 'ar-EG',
      dir: 'rtl',
      heading: 'مساحة الزيارة',
      denied: 'تعذّر تحميل الزيارة. حدّث الصفحة وحاول مجددًا.',
      toggle: 'English',
    },
    {
      lang: 'en-EG',
      dir: 'ltr',
      heading: 'Encounter workspace',
      denied: 'Encounter could not be loaded. Refresh and try again.',
      toggle: 'العربية',
    },
  ] as const) {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`/encounters/${encounterId}`);
    if (locale.lang === 'en-EG') await page.getByRole('button', { name: 'English' }).click();
    await page
      .getByLabel(locale.lang === 'ar-EG' ? 'وسيلة الدخول' : 'Sign-in handle')
      .fill('synthetic-clinic-staff');
    await page
      .getByLabel(locale.lang === 'ar-EG' ? 'كلمة المرور' : 'Password')
      .fill('synthetic-password');
    await page
      .getByRole('button', { name: locale.lang === 'ar-EG' ? 'متابعة' : 'Continue' })
      .click();
    await page
      .getByLabel(locale.lang === 'ar-EG' ? 'رمز التحقق' : 'Verification code')
      .fill('123456');
    await page.getByRole('button', { name: locale.lang === 'ar-EG' ? 'تحقق' : 'Verify' }).click();
    await expect(
      page.locator(`[lang="${locale.lang}"][dir="${locale.dir}"]`).first(),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    await expect(page.locator('html')).toHaveAttribute('dir', locale.dir);
    const main = page.getByRole('main');
    const title = main.getByRole('heading', { name: locale.heading, level: 1 });
    await expect(title, requests.join('\n')).toBeVisible();
    await expect(main.getByRole('alert')).toContainText(locale.denied);
    const retry = main.getByRole('button', {
      name: locale.lang === 'ar-EG' ? 'إعادة التحميل' : 'Reload encounter',
    });
    await expect(retry).toHaveAccessibleName(
      locale.lang === 'ar-EG' ? 'إعادة التحميل' : 'Reload encounter',
    );
    const retryBounds = await retry.boundingBox();
    expect(retryBounds?.width).toBeGreaterThanOrEqual(44);
    expect(retryBounds?.height).toBeGreaterThanOrEqual(44);
    const baseFont = Number.parseFloat(
      await title.evaluate((node) => getComputedStyle(node).fontSize),
    );
    const scaled = await scaleRenderedText(page, 2);
    const scaledTitle = scaled.find((sample) => sample.text === locale.heading);
    expect(scaledTitle && scaledTitle.after >= scaledTitle.before * 2).toBe(true);
    expect(scaledTitle?.before).toBe(baseFont);
    await page.setViewportSize({ width: 320, height: 800 });
    const scaled400 = await scaleRenderedText(page, 4);
    const title400 = scaled400.find((sample) => sample.text === locale.heading);
    expect(title400 && title400.after >= title400.before * 4).toBe(true);
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: element.innerText?.trim().slice(0, 80),
          rect: element.getBoundingClientRect().toJSON(),
          fontSize: getComputedStyle(element).fontSize,
        }))
        .filter((element) => element.rect.right > 320 || element.rect.left < 0)
        .slice(0, 10),
    }));
    expect(overflow.width, JSON.stringify(overflow.offenders)).toBeLessThanOrEqual(320);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animationDuration = await title.evaluate(
      (node) => getComputedStyle(node).animationDuration,
    );
    expect(animationDuration.split(',').every((value) => parseFloat(value) === 0)).toBe(true);
  }
});

test('patient records exposes localized referral state with keyboard access and compact reflow', async ({
  page,
}) => {
  test.skip(process.env['SHIFAA_F010_ACCESSIBILITY_APP'] !== 'patient');
  const patientId = 'a1000000-0000-4000-8000-000000000022';
  const observedRequests: string[] = [];
  let resolveSession!: () => void;
  const sessionReady = new Promise<void>((resolve) => (resolveSession = resolve));
  await page.context().addCookies([
    {
      name: 'shifaa_csrf',
      value: 'synthetic-csrf',
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      secure: false,
    },
  ]);
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    observedRequests.push(`${route.request().method()} ${path}`);
    if (path === '/v1/auth/session/refresh') {
      await route.fulfill({
        status: 200,
        json: {
          accessToken: 'synthetic-patient-token',
          sessionId: 'a1000000-0000-4000-8000-000000000099',
          assurance: 'aal1',
          expiresAt: '2030-01-07T10:00:00Z',
        },
        headers: { 'cache-control': 'private, no-store' },
      });
      resolveSession();
      return;
    }
    if (path === '/v1/people/me')
      return route.fulfill({
        status: 200,
        json: {
          id: patientId,
          display_name: 'Synthetic Patient',
          birth_date: null,
          nationality_code: 'EG',
          preferred_locale: 'ar-EG',
          verification_status: 'unverified',
          version: 1,
        },
      });
    if (path === '/v1/referrals') {
      await sessionReady;
      return route.fulfill({
        status: 403,
        json: { code: 'forbidden' },
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    return route.fulfill({ status: 200, json: {} });
  });
  for (const locale of [
    { lang: 'ar-EG', dir: 'rtl', heading: 'الإحالات في سجلك', toggle: 'English' },
    { lang: 'en-EG', dir: 'ltr', heading: 'Referrals in your records', toggle: 'العربية' },
  ] as const) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem('shifaa.patient.locale', value),
      locale.lang,
    );
    const refreshed = page.waitForResponse((response) =>
      response.url().endsWith('/v1/auth/session/refresh'),
    );
    await page.goto('/records');
    await refreshed;
    await page.waitForTimeout(50);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('heading', { name: locale.heading })).toBeVisible();
    await expect(page.locator(`html[lang="${locale.lang}"][dir="${locale.dir}"]`)).toBeVisible();
    const deniedText =
      locale.lang === 'ar-EG'
        ? 'تعذّر عرض الإحالات لأن الصلاحية الحالية غير متاحة. تم إخفاء بيانات السجل.'
        : 'Referrals cannot be shown because current authority is unavailable. Record data was cleared.';
    await expect(
      page.getByRole('heading', { name: deniedText }),
      observedRequests.join('\n'),
    ).toBeVisible();
    const action = page.getByRole('radio').first();
    await expect(action).toHaveAccessibleName(locale.lang === 'ar-EG' ? 'المريض نفسه' : 'Patient');
    const target = await action.boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
    await action.focus();
    await expect(action).toBeFocused();
    const heading = page.getByRole('heading', { name: locale.heading, level: 1 });
    const scaled200 = await scaleRenderedText(page, 2);
    const heading200 = scaled200.find((sample) => sample.text === locale.heading);
    expect(heading200 && heading200.after >= heading200.before * 2).toBe(true);
    expect(
      scaled200.some(
        (sample) =>
          sample.text !== locale.heading &&
          sample.text.length > 12 &&
          sample.tag !== 'button' &&
          sample.after >= sample.before * 2,
      ),
    ).toBe(true);
    const semanticTree = await page.getByRole('main').ariaSnapshot();
    expect(semanticTree).toContain('radiogroup');
    expect(semanticTree).toContain('radio');
    await page.setViewportSize({ width: 320, height: 800 });
    const scaled400 = await scaleRenderedText(page, 4);
    const heading400 = scaled400.find((sample) => sample.text === locale.heading);
    expect(heading400 && heading400.after >= heading400.before * 4).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  }
});

test('patient encounter permission errors remain accessible and reflow under text scaling', async ({
  page,
}) => {
  test.skip(process.env['SHIFAA_F010_ACCESSIBILITY_APP'] !== 'patient');
  const encounterId = 'a1000000-0000-4000-8000-000000000010';
  let refreshed!: () => void;
  const refreshDone = new Promise<void>((resolve) => (refreshed = resolve));
  const observedRequests: string[] = [];
  await page.context().addCookies([
    {
      name: 'shifaa_csrf',
      value: 'synthetic-csrf',
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      secure: false,
    },
  ]);
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    observedRequests.push(`${route.request().method()} ${path}`);
    if (path === '/v1/auth/session/refresh') {
      await route.fulfill({
        status: 200,
        json: {
          accessToken: 'synthetic-patient-token',
          sessionId: 'a1000000-0000-4000-8000-000000000099',
          assurance: 'aal1',
          expiresAt: '2026-09-29T10:00:00Z',
        },
        headers: { 'cache-control': 'private, no-store' },
      });
      refreshed();
      return;
    }
    if (path === `/v1/encounters/${encounterId}`) {
      await refreshDone;
      await page.waitForTimeout(50);
      await route.fulfill({
        status: 403,
        json: { code: 'forbidden' },
        headers: { 'cache-control': 'private, no-store' },
      });
      return;
    }
    await route.fulfill({ status: 200, json: {} });
  });
  for (const locale of [
    { lang: 'ar-EG', dir: 'rtl', heading: 'تفاصيل الزيارة', toggle: 'English' },
    { lang: 'en-EG', dir: 'ltr', heading: 'Encounter details', toggle: 'العربية' },
  ] as const) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem('shifaa.patient.locale', value),
      locale.lang,
    );
    const refreshed = page.waitForResponse((response) =>
      response.url().endsWith('/v1/auth/session/refresh'),
    );
    await page.goto(`/encounters/${encounterId}`);
    await refreshed;
    await page.waitForTimeout(50);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const denied = page.getByText(
      locale.lang === 'ar-EG'
        ? 'تعذّر عرض هذه الزيارة بسبب عدم توفر صلاحية حالية.'
        : 'This encounter cannot be shown because current access is unavailable.',
    );
    if (await denied.isVisible().catch(() => false))
      await page
        .getByRole('button', { name: locale.lang === 'ar-EG' ? 'إعادة المحاولة' : 'Try again' })
        .click();
    await expect(page.getByRole('heading', { name: locale.heading })).toBeVisible();
    await expect(
      page.getByRole('button', { name: locale.lang === 'ar-EG' ? 'إعادة المحاولة' : 'Try again' }),
    ).toBeVisible();
    const main = page.getByRole('main');
    const heading = main.getByRole('heading', { level: 1 });
    const scaled = await scaleRenderedText(page, 2);
    const headingScale = scaled.find((sample) => sample.text === locale.heading);
    expect(headingScale && headingScale.after >= headingScale.before * 2).toBe(true);
    expect(
      scaled.some(
        (sample) =>
          sample.text !== locale.heading &&
          sample.text.length > 12 &&
          sample.tag !== 'button' &&
          sample.after >= sample.before * 2,
      ),
    ).toBe(true);
    const semanticTree = await main.ariaSnapshot();
    expect(semanticTree).toContain('heading');
    expect(semanticTree).toContain('button');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  }
});
