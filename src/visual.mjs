function legendLooksValid(legend) {
  // These checks deliberately fail closed if Harkins changes the legend art.
  return (
    legend.rocker.red >= 0.20 &&
    legend.rocker.gray <= 0.08 &&
    legend.unavailable.gray >= 0.08 &&
    Math.max(legend.wheelchair.blue, legend.companion.blue) >= 0.20
  );
}

function classifySeat(features) {
  // Accessible icons are blue. They are never considered available.
  if (features.blue >= 0.14) return 'accessible';

  // The Odyssey's unavailable icon is a pale helmet/skull with a small red crest.
  // It has a large gray/bright area, unlike the red Ultimate Rocker icon.
  if (features.gray >= 0.11 && features.bright >= 0.12) return 'unavailable';

  // A normal available seat is the red Ultimate Rocker icon. Require a strong
  // red signal and almost no pale helmet pixels to avoid false positives.
  if (features.red >= 0.14 && features.gray <= 0.075 && features.blue <= 0.10) return 'available';

  return 'unknown';
}

async function analyzeScreenshot(page, buffer, crops = null) {
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
  return page.evaluate(async ({ source, requestedCrops }) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const featureVector = (crop) => {
      const x0 = crop ? clamp(Math.floor(crop.x), 0, canvas.width) : 0;
      const y0 = crop ? clamp(Math.floor(crop.y), 0, canvas.height) : 0;
      const x1 = crop ? clamp(Math.ceil(crop.x + crop.width), 0, canvas.width) : canvas.width;
      const y1 = crop ? clamp(Math.ceil(crop.y + crop.height), 0, canvas.height) : canvas.height;
      let count = 0;
      let red = 0;
      let gray = 0;
      let blue = 0;
      let bright = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const r = pixels[offset];
          const g = pixels[offset + 1];
          const b = pixels[offset + 2];
          const a = pixels[offset + 3];
          if (a < 32) continue;
          count += 1;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (r > 70 && r > g * 1.35 && r > b * 1.10) red += 1;
          if (r > 80 && g > 80 && b > 80 && max - min < 55) gray += 1;
          if (b > 65 && b > r * 1.35 && b > g * 1.15) blue += 1;
          if (max > 95) bright += 1;
        }
      }
      if (!count) return { pixels: 0, red: 0, gray: 0, blue: 0, bright: 0 };
      return {
        pixels: count,
        red: red / count,
        gray: gray / count,
        blue: blue / count,
        bright: bright / count,
      };
    };

    return (requestedCrops || [null]).map(featureVector);
  }, { source: dataUrl, requestedCrops: crops });
}

async function screenshotFeature(page, locator) {
  const buffer = await locator.screenshot({ animations: 'disabled' });
  return (await analyzeScreenshot(page, buffer))[0];
}

export async function extractVisualSeats(page, { allowedRows, excludeAccessible = true }) {
  const map = page.locator('[data-testid="auditorium-container"]').first();
  if (!(await map.isVisible().catch(() => false))) {
    return {
      seats: [],
      confidence: 'none',
      diagnostics: { reason: 'Rendered auditorium container was not visible.' },
    };
  }

  const rocker = page.locator('[data-testid="seating-rocker"]').first();
  const unavailable = page.locator('img[alt*="unavailable" i]').first();
  const wheelchair = page.locator('[data-testid="seating-accessible"]').first();
  const companion = page.locator('[data-testid="companion-seat"]').first();
  const requiredLegend = [rocker, unavailable, wheelchair, companion];
  if (!(await Promise.all(requiredLegend.map((item) => item.isVisible().catch(() => false)))).every(Boolean)) {
    return {
      seats: [],
      confidence: 'none',
      diagnostics: { reason: 'One or more seat legend icons were missing.' },
    };
  }

  const legend = {
    rocker: await screenshotFeature(page, rocker),
    unavailable: await screenshotFeature(page, unavailable),
    wheelchair: await screenshotFeature(page, wheelchair),
    companion: await screenshotFeature(page, companion),
  };
  if (!legendLooksValid(legend)) {
    return {
      seats: [],
      confidence: 'none',
      diagnostics: { reason: 'Seat legend did not match the expected visual signatures.', legend },
    };
  }

  const mapBox = await map.boundingBox();
  const mapBuffer = await map.screenshot({ animations: 'disabled' });
  if (!mapBox || mapBox.width <= 0 || mapBox.height <= 0) {
    return {
      seats: [],
      confidence: 'none',
      diagnostics: { reason: 'Seat-map geometry was unavailable.' },
    };
  }

  const records = await page.locator('[data-testid="auditorium-container"] button[id]').evaluateAll(
    (buttons, rows) => {
      const allowed = new Set(rows);
      return buttons.map((button) => {
        const match = String(button.id || '').match(/^([A-Z]+)(\d{1,3})$/i);
        if (!match || !allowed.has(match[1].toUpperCase())) return null;
        const rect = button.getBoundingClientRect();
        return {
          row: match[1].toUpperCase(),
          number: Number(match[2]),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
        };
      }).filter(Boolean);
    },
    [...allowedRows],
  );

  const imageDimensions = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, `data:image/png;base64,${mapBuffer.toString('base64')}`);
  const scaleX = imageDimensions.width / mapBox.width;
  const scaleY = imageDimensions.height / mapBox.height;
  const padCss = 4;
  const crops = records.map((record) => ({
    x: (record.left - mapBox.x - padCss) * scaleX,
    y: (record.top - mapBox.y - padCss) * scaleY,
    width: (record.width + padCss * 2) * scaleX,
    height: (record.height + padCss * 2) * scaleY,
  }));
  const featureVectors = await analyzeScreenshot(page, mapBuffer, crops);

  const seats = [];
  const counts = { available: 0, unavailable: 0, accessible: 0, unknown: 0 };
  const samples = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const features = featureVectors[index];
    const visualStatus = classifySeat(features);
    counts[visualStatus] += 1;
    if (samples.length < 12 || visualStatus === 'available') {
      samples.push({ seat: `${record.row}${record.number}`, visualStatus, features });
    }

    const status = visualStatus === 'available' ? 'available' : 'unavailable';
    seats.push({
      row: record.row,
      number: record.number,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      status: excludeAccessible && visualStatus === 'accessible' ? 'unavailable' : status,
      evidence: [
        `Rendered icon=${visualStatus}`,
        `red=${features.red.toFixed(3)} gray=${features.gray.toFixed(3)} blue=${features.blue.toFixed(3)} bright=${features.bright.toFixed(3)}`,
      ],
    });
  }

  const known = counts.available + counts.unavailable + counts.accessible;
  const knownRatio = records.length ? known / records.length : 0;
  const highConfidence = records.length >= 3 && knownRatio >= 0.90;

  return {
    seats: highConfidence ? seats : [],
    confidence: highConfidence ? 'high' : known ? 'low' : 'none',
    diagnostics: {
      method: 'rendered-seat-icon-classification',
      recordCount: records.length,
      counts,
      knownRatio,
      legend,
      samples: samples.slice(0, 40),
    },
  };
}

export const _test = { classifySeat, legendLooksValid };
