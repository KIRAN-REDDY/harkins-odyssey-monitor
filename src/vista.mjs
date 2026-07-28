function walk(value, visit, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, seen);
    return;
  }
  for (const child of Object.values(value)) walk(child, visit, seen);
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'available') return 'available';
  if (['sold', 'broken', 'house'].includes(status)) return 'unavailable';
  return 'unknown';
}

function numericSeatLabel(value) {
  const match = String(value ?? '').trim().match(/^\d{1,3}$/);
  return match ? Number(match[0]) : null;
}

function layoutCandidates(payload) {
  const candidates = [];
  walk(payload, (object) => {
    const layout = object.seatLayout && typeof object.seatLayout === 'object'
      ? object.seatLayout
      : object;
    if (!Array.isArray(layout.areas)) return;

    const seats = [];
    for (const area of layout.areas) {
      if (!Array.isArray(area?.rows)) continue;
      for (const row of area.rows) {
        if (!Array.isArray(row?.seats)) continue;
        for (const seat of row.seats) {
          const id = String(seat?.id || '').trim();
          const rowLabel = String(seat?.rowLabel || row?.label || '').trim().toUpperCase();
          const number = numericSeatLabel(seat?.label);
          const columnNumber = Number(seat?.position?.columnNumber);
          const rowNumber = Number(seat?.position?.rowNumber ?? row?.number);
          if (!id || !rowLabel || !Number.isInteger(number)) continue;
          if (!Number.isFinite(columnNumber) || !Number.isFinite(rowNumber)) continue;
          seats.push({
            id,
            row: rowLabel,
            number,
            x: columnNumber,
            y: rowNumber,
            width: 1,
            height: 1,
            type: String(seat?.type || 'Normal'),
          });
        }
      }
    }
    if (seats.length) candidates.push(seats);
  });
  return candidates;
}

function availabilityCandidates(payload) {
  const candidates = [];
  walk(payload, (object) => {
    if (!Array.isArray(object.seatAvailabilities)) return;
    const records = object.seatAvailabilities
      .map((item) => ({
        seatId: String(item?.seatId || '').trim(),
        rawStatus: String(item?.status || '').trim(),
        status: normalizeStatus(item?.status),
      }))
      .filter((item) => item.seatId);
    if (!records.length) return;
    candidates.push({
      records,
      isSoldOut: object.isSoldOut === true,
      summaryAvailableCount: Number(object?.summary?.availableCount),
    });
  });
  return candidates;
}

function chooseBestPair(layouts, availabilities) {
  let best = null;
  for (const layout of layouts) {
    const ids = new Set(layout.map((seat) => seat.id));
    for (const availability of availabilities) {
      const matched = availability.records.filter((record) => ids.has(record.seatId)).length;
      if (!best || matched > best.matched) best = { layout, availability, matched };
    }
  }
  return best;
}

/**
 * Parse Vista's authoritative seat-layout and seat-availability responses.
 * Fails closed: no "available" seat is emitted unless Vista explicitly reports
 * that exact seatId with status "Available".
 */
export function extractVistaSeats(captures, { allowedRows, excludeAccessible = true }) {
  const layouts = [];
  const availabilities = [];
  const sourceUrls = [];

  for (const capture of captures) {
    if (!capture?.json) continue;
    const captureLayouts = layoutCandidates(capture.json);
    const captureAvailabilities = availabilityCandidates(capture.json);
    if (captureLayouts.length || captureAvailabilities.length) sourceUrls.push(capture.url);
    layouts.push(...captureLayouts);
    availabilities.push(...captureAvailabilities);
  }

  const pair = chooseBestPair(layouts, availabilities);
  if (!pair) {
    return {
      seats: [],
      confidence: 'none',
      diagnostics: {
        reason: 'No matching Vista seat-layout and seat-availability payloads were captured.',
        layoutPayloads: layouts.length,
        availabilityPayloads: availabilities.length,
        sourceUrls,
      },
    };
  }

  const availabilityById = new Map(pair.availability.records.map((record) => [record.seatId, record]));
  const allowedLayoutSeats = pair.layout.filter((seat) => allowedRows.has(seat.row));
  const matchedAllowedSeats = allowedLayoutSeats.filter((seat) => availabilityById.has(seat.id));
  const knownStatuses = matchedAllowedSeats.filter((seat) => availabilityById.get(seat.id).status !== 'unknown');
  const matchRatio = allowedLayoutSeats.length ? matchedAllowedSeats.length / allowedLayoutSeats.length : 0;
  const knownRatio = matchedAllowedSeats.length ? knownStatuses.length / matchedAllowedSeats.length : 0;

  // Require strong agreement between the static layout and the live availability
  // response. If Harkins/Vista changes schema, this deliberately sends no alert.
  const highConfidence =
    allowedLayoutSeats.length >= 3 &&
    matchedAllowedSeats.length >= 3 &&
    matchRatio >= 0.9 &&
    knownRatio === 1;

  const seats = highConfidence
    ? matchedAllowedSeats.map((seat) => {
        const availability = availabilityById.get(seat.id);
        const excluded = excludeAccessible && /wheelchair|companion/i.test(seat.type);
        return {
          row: seat.row,
          number: seat.number,
          x: seat.x,
          y: seat.y,
          width: seat.width,
          height: seat.height,
          status: excluded ? 'unavailable' : availability.status,
          evidence: [`Vista seatId=${seat.id} status=${availability.rawStatus} type=${seat.type}`],
        };
      })
    : [];

  return {
    seats,
    confidence: highConfidence ? 'high' : matchedAllowedSeats.length ? 'low' : 'none',
    diagnostics: {
      layoutSeatCount: pair.layout.length,
      allowedLayoutSeatCount: allowedLayoutSeats.length,
      availabilityRecordCount: pair.availability.records.length,
      matchedAllowedSeatCount: matchedAllowedSeats.length,
      matchRatio,
      knownStatusRatio: knownRatio,
      isSoldOut: pair.availability.isSoldOut,
      summaryAvailableCount: Number.isFinite(pair.availability.summaryAvailableCount)
        ? pair.availability.summaryAvailableCount
        : null,
      sourceUrls,
    },
  };
}

export const _test = { normalizeStatus, layoutCandidates, availabilityCandidates };
