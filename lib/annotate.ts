/**
 * Geometry for the built-in image annotator.
 *
 * Shapes are stored in image-pixel coordinates, never painted into the image, so the original
 * screenshot stays intact and an annotation can be removed later. The same geometry is used three
 * ways: rendered as SVG over the thumbnail, drawn in the editor, and painted onto a canvas when
 * the image is flattened for the clipboard.
 */

export type ShapeKind = "arrow" | "rect" | "ellipse" | "text";

export type Shape = {
  id: string;
  kind: ShapeKind;
  /** Start point, and for text the baseline anchor. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  text?: string;
};

export const ANNOTATION_COLORS = ["#ff5c5c", "#ffc93c", "#7cc4ff", "#8ce0a6", "#f2f5f9"] as const;

export function newShapeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Stroke and type scale with the image, so a 4K screenshot is not annotated in hairlines. */
export function strokeWidth(imageWidth: number): number {
  return Math.max(2, Math.round(imageWidth / 300));
}

export function fontSize(imageWidth: number): number {
  return Math.max(12, Math.round(imageWidth / 28));
}

/** Rectangles and ellipses are stored by their drag corners; drawing needs them normalized. */
export function normalizedBox(s: Shape): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(s.x1, s.x2),
    y: Math.min(s.y1, s.y2),
    w: Math.abs(s.x2 - s.x1),
    h: Math.abs(s.y2 - s.y1),
  };
}

/** The three points of an arrowhead at (x2,y2), pointing away from (x1,y1). */
export function arrowHead(s: Shape, size: number): [number, number][] {
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const spread = Math.PI / 7;
  return [
    [s.x2, s.y2],
    [s.x2 - size * Math.cos(angle - spread), s.y2 - size * Math.sin(angle - spread)],
    [s.x2 - size * Math.cos(angle + spread), s.y2 - size * Math.sin(angle + spread)],
  ];
}

export function arrowHeadSize(imageWidth: number): number {
  return Math.max(10, Math.round(imageWidth / 45));
}

/** A shape too small to see is a stray tap, not an annotation. */
export function isMeaningful(s: Shape): boolean {
  if (s.kind === "text") return !!s.text?.trim();
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 6;
}

export function pointsToPolygon(points: [number, number][]): string {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Paints the annotations onto a 2D context already holding the image. */
export function drawShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  imageWidth: number,
): void {
  const width = strokeWidth(imageWidth);
  const head = arrowHeadSize(imageWidth);
  const size = fontSize(imageWidth);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of shapes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = width;

    switch (s.kind) {
      case "arrow": {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        const [a, b, c] = arrowHead(s, head);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "rect": {
        const b = normalizedBox(s);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        break;
      }
      case "ellipse": {
        const b = normalizedBox(s);
        ctx.beginPath();
        ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "text": {
        if (!s.text) break;
        ctx.font = `600 ${size}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textBaseline = "top";
        // A dark plate keeps light text legible over a light screenshot.
        const metrics = ctx.measureText(s.text);
        const pad = size * 0.25;
        ctx.fillStyle = "rgba(12, 15, 20, 0.72)";
        ctx.fillRect(s.x1 - pad, s.y1 - pad, metrics.width + pad * 2, size + pad * 2);
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, s.x1, s.y1);
        break;
      }
    }
  }
}
