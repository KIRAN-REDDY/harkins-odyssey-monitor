# Harkins Odyssey IMAX 70mm Seat Monitor — verified rendered-seat version

This version fixes both problems found in the earlier releases:

1. Harkins renders sold seats as ordinary focusable `<button>` elements, so clickability cannot be used as proof of availability.
2. On the captured Harkins pages, the live Vista payload was not exposed as readable JSON, even though the rendered seat map loaded correctly.

The monitor now uses two fail-closed verification paths:

- **Preferred:** Harkins/Vista live seat availability when a readable authoritative payload is exposed.
- **Fallback:** the actual rendered seat icon. A red **Ultimate Rocker** icon is available; the Odyssey helmet/skull icon is unavailable; blue accessibility icons are excluded. The script calibrates against the legend shown on the same live page and sends no alert if the legend or seat icons are ambiguous.

It does **not** select, reserve, hold, or purchase seats.

An alert is sent only when all of these conditions are met:

- the movie is **The Odyssey (IMAX 70mm)** at Harkins Arizona Mills 18;
- the showtime is strictly **after 2:00 PM**;
- at least **3 consecutively numbered and physically adjacent seats** are verified available;
- the seats are in rows **G through M**;
- the entire group is inside the row's **middle 50%**;
- wheelchair and accessible-companion seats are excluded.

Unknown icons, missing seat maps, CAPTCHAs, blocks, or markup changes produce **no ticket alert** and a diagnostic artifact instead.

## Alerts

The workflow creates one private GitHub issue per scan, even when multiple qualifying showtimes are found. It assigns and mentions `@KIRAN-REDDY`, so GitHub sends the notification to the verified email selected in your GitHub notification settings.

No Gmail password, SMTP credential, Telegram token, or repository secret is required.

## Schedule

- Today through day 6: every 10 minutes.
- Days 7 through 44: once per hour.
- Manual runs default to 7 days.

## Update the existing repository

Replace the repository files with this package, then commit and push. The state format is version 3, so fingerprints from older broken parsers are discarded automatically.

## First validation run

In GitHub:

1. Open **Actions → Harkins Odyssey Seat Monitor**.
2. Select **Run workflow**.
3. Leave **Create a setup test notification** unchecked.
4. Use **1** scan day for the first run.
5. Run it.

For the sold-out pages represented in the supplied diagnostics, the expected log is similar to:

```text
rendered-seat-icons; 0 verified available seat(s)
No new verified qualifying availability to alert.
```

No ticket email should be generated for that run.

## Configuration

| Variable | Default | Meaning |
|---|---:|---|
| `ROWS` | `G,H,I,J,K,L,M` | Allowed rows; Harkins has no row I in this auditorium |
| `MIN_ADJACENT` | `3` | Minimum consecutive seats |
| `MIDDLE_PERCENT` | `50` | Allowed central portion of each row |
| `AFTER_MINUTES` | `840` | Strict cutoff; 840 is 2:00 PM |
| `EXCLUDE_ACCESSIBLE` | `true` | Exclude wheelchair and companion seats |
| `SESSION_CONCURRENCY` | `3` | Parallel session pages |
| `ALERT_GITHUB_USER` | `KIRAN-REDDY` | Account assigned and mentioned |

## Diagnostics

When verification fails, the workflow uploads screenshots, HTML, and JSON metadata under the run's **Artifacts** section. The monitor never treats a generic button, cursor style, or seat label as availability.
