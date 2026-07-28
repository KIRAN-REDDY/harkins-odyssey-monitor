# Harkins Odyssey IMAX 70mm Seat Monitor — six-ticket rule

This cloud Playwright monitor checks **The Odyssey (IMAX 70mm)** at Harkins Arizona Mills 18 while your Mac is off. It reads Harkins’ verified live availability data when exposed; otherwise it verifies the actual rendered seat icons. It fails closed when availability is ambiguous and never selects, holds, reserves, or purchases seats.

## Current alert rule

An alert is created only when one showtime satisfies **all** of these conditions:

- showtime is strictly **after 2:00 PM** and no later than **11:00 PM**;
- exactly **6 tickets** can be chosen using one of these arrangements:
  - **6 together**;
  - **4 together + 2 together**;
  - **3 together + 3 together**;
  - **2 together + 2 together + 2 together**;
- every block contains at least **2 physically adjacent, consecutively numbered seats**;
- every selected seat is in rows **G through M**;
- every selected block is entirely inside the row’s **middle 50%**;
- wheelchair and accessible-companion seats are excluded.

A longer available run may be used. For example, a run of 7 seats can supply the required 6, and a run of 5 plus a pair can supply 4+2. Isolated single seats never count.

## Alerts

The workflow creates a private GitHub issue only when the rule is met. It assigns and mentions `@KIRAN-REDDY`, allowing GitHub to email the verified address selected in the account’s notification settings.

No Gmail password, SMTP credential, Telegram token, or custom repository secret is required.

## Schedule

- Today through day 6: every 10 minutes.
- Days 7 through 44: once per hour.
- Manual runs default to 7 days.

## Update the existing repository

Replace the repository files with this package, commit, and push. The state format is version 4, so alerts saved under earlier rule engines will not suppress a valid six-ticket alert.

## Validation

The unit tests cover:

- 6;
- 4+2;
- 3+3;
- 2+2+2;
- longer runs used as subsets;
- rejection of fewer than six usable seats;
- rejection of isolated single seats;
- middle-50% filtering;
- the after-2:00-PM through 11:00-PM time window;
- unavailable and ambiguous rendered-seat icons.

Run locally with:

```bash
npm test
```

Run a one-day GitHub test without sending a setup notification:

```bash
gh workflow run monitor.yml \
  -R KIRAN-REDDY/harkins-odyssey-monitor \
  -f start_offset_days=0 \
  -f scan_days=1 \
  -f send_test_notification=false
```

## Configuration

| Variable | Default | Meaning |
|---|---:|---|
| `ROWS` | `G,H,I,J,K,L,M` | Allowed rows |
| `TOTAL_TICKETS` | `6` | Total tickets required in one showtime |
| `MIN_BLOCK_SIZE` | `2` | Minimum adjacent seats in every block |
| `MIDDLE_PERCENT` | `50` | Allowed central portion of each row |
| `AFTER_MINUTES` | `840` | Showtime must be strictly later than 2:00 PM |
| `LAST_SHOW_MINUTES` | `1380` | Latest accepted showtime is 11:00 PM |
| `EXCLUDE_ACCESSIBLE` | `true` | Exclude wheelchair and companion seats |
| `SESSION_CONCURRENCY` | `3` | Parallel session pages |
| `ALERT_GITHUB_USER` | `KIRAN-REDDY` | Account assigned and mentioned |

## Diagnostics

When verification fails, the workflow uploads screenshots, HTML, and JSON metadata under the run’s **Artifacts** section. Missing data, CAPTCHAs, blocks, unknown icons, or markup changes produce no ticket alert.

## Temporary release schedule (Phoenix time)

- Wednesday, July 29, 2026: every 10 minutes, scanning August 21 through September 11.
- Thursday, July 30 through Friday, September 11, 2026: every 4 hours, scanning a rolling 45-day window.
- The date-specific cron entries should be removed or replaced after September 11 if monitoring should continue.
