import { sendGitHubAlert } from './github-alert.mjs';

const sent = await sendGitHubAlert({
  title: '✅ Harkins seat monitor test notification',
  body: [
    'This is a setup test. It does **not** mean qualifying seats were found.',
    '',
    'When the monitor finds 3 or more adjacent seats that are entirely within the middle 50% of rows G–M for an IMAX 70mm show after 2:00 PM, it will create a similar issue containing the date, showtime, seats, and booking link.',
  ].join('\n'),
});

if (!sent) process.exitCode = 1;
