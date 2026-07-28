# Harkins Odyssey IMAX 70mm Seat Monitor

This Playwright monitor checks **The Odyssey (IMAX 70mm)** at **Harkins Arizona Mills 18** and alerts only when it confidently detects:

- a showtime strictly **after 2:00 PM**;
- **3 or more consecutive, physically adjacent seats**;
- in rows **G through M**;
- with the **entire adjacent group inside the middle 50% of its row** (the outer 25% on each side is ignored);
- on any date within the configured forward-looking window.

It does **not** log in, solve CAPTCHAs, reserve, hold, or purchase tickets. If Harkins blocks the cloud browser or changes its seat-map markup, the run saves screenshots/HTML under the workflow's diagnostic artifact and does not send a guess-based alert.

## How the credential-free email alert works

The workflow creates a private GitHub issue, assigns it to **@KIRAN-REDDY**, and mentions that account. GitHub then sends the issue notification to the verified email address configured for the GitHub account.

No Gmail password, app password, SMTP credential, Telegram token, or third-party email key is stored in the repository. GitHub Actions supplies its own temporary `GITHUB_TOKEN` automatically for each run.

The email comes from GitHub Notifications rather than directly from this script. Its subject will include the generated issue title, such as:

`🎟️ Odyssey IMAX 70mm seats: 2026-08-02 at 6:00 PM`

## Why it runs without your Mac

GitHub Actions supplies a temporary cloud computer for each check. The included workflow scans:

- today through day 6 every 10 minutes;
- days 7 through 44 once per hour;
- any custom range when you run it manually.

GitHub schedules can run late, so this is frequent monitoring rather than a guaranteed real-time feed.

## 1. Put this project in your private repository

Use this repository:

`KIRAN-REDDY/harkins-odyssey-monitor`

1. Create it as a **private** repository if it does not already exist.
2. Unzip this project and upload all files, including `.github/workflows/monitor.yml`.
3. Commit them to the default branch.

The monitor keeps duplicate-alert state in a private GitHub issue named **“Harkins Odyssey monitor state — do not delete.”**

## 2. Enable GitHub email notifications

1. In GitHub, open **Settings → Notifications**.
2. Under **Subscriptions**, make sure **Email** is enabled for **Participating, @mentions and custom**.
3. Confirm that the email address selected there is verified and is the address where you want ticket alerts.

No repository secrets need to be added.

## 3. Test the notification

1. Open your repository.
2. Select **Actions → Harkins Odyssey Seat Monitor**.
3. Select **Run workflow**.
4. Leave **Create a setup test notification** checked.
5. Run it.

The workflow creates an issue titled **“✅ Harkins seat monitor test notification”**, assigns it to **@KIRAN-REDDY**, and mentions the account. GitHub should then email the account according to its notification settings.

The test issue does not mean seats were found. You may close it after confirming delivery.

## Configuration

Edit the workflow environment variables to change behavior:

| Variable | Default | Meaning |
|---|---:|---|
| `ROWS` | `G,H,I,J,K,L,M` | Allowed rows |
| `MIN_ADJACENT` | `3` | Minimum adjacent seat count |
| `MIDDLE_PERCENT` | `50` | Central percentage of each full row allowed; 50 excludes the outer 25% on each side |
| `AFTER_MINUTES` | `840` | Strict cutoff in minutes after midnight; 840 = 2:00 PM |
| `EXCLUDE_ACCESSIBLE` | `true` | Avoid wheelchair/companion seats |
| `SESSION_CONCURRENCY` | `3` | Parallel session pages; keep low to reduce load |
| `ALERT_GITHUB_USER` | `KIRAN-REDDY` | GitHub account assigned and mentioned in alert issues |

## Diagnostics and selector changes

When extraction confidence is low, the workflow uploads a **harkins-debug** artifact containing a screenshot, HTML, and metadata. This prevents false alerts.

To inspect one exact ticketing URL locally or in a manual cloud run:

```bash
npm install
npx playwright install chromium
npm run inspect -- "PASTE_EXACT_HARKINS_TICKETING_URL"
```

The script recognizes seat IDs from accessible labels, titles, seat data attributes, button text, and common SVG seat elements. It uses both consecutive seat numbers and their on-screen spacing so it will not normally treat seats separated by a large aisle as side by side. It determines the middle 50% from the horizontal span of all detected seats in each row, then requires every seat in a qualifying group to fall inside that central band.

## Practical limits

- Harkins can change the site or block data-center browsers at any time.
- GitHub scheduled workflows may be delayed.
- A seat can disappear between the notification and opening the booking page.
- Private-repository GitHub Actions usage counts against the plan's included Actions minutes.
- Do not shorten the interval aggressively or increase concurrency significantly.
