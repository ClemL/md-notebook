"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANNOTATION_COLORS,
  arrowHead,
  arrowHeadSize,
  fontSize,
  isMeaningful,
  newShapeId,
  normalizedBox,
  pointsToPolygon,
  strokeWidth,
  type Shape,
  type ShapeKind,
} from "@/lib/annotate";
import type { StoredImage } from "@/lib/image";

const TOOLS: { kind: ShapeKind; label: string }[] = [
  { kind: "arrow", label: "Arrow" },
  { kind: "rect", label: "Box" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "text", label: "Text" },
];

/** Renders one shape; shared by the editor and the read-only overlay on a cell. */
export function ShapeMark({ shape, imageWidth }: { shape: Shape; imageWidth: number }) {
  const width = strokeWidth(imageWidth);
  switch (shape.kind) {
    case "arrow":
      return (
        <g>
          <line
            x1={shape.x1}
            y1={shape.y1}
            x2={shape.x2}
            y2={shape.y2}
            stroke={shape.color}
            strokeWidth={width}
            strokeLinecap="round"
          />
          <polygon
            points={pointsToPolygon(arrowHead(shape, arrowHeadSize(imageWidth)))}
            fill={shape.color}
          />
        </g>
      );
    case "rect": {
      const b = normalizedBox(shape);
      return (
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          fill="none"
          stroke={shape.color}
          strokeWidth={width}
        />
      );
    }
    case "ellipse": {
      const b = normalizedBox(shape);
      return (
        <ellipse
          cx={b.x + b.w / 2}
          cy={b.y + b.h / 2}
          rx={b.w / 2}
          ry={b.h / 2}
          fill="none"
          stroke={shape.color}
          strokeWidth={width}
        />
      );
    }
    case "text": {
      if (!shape.text) return null;
      const size = fontSize(imageWidth);
      return (
        <text
          x={shape.x1}
          y={shape.y1 + size * 0.85}
          fill={shape.color}
          fontSize={size}
          fontWeight={600}
          fontFamily="ui-monospace, Menlo, Consolas, monospace"
          style={{ paintOrder: "stroke", stroke: "rgba(12,15,20,0.72)", strokeWidth: size * 0.4 }}
        >
          {shape.text}
        </text>
      );
    }
  }
}

/** Read-only overlay drawn over an image thumbnail or the lightbox. */
export function AnnotationLayer({ image }: { image: StoredImage }) {
  if (!image.annotations?.length) return null;
  return (
    <svg
      className="annotation-layer"
      viewBox={`0 0 ${image.width} ${image.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {image.annotations.map((s) => (
        <ShapeMark key={s.id} shape={s} imageWidth={image.width} />
      ))}
    </svg>
  );
}

/**
 * The built-in annotator: arrows, boxes, ellipses and text over the image, stored as shapes
 * rather than pixels. Pointer events cover mouse, pen and finger alike.
 */
export default function Annotator({
  image,
  onSave,
  onCancel,
}: {
  image: StoredImage;
  onSave: (shapes: Shape[]) => void;
  onCancel: () => void;
}) {
  const [shapes, setShapes] = useState<Shape[]>(image.annotations ?? []);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<ShapeKind>("arrow");
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  /** Pointer position in image-pixel space, whatever size the image is displayed at. */
  const toImage = useCallback(
    (e: React.PointerEvent): { x: number; y: number } => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || !rect.width) return { x: 0, y: 0 };
      return {
        x: ((e.clientX - rect.left) / rect.width) * image.width,
        y: ((e.clientY - rect.top) / rect.height) * image.height,
      };
    },
    [image.width, image.height],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const { x, y } = toImage(e);

    if (tool === "text") {
      const text = window.prompt("Label text");
      if (text?.trim()) {
        setShapes((prev) => [
          ...prev,
          { id: newShapeId(), kind: "text", x1: x, y1: y, x2: x, y2: y, color, text: text.trim() },
        ]);
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    setDraft({ id: newShapeId(), kind: tool, x1: x, y1: y, x2: x, y2: y, color });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const { x, y } = toImage(e);
    setDraft((d) => (d ? { ...d, x2: x, y2: y } : d));
  };

  const onPointerUp = () => {
    drawing.current = false;
    setDraft((d) => {
      if (d && isMeaningful(d)) setShapes((prev) => [...prev, d]);
      return null;
    });
  };

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Annotate image">
      <div className="editor-bar">
        <span className="editor-title">Draw</span>
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setTool(t.kind)}
            aria-pressed={tool === t.kind}
            className={tool === t.kind ? "primary" : undefined}
          >
            {t.label}
          </button>
        ))}
        <span className="swatches">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch${color === c ? " on" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
            />
          ))}
        </span>
        <span className="spacer" />
        <button onClick={() => setShapes((prev) => prev.slice(0, -1))} disabled={!shapes.length}>
          Undo
        </button>
        <button onClick={() => setShapes([])} disabled={!shapes.length}>
          Clear
        </button>
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onSave(shapes)}>
          Save
        </button>
      </div>

      <div className="editor-stage">
        <div className="editor-canvas" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.dataUrl} alt="" draggable={false} />
          <svg
            ref={svgRef}
            className="annotation-layer editing"
            viewBox={`0 0 ${image.width} ${image.height}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {shapes.map((s) => (
              <ShapeMark key={s.id} shape={s} imageWidth={image.width} />
            ))}
            {draft && <ShapeMark shape={draft} imageWidth={image.width} />}
          </svg>
        </div>
      </div>
    </div>
  );
}
