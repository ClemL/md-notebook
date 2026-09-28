"use client";

import { useEffect, useState } from "react";
import Annotator, { AnnotationLayer } from "./Annotator";
import Btn from "./Btn";
import { Cell, formatStamp } from "@/lib/markdown";
import { copyImage, type ImageView, type StoredImage } from "@/lib/image";
import type { Shape } from "@/lib/annotate";

/** Where the Excalidraw button sends you. A self-hosted instance can be swapped in here. */
export const EXCALIDRAW_URL = "https://excalidraw.com/";

/** The ways an entry can show its image; the thumbnail is what a fresh paste gets. */
const VIEWS: { view: ImageView; label: string; tip: string }[] = [
  { view: "thumb", label: "Thumb", tip: "Show a small thumbnail" },
  { view: "width", label: "Fit W", tip: "Fit the image to the width of the entry" },
  { view: "height", label: "Fit H", tip: "Fit the image to the height of the window" },
  { view: "original", label: "1:1", tip: "Show the image at its original size" },
];

/**
 * An image entry holds a pasted screenshot. It can be copied back to the clipboard, deleted, and
 * marked up either in the built-in annotator or in Excalidraw — the latter by handing the image
 * to the clipboard and opening excalidraw.com in its own window, where Ctrl+V drops it in.
 */
export default function ImageCell({
  cell,
  index,
  first,
  last,
  canMerge,
  selected,
  flashed,
  collapsed,
  onToggleCollapse,
  onSelect,
  onCopy,
  onDelete,
  onMove,
  onMerge,
  onImageChange,
  onViewChange,
  onNotify,
}: {
  cell: Cell;
  index: number;
  first: boolean;
  last: boolean;
  /** True when the entry below is also an image, so the two can be stacked into one. */
  canMerge: boolean;
  selected: boolean;
  flashed: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onMerge: () => void;
  onViewChange: (view: ImageView) => void;
  onImageChange: (next: StoredImage) => void;
  onNotify: (message: string) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [editor, setEditor] = useState<"none" | "draw" | "inline">("none");
  const image = cell.image!;
  const marked = !!image.annotations?.length;
  const view = image.view ?? "thumb";

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

  /**
   * Copy first, then open: the clipboard write needs this document focused, which it loses the
   * moment the new window appears. Opening still counts as user-activated afterwards.
   */
  const openInExcalidraw = async () => {
    let copied = true;
    try {
      await copyImage(image);
    } catch {
      copied = false;
    }
    window.open(EXCALIDRAW_URL, "_blank", "noopener,noreferrer");
    onNotify(
      copied
        ? "Image copied — press Ctrl+V in Excalidraw."
        : "Excalidraw opened, but the image could not be copied.",
    );
  };

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
        <Btn
          tip={marked ? "Edit the arrows and boxes on this image" : "Draw arrows and boxes on this image"}
          onClick={() => setEditor("draw")}
        >
          Draw{marked ? ` (${image.annotations!.length})` : ""}
        </Btn>
        <Btn
          tip="Mark the image up inside this entry, without leaving the notebook"
          onClick={() => setEditor((e) => (e === "inline" ? "none" : "inline"))}
          aria-pressed={editor === "inline"}
        >
          Edit inline
        </Btn>
        <Btn
          tip="Copy the image and open Excalidraw in a new window — paste it there with Ctrl+V"
          onClick={openInExcalidraw}
        >
          <span className="label-full">Excalidraw ↗</span>
          <span className="label-short">Xcd ↗</span>
        </Btn>
        <Btn tip="Copy the image to the clipboard" hotkey="c" flash={flashed} onClick={onCopy}>
          Copy
        </Btn>
        {canMerge && (
          <Btn tip="Merge with the image below into one image" hotkey="Shift+M" onClick={onMerge}>
            Merge ↓
          </Btn>
        )}
        <span className="view-group" role="group" aria-label="Image size">
          {VIEWS.map((v) => (
            <Btn
              key={v.view}
              tip={v.tip}
              onClick={() => onViewChange(v.view)}
              aria-pressed={view === v.view}
              className={view === v.view ? "on" : undefined}
            >
              {v.label}
            </Btn>
          ))}
        </span>
        <span className="spacer" />
        <span className="stamp" title={`Pasted ${formatStamp(image.addedAt)}`}>
          {formatStamp(image.addedAt)}
        </span>
        <Btn tip="Move entry up" hotkey="Alt+↑" onClick={() => onMove(-1)} disabled={first}>
          ↑
        </Btn>
        <Btn tip="Move entry down" hotkey="Alt+↓" onClick={() => onMove(1)} disabled={last}>
          ↓
        </Btn>
        <Btn className="danger" tip="Delete this image" hotkey="dd" onClick={onDelete}>
          ✕
        </Btn>
      </div>

      <div className="cell-body" hidden={collapsed}>
        {editor === "inline" ? (
          <Annotator
            image={image}
            variant="inline"
            onCancel={() => setEditor("none")}
            onSave={(shapes: Shape[]) => {
              onImageChange({ ...image, annotations: shapes.length ? shapes : undefined });
              setEditor("none");
            }}
          />
        ) : (
          <div className={`thumb-frame view-${view}`}>
            <button className="thumb" onClick={() => setZoomed(true)} title="Click to view full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.dataUrl}
                alt={image.name ?? `Pasted image ${formatStamp(image.addedAt)}`}
                style={view === "original" ? { width: image.width, height: image.height } : undefined}
              />
              <AnnotationLayer image={image} />
            </button>
          </div>
        )}
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
