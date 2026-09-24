import { describe, expect, it } from 'vitest';
import { computeSky, formatTimeOfDay, sunDirection, wrapTime } from '../src/core/sky';

const luminance = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('time of day', () => {
  it('moves the sun east → overhead → west and below the horizon at night', () => {
    expect(sunDirection(0.25)[1]).toBeCloseTo(0, 5);
    expect(sunDirection(0.25)[0]).toBeGreaterThan(0.9);
    expect(sunDirection(0.5)[1]).toBeGreaterThan(0.9);
    expect(sunDirection(0.75)[0]).toBeLessThan(-0.9);
    expect(sunDirection(0)[1]).toBeLessThan(-0.9);
    for (let t = 0; t < 1; t += 0.05) expect(Math.hypot(...sunDirection(t))).toBeCloseTo(1, 10);
  });

  it('lights the world with the sun by day and the dimmer moon by night', () => {
    const noon = computeSky(0.5), night = computeSky(0);
    expect(noon.lightDir).toEqual(noon.sunDir);
    expect(noon.lightIntensity).toBeGreaterThan(3);
    expect(night.lightDir[1]).toBeGreaterThan(0.9); // moon overhead
    expect(night.lightIntensity).toBeLessThan(0.5);
    expect(noon.daylight).toBe(1);
    expect(night.daylight).toBe(0);
    expect(night.starVisibility).toBe(1);
    expect(noon.starVisibility).toBe(0);
  });

  it('shifts the two-colour sky gradient with the sun angle', () => {
    const noon = computeSky(0.5), dusk = computeSky(0.755), night = computeSky(0);
    expect(luminance(noon.zenith)).toBeGreaterThan(luminance(night.zenith) * 10);
    // Twilight horizon is warm (red > blue); midday horizon is blue.
    expect(dusk.horizon[0]).toBeGreaterThan(dusk.horizon[2]);
    expect(noon.horizon[2]).toBeGreaterThan(noon.horizon[0]);
    expect(dusk.sunColor[2]).toBeLessThan(noon.sunColor[2]);
  });

  it('changes continuously over the day', () => {
    let prev = computeSky(0);
    for (let t = 0.001; t <= 1; t += 0.001) {
      const cur = computeSky(t);
      expect(Math.abs(luminance(cur.zenith) - luminance(prev.zenith))).toBeLessThan(0.02);
      expect(Math.abs(cur.daylight - prev.daylight)).toBeLessThan(0.04);
      prev = cur;
    }
  });

  it('formats clock time and phase', () => {
    expect(formatTimeOfDay(0.5)).toBe('12:00 Day');
    expect(formatTimeOfDay(0)).toBe('00:00 Night');
    expect(formatTimeOfDay(0.26)).toMatch(/^06:14 Dawn$/);
    expect(formatTimeOfDay(0.76)).toMatch(/^18:14 Dusk$/);
    expect(wrapTime(1.25)).toBeCloseTo(0.25);
    expect(wrapTime(-0.25)).toBeCloseTo(0.75);
  });
});
