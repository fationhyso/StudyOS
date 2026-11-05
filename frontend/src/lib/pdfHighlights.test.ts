import { describe, expect, it } from 'vitest';
import { rotateRect } from './pdfHighlights';

describe('saved PDF highlight coordinates', () => {
  const rect = { x: .1, y: .2, width: .3, height: .05 };
  it.each([0, 90, 180, 270])('round trips a selection at %s degrees', rotation => {
    const canonical = rotateRect(rotateRect(rect, rotation), -rotation);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(canonical[key]).toBeCloseTo(rect[key]);
  });
  it('places the highlight over the same text after a quarter turn', () => {
    const result = rotateRect(rect, 90);
    expect(result.x).toBeCloseTo(.75);
    expect(result.y).toBeCloseTo(.1);
    expect(result.width).toBeCloseTo(.05);
    expect(result.height).toBeCloseTo(.3);
  });
});
