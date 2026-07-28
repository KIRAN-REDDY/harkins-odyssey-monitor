import { chromium } from 'playwright';
import { findAdjacentGroups, parseRows } from './lib.mjs';
import { inspectSession } from './harkins.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: npm run inspect -- "https://harkins.com/ticketing/..."');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, timezoneId: 'America/Phoenix' });
try {
  const result = await inspectSession(context, { url }, {
    allowedRows: parseRows(process.env.ROWS || 'G,H,I,J,K,L,M'),
    excludeAccessible: process.env.EXCLUDE_ACCESSIBLE !== 'false',
  });
  const groups = findAdjacentGroups(
    result.seats || [],
    Number(process.env.MIN_ADJACENT || 3),
    Number(process.env.MIDDLE_PERCENT || 50),
  );
  console.log(JSON.stringify({ ...result, seats: undefined, seatCandidateCount: result.seats?.length || 0, groups }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
