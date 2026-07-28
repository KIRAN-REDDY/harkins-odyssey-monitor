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
  if (result.minutes <= config.minShowMinutes) return false;
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

function alertBody(alerts) {
  const lines = [
    '## Verified Odyssey IMAX 70mm seat availability',
    '',
    'Every seat below was verified from Harkins’ live seat map. The monitor accepts authoritative live seat data when exposed; otherwise it reads the rendered red-seat and unavailable-seat icons without selecting or holding seats.',
    '',
  ];
  for (const alert of alerts) {
    lines.push(
      `### ${alert.date} at ${alert.clock}`,
      '',
      `- **Rows/seats:** ${alert.groupText}`,
      `- **Seat position:** Entire group is within the middle ${config.middlePercent}% of its row`,
      `- [Open the Harkins seat map](${alert.url})`,
      '',
    );
  }
  lines.push('> Availability can change immediately.');
  return lines.join('\n');
}

async function main() {
  console.log('Monitor configuration:', { ...config, allowedRows: [...config.allowedRows] });
  const today = dateInTimeZone(config.timeZone);
  const nowMinutes = minutesInTimeZone(config.timeZone);
  const { issueNumber, state } = await loadState();
  state.sessions ||= {};

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    locale: 'en-US',
    timezoneId: config.timeZone,
    serviceWorkers: 'block',
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
      inspectSession(context, session, config));

    const scannedAt = new Date().toISOString();
    const pendingAlerts = [];

    for (const result of results) {
      if (result.blocked) {
        console.warn(`Blocked session; skipped without bypassing: ${result.url}`);
        continue;
      }
      if (result.skippedFormat || !result.isImax70mm) continue;
      if (!shouldCheckSession(result, today, nowMinutes)) continue;
      if (result.confidence !== 'high') {
        console.warn(`Seat availability could not be verified; no alert: ${result.url}`);
        continue;
      }

      const groups = findAdjacentGroups(result.seats, config.minAdjacent, config.middlePercent);
      const fingerprint = groupsFingerprint(groups);
      const prior = state.sessions[result.url];

      if (!groups.length) {
        if (prior) delete state.sessions[result.url];
        console.log(`${result.date} ${formatClock(result.minutes)}: no verified qualifying groups.`);
        continue;
      }

      if (prior?.fingerprint === fingerprint) {
        console.log(`${result.date} ${formatClock(result.minutes)}: verified qualifying seats unchanged; suppressing duplicate alert.`);
        continue;
      }

      pendingAlerts.push({
        url: result.url,
        date: result.date,
        clock: formatClock(result.minutes),
        minutes: result.minutes,
        groupText: formatGroups(groups),
        fingerprint,
      });
    }

    pendingAlerts.sort((a, b) => a.date.localeCompare(b.date) || a.minutes - b.minutes);
    if (pendingAlerts.length) {
      const title = pendingAlerts.length === 1
        ? `🎟️ Odyssey IMAX 70mm seats: ${pendingAlerts[0].date} at ${pendingAlerts[0].clock}`
        : `🎟️ Odyssey IMAX 70mm seats: ${pendingAlerts.length} verified showtimes`;
      const sent = await sendGitHubAlert({ title, body: alertBody(pendingAlerts) });
      if (sent) {
        for (const alert of pendingAlerts) {
          state.sessions[alert.url] = { fingerprint: alert.fingerprint, lastSeen: scannedAt };
        }
        console.log(`Created one GitHub alert covering ${pendingAlerts.length} verified showtime(s).`);
      } else {
        console.warn('Alert delivery failed; verified matches will be retried next run.');
      }
    } else {
      console.log('No new verified qualifying availability to alert.');
    }

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
