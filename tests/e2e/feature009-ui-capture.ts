import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page } from 'playwright/test';

const actualDirectory = path.resolve(
  process.cwd(),
  'specs/009-clinic-scheduling-appointments-queue/evidence/ui/actual',
);

export async function captureFeature009Ui(
  page: Page,
  baselineId: string,
  locale: 'ar-EG' | 'en-EG',
  state: string,
  visibleState: Locator,
  alignment: ScrollLogicalPosition = 'center',
) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Feature 009 UI evidence requires a fixed browser viewport.');
  const expectedDirection = locale === 'ar-EG' ? 'rtl' : 'ltr';
  const main = page
    .locator('main:visible,[role="main"]:visible')
    .filter({ has: visibleState })
    .last();
  await main.waitFor({ state: 'visible' });
  const renderedContext = await main.evaluate((element) => {
    const languageRoot = element.closest('[lang]');
    return {
      language: languageRoot?.getAttribute('lang') ?? document.documentElement.lang,
      direction: element.getAttribute('dir') ?? document.documentElement.dir,
    };
  });
  const languageMatches =
    renderedContext.language === locale || renderedContext.language === locale.split('-')[0];
  if (!languageMatches || renderedContext.direction !== expectedDirection)
    throw new Error(
      `Feature 009 capture locale/direction mismatch: expected ${locale}/${expectedDirection}, got ${renderedContext.language ?? '(missing)'}/${renderedContext.direction ?? '(missing)'}.`,
    );
  const fontReport = await main.evaluate(async (root, expectedLocale) => {
    await document.fonts.ready;
    const arabic = expectedLocale === 'ar-EG';
    const acceptableFamilies = arabic
      ? [
          'IBM Plex Sans Arabic',
          'IBMPlexSansArabic_400Regular',
          'IBMPlexSansArabic_600SemiBold',
          'IBMPlexSansArabic_700Bold',
        ]
      : ['Inter', 'Inter_400Regular', 'Inter_600SemiBold', 'Inter_700Bold'];
    const sample = arabic ? 'العيادة والموعد' : 'Clinic appointment';
    const elements = [root, ...Array.from(root.querySelectorAll('*'))].filter(
      (element) => element.getClientRects().length > 0 && (element.textContent ?? '').trim(),
    );
    const visibleFontPairs = new Map<string, { family: string; weight: string }>();
    for (const element of elements) {
      const style = getComputedStyle(element);
      for (const family of style.fontFamily
        .split(',')
        .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))) {
        if (acceptableFamilies.includes(family))
          visibleFontPairs.set(`${family}/${style.fontWeight}`, {
            family,
            weight: style.fontWeight,
          });
      }
    }
    let loadedFamily: string | undefined;
    for (const { family, weight } of visibleFontPairs.values()) {
      const font = `${weight} 16px "${family}"`;
      const faces = await document.fonts.load(font, sample);
      if (faces.some((face) => face.status === 'loaded') && document.fonts.check(font, sample)) {
        loadedFamily = family;
        break;
      }
    }
    return {
      family: getComputedStyle(root).fontFamily,
      expectedLoaded: Boolean(loadedFamily),
    };
  }, locale);
  const expectedFamily =
    locale === 'ar-EG'
      ? 'IBM Plex Sans Arabic or its loaded Expo alias'
      : 'Inter or its loaded Expo alias';
  if (!fontReport.expectedLoaded)
    throw new Error(
      `Feature 009 capture font mismatch: expected loaded ${expectedFamily}, got ${fontReport.family || '(missing)'}.`,
    );
  await visibleState.evaluate(
    (element, block) => element.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' }),
    alignment,
  );
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  if (!(await visibleState.isVisible()))
    throw new Error(`Feature 009 ${state} capture anchor is not visible.`);
  const bounds = await visibleState.boundingBox();
  if (
    !bounds ||
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > viewport.width ||
    bounds.y + bounds.height > viewport.height
  )
    throw new Error(
      `Feature 009 ${state} capture anchor is outside the ${viewport.width}x${viewport.height} viewport.`,
    );
  await fs.mkdir(actualDirectory, { recursive: true });
  const fileName = `${baselineId}--${locale}--${viewport.width}x${viewport.height}--${state}.png`;
  const filePath = path.join(actualDirectory, fileName);
  const featureRoot = path.resolve(process.cwd(), 'specs/009-clinic-scheduling-appointments-queue');
  const referenceManifest = JSON.parse(
    await fs.readFile(path.join(featureRoot, 'visual-baselines/reference-manifest.json'), 'utf8'),
  ) as { entries: Array<Record<string, unknown>> };
  const baseline = referenceManifest.entries.find(
    (entry) =>
      entry.baselineId === baselineId &&
      entry.locale === locale &&
      entry.viewport === `${viewport.width}x${viewport.height}` &&
      entry.state === state,
  );
  if (!baseline)
    throw new Error(
      `No approved Feature 009 metadata row for ${baselineId}/${locale}/${viewport.width}x${viewport.height}/${state}.`,
    );
  const actualRoute = new URL(page.url()).pathname;
  const routePattern = String(baseline.route)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[^/]+/g, '[^/]+');
  if (!new RegExp(`^${routePattern}$`).test(actualRoute))
    throw new Error(
      `Feature 009 capture URL does not match approved route ${String(baseline.route)}: ${actualRoute}.`,
    );
  await page.screenshot({ path: filePath });
  const image = await fs.readFile(filePath);
  const indexPath = path.join(actualDirectory, 'capture-manifest.json');
  let index: { schemaVersion: string; captures: Array<Record<string, unknown>> };
  try {
    index = JSON.parse(await fs.readFile(indexPath, 'utf8')) as typeof index;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    index = { schemaVersion: '1.0.0', captures: [] };
  }
  const capture = {
    path: fileName,
    baselineId,
    route: baseline.route,
    locale,
    viewport: `${viewport.width}x${viewport.height}`,
    state,
    sha256: createHash('sha256').update(image).digest('hex'),
    bytes: image.length,
  };
  index.captures = index.captures.filter((entry) => entry.path !== fileName);
  index.captures.push(capture);
  index.captures.sort((left, right) => String(left.path).localeCompare(String(right.path)));
  await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return fileName;
}
