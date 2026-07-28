import fs from 'node:fs/promises';
import path from 'node:path';
import { parseClockMinutes } from './lib.mjs';
import { extractVistaSeats } from './vista.mjs';

const BLOCK_PATTERNS = /captcha|access denied|temporarily blocked|verify you are human|unusual traffic/i;

async function dismissCommonDialogs(page) {
  const labels = [/accept all/i, /accept cookies/i, /^accept$/i, /agree/i, /continue/i];
  for (const label of labels) {
    const button = page.getByRole('button', { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2_000 }).catch(() => {});
      break;
    }
  }
}

async function saveDebug(page, name, extra = {}) {
  await fs.mkdir('debug', { recursive: true });
  const safe = name.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 150);
  await page.screenshot({ path: path.join('debug', `${safe}.png`), fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => '');
  await fs.writeFile(path.join('debug', `${safe}.html`), html).catch(() => {});
  await fs.writeFile(path.join('debug', `${safe}.json`), JSON.stringify(extra, null, 2)).catch(() => {});
}

export async function discoverSessions(context, { date, movieSlug, theatreId, movieId }) {
  const page = await context.newPage();
  const url = `https://harkins.com/movies/${movieSlug}/${date}?recentTheatre=${theatreId}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await dismissCommonDialogs(page);
    await page.waitForTimeout(3_000);
    const bodyText = await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '');
    if (BLOCK_PATTERNS.test(bodyText)) {
      await saveDebug(page, `blocked-discovery-${date}`, { url, bodyText: bodyText.slice(0, 2000) });
      throw new Error(`Harkins blocked the discovery page for ${date}; no bypass attempted.`);
    }

    const rawLinks = await page.evaluate(({ theatreId: tid, movieId: mid }) => {
      const expected = `/ticketing/theatre/${tid}/movie/${mid}/session/`;
      const values = [];
      for (const anchor of document.querySelectorAll('a[href]')) {
        const href = anchor.href || '';
        if (!href.includes(expected)) continue;
        let node = anchor;
        let contextText = (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim();
        let fallbackText = contextText;
        for (let depth = 0; depth < 6 && node; depth += 1, node = node.parentElement) {
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
          if (text.length > fallbackText.length && text.length < 450) fallbackText = text;
          if (/imax/i.test(text) && text.length < 450) {
            contextText = text;
            break;
          }
        }
        if (!/imax/i.test(contextText)) contextText = fallbackText;
        values.push({ href, anchorText: (anchor.innerText || '').trim(), contextText });
      }
      const htmlMatches = [...document.documentElement.innerHTML.matchAll(
        new RegExp(`/ticketing/theatre/${tid}/movie/${mid}/session/\\d+/date/\\d{4}-\\d{2}-\\d{2}`, 'g'),
      )].map((match) => ({ href: new URL(match[0], location.origin).href, anchorText: '', contextText: '' }));
      return [...values, ...htmlMatches];
    }, { theatreId, movieId });

    const unique = new Map();
    for (const link of rawLinks) {
      const normalized = link.href.replace('http://', 'https://');
      const contextText = `${link.anchorText} ${link.contextText}`.replace(/\s+/g, ' ').trim();
      const anchorMinutes = parseClockMinutes(link.anchorText);
      const hintMinutes = anchorMinutes ?? parseClockMinutes(contextText);
      const hasImaxHint = /imax/i.test(contextText);
      const looks70mm = /70\s*mm/i.test(contextText);
      const existing = unique.get(normalized);
      if (!existing || contextText.length > existing.contextText.length) {
        unique.set(normalized, { url: normalized, contextText, hintMinutes, anchorMinutes, hasImaxHint, looks70mm });
      }
    }

    const allSessions = [...unique.values()];
    const imaxSessions = allSessions.filter((item) => item.hasImaxHint);
    const sessions = imaxSessions.length ? imaxSessions : allSessions;
    console.log(`${date}: found ${sessions.length} possible IMAX session link(s).`);
    return sessions;
  } finally {
    await page.close();
  }
}

function sessionMetadataFromText(url, title, headingText) {
  const date = url.match(/\/date\/(\d{4}-\d{2}-\d{2})/)?.[1] || null;
  const titleMinutes = parseClockMinutes(title);
  const headingMinutes = parseClockMinutes(headingText);
  return {
    date,
    minutes: titleMinutes ?? headingMinutes,
    title,
    isImax70mm: /IMAX\s*70\s*mm/i.test(`${title} ${headingText}`),
  };
}

export async function inspectSession(context, session, { allowedRows, excludeAccessible = true }) {
  const page = await context.newPage();
  const debugName = `session-${session.url.match(/session\/(\d+)/)?.[1] || Date.now()}`;
  const captures = [];
  const pendingCaptures = [];

  // Any Playwright route disables the browser HTTP cache. That ensures every
  // session exposes its own live Vista availability response for inspection.
  await page.route('**/*', (route) => route.continue());

  page.on('response', (response) => {
    const url = response.url();
    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    const contentLength = Number(headers['content-length'] || 0);
    if (!/json/i.test(contentType) || contentLength > 5_000_000) return;
    const capture = response.json()
      .then((json) => captures.push({ url, status: response.status(), json }))
      .catch(() => {});
    pendingCaptures.push(capture);
  });

  try {
    await page.goto(session.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await dismissCommonDialogs(page);
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
    await Promise.allSettled(pendingCaptures);

    const bodyText = await page.locator('body').innerText({ timeout: 12_000 }).catch(() => '');
    const title = await page.title();
    const headingText = (await page.locator('h1,h2,h3').allInnerTexts().catch(() => [])).join(' | ');
    const metadata = sessionMetadataFromText(page.url(), title, `${headingText} ${bodyText.slice(0, 4000)}`);

    if (BLOCK_PATTERNS.test(bodyText)) {
      await saveDebug(page, `blocked-${debugName}`, { url: session.url, title, bodyText: bodyText.slice(0, 3000) });
      return { ...metadata, url: session.url, blocked: true, seats: [], confidence: 'none' };
    }
    if (!metadata.isImax70mm) {
      return { ...metadata, url: session.url, skippedFormat: true, seats: [], confidence: 'none' };
    }

    const vista = extractVistaSeats(captures, { allowedRows, excludeAccessible });
    const availableCount = vista.seats.filter((seat) => seat.status === 'available').length;
    if (vista.confidence !== 'high') {
      await saveDebug(page, `${debugName}-no-authoritative-seat-data`, {
        url: session.url,
        metadata,
        availableCount,
        vista: vista.diagnostics,
        bodyText: bodyText.slice(0, 5000),
      });
    }

    return {
      ...metadata,
      url: session.url,
      seats: vista.seats,
      confidence: vista.confidence,
      blocked: false,
      diagnostics: vista.diagnostics,
    };
  } catch (error) {
    await saveDebug(page, `${debugName}-error`, { url: session.url, error: error.stack || String(error) });
    return { url: session.url, error: error.message, seats: [], confidence: 'none' };
  } finally {
    await page.close();
  }
}

export { saveDebug };
