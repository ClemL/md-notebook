"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANNOTATION_COLORS,
  arrowHead,
  arrowHeadSize,
  fontSize,
  freedrawPoints,
  isMeaningful,
  newShapeId,
  normalizedBox,
  pointsToPolygon,
  strokeWidth,
  type Shape,
  type ShapeKind,
} from "@/lib/annotate";
import type { StoredImage } from "@/lib/image";

/**
 * Excalidraw's own tool keys, so the muscle memory carries over. Deliberately a subset:
 * ellipse, freehand, diamond and the rest are left to Excalidraw itself. Shapes of those
 * kinds still render if an older annotation holds them; they just cannot be drawn here.
 */
const TOOLS: { kind: ShapeKind; label: string; keys: string[] }[] = [
  { kind: "rect", label: "Box", keys: ["r", "2"] },
  { kind: "arrow", label: "Arrow", keys: ["a", "5"] },
  { kind: "line", label: "Line", keys: ["l", "6"] },
  { kind: "text", label: "Text", keys: ["t", "8"] },
];

const TOOL_BY_KEY = new Map(TOOLS.flatMap((t) => t.keys.map((k) => [k, t.kind] as const)));

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
    case "line":
      return (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={shape.color}
          strokeWidth={width}
          strokeLinecap="round"
        />
      );
    case "freedraw":
      return (
        <polyline
          points={freedrawPoints(shape)}
          fill="none"
          stroke={shape.color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
 * The built-in annotator: arrows, lines, boxes, ellipses, freehand and text over the image,
 * stored as shapes rather than pixels. Tool keys match Excalidraw's.
 */
export default function Annotator({
  image,
  variant = "overlay",
  initialShapes,
  onSave,
  onCancel,
  onExpand,
}: {
  image: StoredImage;
  /** "overlay" fills the window; "inline" edits in place inside the entry. */
  variant?: "overlay" | "inline";
  /** Unsaved shapes carried over from another editor; defaults to the stored annotations. */
  initialShapes?: Shape[];
  onSave: (shapes: Shape[]) => void;
  onCancel: () => void;
  /** Inline only: move the work in progress to the full-window editor. */
  onExpand?: (shapes: Shape[]) => void;
}) {
  const inline = variant === "inline";
  const [shapes, setShapes] = useState<Shape[]>(initialShapes ?? image.annotations ?? []);
  const [undone, setUndone] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<ShapeKind>("rect");
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0]);
  const [typing, setTyping] = useState<{ x: number; y: number; value: string } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const drawing = useRef(false);

  const commit = useCallback((shape: Shape) => {
    setShapes((prev) => [...prev, shape]);
    setUndone([]);
  }, []);

  const undo = useCallback(() => {
    setShapes((prev) => {
      if (!prev.length) return prev;
      setUndone((u) => [prev[prev.length - 1], ...u]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setUndone((u) => {
      if (!u.length) return u;
      setShapes((prev) => [...prev, u[0]]);
      return u.slice(1);
    });
  }, []);

  /* --------------------------------------------------------------- keyboard */

  useEffect(() => {
    // Capture phase: the notebook's own single-key shortcuts listen on window, and must not
    // fire for keys typed at this editor.
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        if (typing) setTyping(null);
        else onCancel();
        return;
      }
      if (inField) return;

      if (mod && e.key.toLowerCase() === "z") {
        e.stopPropagation();
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key === "Enter") {
        e.stopPropagation();
        e.preventDefault();
        onSave(shapes);
        return;
      }
      if (mod || e.altKey) return;

      const next = TOOL_BY_KEY.get(e.key.toLowerCase());
      if (next) {
        e.stopPropagation();
        e.preventDefault();
        setTool(next);
        return;
      }
      // Swallow anything else single-key so it cannot reach the notebook behind the editor.
      if (e.key.length === 1) e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel, onSave, redo, shapes, typing, undo]);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  /* ---------------------------------------------------------------- drawing */

  /** Pointer position in image-pixel space, whatever size the image is displayed at. */
  const toImage = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || !rect.width) return { x: 0, y: 0 };
      return {
        x: ((e.clientX - rect.left) / rect.width) * image.width,
        y: ((e.clientY - rect.top) / rect.height) * image.height,
      };
    },
    [image.width, image.height],
  );

  const startText = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const { x, y } = toImage(e);
      setTyping({ x, y, value: "" });
    },
    [toImage],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (typing) {
      setTyping(null);
      return;
    }
    const { x, y } = toImage(e);

    if (tool === "text") {
      // Otherwise the browser's own mousedown focus change blurs the new input at once.
      e.preventDefault();
      startText(e);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    setDraft({
      id: newShapeId(),
      kind: tool,
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      color,
      ...(tool === "freedraw" ? { points: [[x, y]] as [number, number][] } : {}),
    });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing.current) return;
    const { x, y } = toImage(e);
    setDraft((d) => {
      if (!d) return d;
      if (d.kind === "freedraw") {
        return { ...d, x2: x, y2: y, points: [...(d.points ?? []), [x, y] as [number, number]] };
      }
      return { ...d, x2: x, y2: y };
    });
  };

  const onPointerUp = () => {
    drawing.current = false;
    setDraft((d) => {
      if (d && isMeaningful(d)) commit(d);
      return null;
    });
  };

  const commitText = () => {
    if (typing?.value.trim()) {
      commit({
        id: newShapeId(),
        kind: "text",
        x1: typing.x,
        y1: typing.y,
        x2: typing.x,
        y2: typing.y,
        color,
        text: typing.value.trim(),
      });
    }
    setTyping(null);
  };

  return (
    <div
      className={inline ? "editor-inline" : "editor-overlay"}
      role={inline ? "group" : "dialog"}
      aria-modal={inline ? undefined : true}
      aria-label={inline ? "Annotate image inline" : "Annotate image"}
    >
      <div className="editor-bar">
        <span className="editor-title">{inline ? "Edit" : "Draw"}</span>
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setTool(t.kind)}
            aria-pressed={tool === t.kind}
            title={`${t.label} (${t.keys[0]})`}
            className={tool === t.kind ? "primary" : undefined}
          >
            {t.label} <kbd>{t.keys[0]}</kbd>
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
        <button onClick={undo} disabled={!shapes.length} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={redo} disabled={!undone.length} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
        <button onClick={() => { setShapes([]); setUndone([]); }} disabled={!shapes.length}>
          Clear
        </button>
        {inline && onExpand && (
          <button onClick={() => onExpand(shapes)} title="Continue in a full-window editor">
            Full screen ⤢
          </button>
        )}
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onSave(shapes)} title="Save (Ctrl+Enter)">
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

          {typing && (
            <input
              ref={inputRef}
              id="annotation-text"
              className="annotation-text-input"
              value={typing.value}
              placeholder="Label, then Enter"
              style={{
                left: `${(typing.x / image.width) * 100}%`,
                top: `${(typing.y / image.height) * 100}%`,
                color,
              }}
              onChange={(e) => setTyping((t) => (t ? { ...t, value: e.target.value } : t))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitText();
                }
              }}
              onBlur={commitText}
            />
          )}
        </div>
      </div>
    </div>
  );
}
