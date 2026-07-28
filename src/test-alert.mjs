import { sendGitHubAlert } from './github-alert.mjs';

const sent = await sendGitHubAlert({
  title: '✅ Harkins seat monitor test notification',
  body: [
    '## Test successful',
    '',
    'GitHub issue notifications are configured for this repository.',
    '',
    'A real ticket alert is created only when one Odyssey IMAX 70mm showtime after 2:00 PM and no later than 11:00 PM has six middle-row tickets arranged as 6, 4+2, 3+3, or 2+2+2. Every block must contain at least two adjacent seats in the middle 50% of rows G–M.',
  ].join('\n'),
});

if (!sent) process.exitCode = 1;
