import { describe, expect, it } from "vitest";
import {
  arrowHead,
  freedrawPoints,
  arrowHeadSize,
  fontSize,
  isMeaningful,
  normalizedBox,
  pointsToPolygon,
  strokeWidth,
  type Shape,
} from "@/lib/annotate";

const shape = (over: Partial<Shape> = {}): Shape => ({
  id: "s1",
  kind: "arrow",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 0,
  color: "#ff5c5c",
  ...over,
});

describe("normalizedBox", () => {
  it("normalizes a box dragged up and to the left", () => {
    expect(normalizedBox(shape({ kind: "rect", x1: 120, y1: 80, x2: 20, y2: 10 }))).toEqual({
      x: 20,
      y: 10,
      w: 100,
      h: 70,
    });
  });

  it("leaves a box dragged down and right alone", () => {
    expect(normalizedBox(shape({ kind: "rect", x1: 5, y1: 5, x2: 25, y2: 15 }))).toEqual({
      x: 5,
      y: 5,
      w: 20,
      h: 10,
    });
  });
});

describe("arrowHead", () => {
  it("puts the tip at the arrow's end point", () => {
    const [tip] = arrowHead(shape(), 20);
    expect(tip).toEqual([100, 0]);
  });

  it("points back along the shaft, symmetrically", () => {
    const [, left, right] = arrowHead(shape(), 20);
    expect(left[0]).toBeLessThan(100);
    expect(right[0]).toBeLessThan(100);
    expect(left[1]).toBeCloseTo(-right[1], 6);
  });

  it("follows the direction of a diagonal arrow", () => {
    const [, left, right] = arrowHead(shape({ x2: 100, y2: 100 }), 20);
    expect(left[0]).toBeLessThan(100);
    expect(right[1]).toBeLessThan(100);
  });
});

describe("scaling with the image", () => {
  it("grows stroke, head and type with width", () => {
    expect(strokeWidth(300)).toBeLessThan(strokeWidth(3000));
    expect(arrowHeadSize(300)).toBeLessThan(arrowHeadSize(3000));
    expect(fontSize(300)).toBeLessThan(fontSize(3000));
  });

  it("keeps a floor so a small image is still markable", () => {
    expect(strokeWidth(10)).toBeGreaterThanOrEqual(2);
    expect(arrowHeadSize(10)).toBeGreaterThanOrEqual(10);
    expect(fontSize(10)).toBeGreaterThanOrEqual(12);
  });
});

describe("isMeaningful", () => {
  it("rejects a stray tap", () => {
    expect(isMeaningful(shape({ x2: 2, y2: 2 }))).toBe(false);
  });

  it("accepts a real drag", () => {
    expect(isMeaningful(shape())).toBe(true);
  });

  it("judges text by its content, not its length", () => {
    expect(isMeaningful(shape({ kind: "text", x2: 0, text: "  " }))).toBe(false);
    expect(isMeaningful(shape({ kind: "text", x2: 0, text: "retry here" }))).toBe(true);
  });
});

describe("pointsToPolygon", () => {
  it("formats and rounds for SVG", () => {
    expect(pointsToPolygon([[1.234, 2], [3, 4.567]])).toBe("1.2,2 3,4.6");
  });
});

describe("freehand and line shapes", () => {
  it("needs more than a couple of points to count", () => {
    expect(isMeaningful(shape({ kind: "freedraw", points: [[0, 0], [1, 1]] }))).toBe(false);
    expect(isMeaningful(shape({ kind: "freedraw", points: [[0, 0], [5, 5], [9, 9]] }))).toBe(true);
  });

  it("formats a path for SVG", () => {
    expect(freedrawPoints(shape({ kind: "freedraw", points: [[1.26, 2], [3, 4]] }))).toBe("1.3,2 3,4");
  });

  it("treats a line like any other drag for the stray-tap check", () => {
    expect(isMeaningful(shape({ kind: "line", x2: 3, y2: 1 }))).toBe(false);
    expect(isMeaningful(shape({ kind: "line" }))).toBe(true);
  });
});
