import { chromium } from 'playwright';
import {
  addDays,
  dateInTimeZone,
  findAdjacentGroups,
  formatClock,
  groupsFingerprint,
  minutesInTimeZone,
  parseRows,
} from './lib.mjs';
import { discoverSessions, inspectSession } from './harkins.mjs';
import { loadState, saveState } from './github-state.mjs';
import { sendGitHubAlert } from './github-alert.mjs';

const config = {
  theatreId: process.env.THEATRE_ID || '16',
  movieId: process.env.MOVIE_ID || 'HO00014201',
  movieSlug: process.env.MOVIE_SLUG || 'the-odyssey',
  timeZone: process.env.TIME_ZONE || 'America/Phoenix',
  allowedRows: parseRows(process.env.ROWS || 'G,H,I,J,K,L,M'),
  minAdjacent: Number(process.env.MIN_ADJACENT || 3),
  middlePercent: Number(process.env.MIDDLE_PERCENT || 50),
  minShowMinutes: Number(process.env.AFTER_MINUTES || 14 * 60),
  startOffsetDays: Number(process.env.START_OFFSET_DAYS || 0),
  scanDays: Number(process.env.SCAN_DAYS || 7),
  concurrency: Math.max(1, Number(process.env.SESSION_CONCURRENCY || 3)),
  excludeAccessible: process.env.EXCLUDE_ACCESSIBLE !== 'false',
};

function shouldCheckSession(result, today, nowMinutes) {
  if (!result.date || result.minutes === null || result.minutes === undefined) return false;
  if (result.minutes <= config.minShowMinutes) return false; // "after 2 PM" is strict.
  if (result.date < today) return false;
  if (result.date === today && result.minutes <= nowMinutes) return false;
  return true;
}

function formatGroups(groups) {
  return groups.map((group) => `${group.seats[0]}–${group.seats.at(-1)} (${group.seats.length})`).join(', ');
}

async function asyncPool(limit, items, worker) {
  const results = [];
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  console.log('Monitor configuration:', {
    ...config,
    allowedRows: [...config.allowedRows],
  });
  const today = dateInTimeZone(config.timeZone);
  const nowMinutes = minutesInTimeZone(config.timeZone);
  const { issueNumber, state } = await loadState();
  state.sessions ||= {};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    locale: 'en-US',
    timezoneId: config.timeZone,
  });

  try {
    const discovered = [];
    for (let offset = config.startOffsetDays; offset < config.startOffsetDays + config.scanDays; offset += 1) {
      const date = addDays(today, offset);
      try {
        discovered.push(...await discoverSessions(context, { date, ...config }));
      } catch (error) {
        console.error(`Discovery failed for ${date}:`, error.message);
      }
    }

    const uniqueSessions = [...new Map(discovered.map((session) => [session.url, session])).values()]
      .filter((session) => {
        const date = session.url.match(/\/date\/(\d{4}-\d{2}-\d{2})/)?.[1];
        if (session.anchorMinutes !== null && session.anchorMinutes !== undefined) {
          if (session.anchorMinutes <= config.minShowMinutes) return false;
          if (date === today && session.anchorMinutes <= nowMinutes) return false;
        }
        return !date || date >= today;
      });
    console.log(`Inspecting ${uniqueSessions.length} unique possible session(s) after pre-filtering.`);

    const results = await asyncPool(config.concurrency, uniqueSessions, (session) =>
      inspectSession(context, session, config),
    );

    const scannedAt = new Date().toISOString();
    for (const result of results) {
      if (result.blocked) {
        console.warn(`Blocked session; skipped without bypassing: ${result.url}`);
        continue;
      }
      if (result.skippedFormat || !result.isImax70mm) continue;
      if (!shouldCheckSession(result, today, nowMinutes)) continue;
      if (result.confidence !== 'high') {
        console.warn(`Low-confidence seat extraction; no alert: ${result.url}`);
        continue;
      }

      const groups = findAdjacentGroups(result.seats, config.minAdjacent, config.middlePercent);
      const fingerprint = groupsFingerprint(groups);
      const prior = state.sessions[result.url];

      if (!groups.length) {
        if (prior) delete state.sessions[result.url];
        console.log(`${result.date} ${formatClock(result.minutes)}: no qualifying groups.`);
        continue;
      }

      if (prior?.fingerprint === fingerprint) {
        console.log(`${result.date} ${formatClock(result.minutes)}: qualifying seats unchanged; suppressing duplicate alert.`);
        continue;
      }

      const clock = formatClock(result.minutes);
      const groupText = formatGroups(groups);
      const title = `🎟️ Odyssey IMAX 70mm seats: ${result.date} at ${clock}`;
      const body = [
        '## 3+ adjacent middle-section Odyssey IMAX 70mm seats found',
        '',
        `- **Date:** ${result.date}`,
        `- **Showtime:** ${clock}`,
        `- **Rows/seats:** ${groupText}`,
        `- **Seat position:** Entire group is within the middle ${config.middlePercent}% of its row`,
        '',
        `[Open the Harkins seat map](${result.url})`,
        '',
        '> Availability can change immediately.',
      ].join('\n');
      const sent = await sendGitHubAlert({ title, body });
      if (!sent) {
        console.warn(`Alert was not delivered for ${result.date} ${clock}; it will be retried next run.`);
        continue;
      }
      state.sessions[result.url] = { fingerprint, lastSeen: scannedAt };
      console.log(`GitHub alert created for ${result.date} ${clock}: ${groupText}`);
    }

    // Remove very old entries so the state issue stays small.
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    for (const [url, entry] of Object.entries(state.sessions)) {
      if (entry.lastSeen && Date.parse(entry.lastSeen) < cutoff) delete state.sessions[url];
    }
    await saveState(issueNumber, state);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
