export function parseRows(value = 'G,H,I,J,K,L,M') {
  return new Set(
    value
      .split(',')
      .map((row) => row.trim().toUpperCase())
      .filter(Boolean),
  );
}

export function parseClockMinutes(text) {
  if (!text) return null;
  const match = String(text).match(/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*([AP])\.?M\.?\b/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'P') hour += 12;
  return hour * 60 + Number(match[2]);
}

export function formatClock(minutes) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function dateInTimeZone(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function minutesInTimeZone(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export function addDays(yyyyMmDd, days) {
  const [year, month, day] = yyyyMmDd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function median(numbers) {
  const values = numbers.filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function mergeSeat(existing, incoming) {
  if (!existing) return incoming;
  const status =
    existing.status === 'unavailable' || incoming.status === 'unavailable'
      ? 'unavailable'
      : existing.status === 'available' || incoming.status === 'available'
        ? 'available'
        : 'unknown';
  const existingArea = existing.width * existing.height;
  const incomingArea = incoming.width * incoming.height;
  const geometry = incomingArea > 0 && (existingArea <= 0 || incomingArea < existingArea) ? incoming : existing;
  return { ...geometry, status, evidence: [...new Set([...(existing.evidence || []), ...(incoming.evidence || [])])] };
}

export function dedupeSeats(seats) {
  const map = new Map();
  for (const seat of seats) {
    const key = `${seat.row}${seat.number}`;
    map.set(key, mergeSeat(map.get(key), seat));
  }
  return [...map.values()];
}

/**
 * Find physically adjacent, consecutively numbered available seats.
 * Physical spacing is checked so consecutive numbers across a large aisle do not count.
 */
export function findAdjacentGroups(rawSeats, minAdjacent = 3, middlePercent = 50) {
  const seats = dedupeSeats(rawSeats);
  const rows = new Map();
  for (const seat of seats) {
    if (!rows.has(seat.row)) rows.set(seat.row, []);
    rows.get(seat.row).push(seat);
  }

  const groups = [];
  for (const [row, rowSeats] of rows.entries()) {
    const positioned = rowSeats
      .filter((seat) => Number.isFinite(seat.x) && Number.isFinite(seat.y) && seat.width > 0 && seat.height > 0)
      .sort((a, b) => a.x - b.x);
    if (positioned.length < minAdjacent) continue;

    const allGaps = [];
    for (let index = 1; index < positioned.length; index += 1) {
      const gap = positioned[index].x - positioned[index - 1].x;
      if (gap > 1) allGaps.push(gap);
    }
    const typicalGap = median(allGaps);
    if (!typicalGap) continue;
    const maxAdjacentGap = typicalGap * 1.72;

    // Keep only seats whose horizontal centers fall inside the requested central
    // portion of the complete row. For 50%, this removes the outer 25% on each side.
    const boundedMiddlePercent = Math.min(100, Math.max(1, Number(middlePercent) || 50));
    const outerFraction = (1 - boundedMiddlePercent / 100) / 2;
    const firstCenter = positioned[0].x;
    const lastCenter = positioned.at(-1).x;
    const rowSpan = lastCenter - firstCenter;
    const middleStart = firstCenter + rowSpan * outerFraction;
    const middleEnd = lastCenter - rowSpan * outerFraction;

    const available = positioned.filter((seat) => {
      if (seat.status !== 'available') return false;
      return seat.x >= middleStart && seat.x <= middleEnd;
    });
    let run = [];
    const flush = () => {
      if (run.length >= minAdjacent) {
        groups.push({
          row,
          seats: run.map((seat) => `${seat.row}${seat.number}`),
          first: run[0].number,
          last: run.at(-1).number,
        });
      }
      run = [];
    };

    for (const seat of available) {
      if (!run.length) {
        run = [seat];
        continue;
      }
      const previous = run.at(-1);
      const numberIsConsecutive = Math.abs(seat.number - previous.number) === 1;
      const physicallyAdjacent = seat.x - previous.x <= maxAdjacentGap;
      const sameVerticalBand = Math.abs(seat.y - previous.y) <= Math.max(seat.height, previous.height) * 0.8;
      if (numberIsConsecutive && physicallyAdjacent && sameVerticalBand) run.push(seat);
      else {
        flush();
        run = [seat];
      }
    }
    flush();
  }

  return groups.sort((a, b) => a.row.localeCompare(b.row) || a.first - b.first);
}

export function groupsFingerprint(groups) {
  return groups.map((group) => `${group.row}:${group.seats.join(',')}`).sort().join('|');
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
