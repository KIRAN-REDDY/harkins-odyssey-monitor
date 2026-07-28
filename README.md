# Harkins Odyssey IMAX 70mm Seat Monitor — authoritative availability version

This version fixes the false-positive bug in the earlier monitor.

The earlier version treated a seat-shaped clickable element as available when Harkins did not expose a readable DOM status. Because sold/unavailable seats can still be rendered as interactive SVG/button elements, that logic could incorrectly label the entire auditorium as open.

This version **fails closed**. It sends an alert only when all of these conditions are met:

- the show is **The Odyssey (IMAX 70mm)** at Harkins Arizona Mills 18;
- the showtime is strictly **after 2:00 PM**;
- Harkins' live Vista `seat-availability` response explicitly reports each seat as **`Available`**;
- the availability record is matched by `seatId` to the official Vista auditorium `seat-layout` response;
- at least **3 consecutive seats** are physically adjacent;
- the seats are in rows **G through M**;
- the complete group is within the **middle 50%** of its row.

`Sold`, `Broken`, and `House` are always treated as unavailable. Unknown statuses, missing API responses, schema changes, blocks, and CAPTCHAs produce **no alert** and a diagnostic artifact instead.

The monitor never logs in, reserves, holds, or purchases tickets.

## Alerts

The workflow creates one private GitHub issue per scan, even when multiple qualifying showtimes are found. This prevents dozens of separate emails. It assigns and mentions `@KIRAN-REDDY`, so GitHub sends the notification to the verified email selected in the account's notification settings.

No Gmail password, SMTP credential, Telegram token, or repository secret is required.

## Schedule

- Today through day 6: every 10 minutes.
- Days 7 through 44: once per hour.
- Manual runs default to 7 days rather than 45.

## Update an existing repository

Replace the repository's files with this package, commit, and push. The included state format is version 2, so fingerprints created by the old false-positive parser are automatically discarded.

## First validation run

In GitHub:

1. Open **Actions → Harkins Odyssey Seat Monitor**.
2. Select **Run workflow**.
3. Leave **Create a setup test notification** unchecked.
4. Use **7** scan days.
5. Run it.

Expected behavior:

- A ticket alert is created only when verified qualifying seats exist.
- If Harkins data cannot be verified, no ticket alert is created.
- Diagnostics are uploaded to the workflow run under **Artifacts**.

## Configuration

| Variable | Default | Meaning |
|---|---:|---|
| `ROWS` | `G,H,I,J,K,L,M` | Allowed rows |
| `MIN_ADJACENT` | `3` | Minimum consecutive seats |
| `MIDDLE_PERCENT` | `50` | Allowed central portion of each row |
| `AFTER_MINUTES` | `840` | Strict cutoff; 840 is 2:00 PM |
| `EXCLUDE_ACCESSIBLE` | `true` | Exclude wheelchair and companion seats |
| `SESSION_CONCURRENCY` | `3` | Parallel session pages |
| `ALERT_GITHUB_USER` | `KIRAN-REDDY` | Account assigned and mentioned |

## Diagnostics

The workflow uploads screenshots, HTML, and JSON metadata when the authoritative Vista responses are absent, blocked, mismatched, or changed. The monitor does not fall back to guessing from seat colors or clickability.
