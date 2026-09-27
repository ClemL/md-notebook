"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Annotator, { AnnotationLayer } from "./Annotator";
import Btn from "./Btn";
import { Cell, formatStamp } from "@/lib/markdown";
import { formatBytes, type StoredImage } from "@/lib/image";
import type { Shape } from "@/lib/annotate";

/** Excalidraw is a large bundle; it arrives only when someone opens it. */
const ExcalidrawEditor = dynamic(() => import("./ExcalidrawEditor"), { ssr: false });

/**
 * An image entry holds a pasted screenshot. It can be copied back to the clipboard, deleted, and
 * marked up two ways: the built-in annotator, which keeps shapes beside the pixels, and Excalidraw,
 * which replaces the image with its own export while keeping the scene for later edits.
 */
export default function ImageCell({
  cell,
  index,
  selected,
  flashed,
  collapsed,
  onToggleCollapse,
  onSelect,
  onCopy,
  onDelete,
  onImageChange,
}: {
  cell: Cell;
  index: number;
  selected: boolean;
  flashed: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onImageChange: (next: StoredImage) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [editor, setEditor] = useState<"none" | "draw" | "excalidraw">("none");
  const image = cell.image!;
  const marked = !!image.annotations?.length;

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setZoomed(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [zoomed]);

  return (
    <section
      id={`cell-${cell.id}`}
      className={`cell image-cell${selected ? " selected" : ""}${collapsed ? " collapsed" : ""}`}
      onMouseDown={onSelect}
    >
      <div className="cell-head">
        <span className="cell-index">[{index + 1}]</span>
        <Btn
          className="collapse-toggle"
          tip={collapsed ? "Expand this image" : "Collapse this image"}
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▸" : "▾"}
        </Btn>
        <span className="image-label">
          image · {image.width}×{image.height} · {formatBytes(image.bytes)}
        </span>
        <Btn
          tip={marked ? "Edit the arrows and boxes on this image" : "Draw arrows and boxes on this image"}
          onClick={() => setEditor("draw")}
        >
          Draw{marked ? ` (${image.annotations!.length})` : ""}
        </Btn>
        <Btn tip="Open this image in Excalidraw" onClick={() => setEditor("excalidraw")}>
          Excalidraw
        </Btn>
        <Btn tip="Copy the image to the clipboard" hotkey="c" flash={flashed} onClick={onCopy}>
          Copy
        </Btn>
        <span className="spacer" />
        <span className="stamp" title={`Pasted ${formatStamp(image.addedAt)}`}>
          {formatStamp(image.addedAt)}
        </span>
        <Btn className="danger" tip="Delete this image" hotkey="dd" onClick={onDelete}>
          ✕
        </Btn>
      </div>

      <div className="cell-body" hidden={collapsed}>
        <button className="thumb" onClick={() => setZoomed(true)} title="Click to view full size">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.dataUrl} alt={image.name ?? `Pasted image ${formatStamp(image.addedAt)}`} />
          <AnnotationLayer image={image} />
        </button>
      </div>

      {editor === "draw" && (
        <Annotator
          image={image}
          onCancel={() => setEditor("none")}
          onSave={(shapes: Shape[]) => {
            onImageChange({ ...image, annotations: shapes.length ? shapes : undefined });
            setEditor("none");
          }}
        />
      )}

      {editor === "excalidraw" && (
        <ExcalidrawEditor
          image={image}
          onCancel={() => setEditor("none")}
          onSave={(next) => {
            onImageChange(next);
            setEditor("none");
          }}
        />
      )}

      {zoomed && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setZoomed(false)}>
          <div className="lightbox-frame" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.dataUrl} alt={image.name ?? "Pasted image, full size"} />
            <AnnotationLayer image={image} />
          </div>
          <button className="lightbox-close" onClick={() => setZoomed(false)} aria-label="Close">
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
