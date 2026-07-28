import { chromium } from 'playwright';
import { findTicketPlan, parseRows } from './lib.mjs';
import { inspectSession } from './harkins.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: npm run inspect -- <Harkins session URL>');
  process.exit(1);
}

const config = {
  allowedRows: parseRows(process.env.ROWS || 'G,H,I,J,K,L,M'),
  excludeAccessible: process.env.EXCLUDE_ACCESSIBLE !== 'false',
  middlePercent: Number(process.env.MIDDLE_PERCENT || 50),
  totalTickets: Number(process.env.TOTAL_TICKETS || 6),
  minBlockSize: Number(process.env.MIN_BLOCK_SIZE || 2),
};
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const result = await inspectSession(context, { url, anchorMinutes: null }, config);
const plan = result.confidence === 'high'
  ? findTicketPlan(result.seats, config.totalTickets, config.minBlockSize, config.middlePercent)
  : null;
console.log(JSON.stringify({ ...result, seats: undefined, plan }, null, 2));
await browser.close();
