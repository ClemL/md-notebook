"use client";

import { useEffect, useState } from "react";
import Annotator, { AnnotationLayer } from "./Annotator";
import Btn from "./Btn";
import { Cell, formatStamp } from "@/lib/markdown";
import { copyImage, formatBytes, type StoredImage } from "@/lib/image";
import type { Shape } from "@/lib/annotate";

/** Where the Excalidraw button sends you. A self-hosted instance can be swapped in here. */
export const EXCALIDRAW_URL = "https://excalidraw.com/";

/**
 * An image entry holds a pasted screenshot. It can be copied back to the clipboard, deleted, and
 * marked up either in the built-in annotator or in Excalidraw — the latter by handing the image
 * to the clipboard and opening excalidraw.com in its own window, where Ctrl+V drops it in.
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
  onNotify,
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
  onNotify: (message: string) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [editor, setEditor] = useState<"none" | "draw">("none");
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
        <span className="image-label">
          image · {image.width}×{image.height} · {formatBytes(image.bytes)}
        </span>
        <Btn
          tip={marked ? "Edit the arrows and boxes on this image" : "Draw arrows and boxes on this image"}
          onClick={() => setEditor("draw")}
        >
          Draw{marked ? ` (${image.annotations!.length})` : ""}
        </Btn>
        <Btn
          tip="Copy the image and open Excalidraw in a new window — paste it there with Ctrl+V"
          onClick={openInExcalidraw}
        >
          Excalidraw ↗
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
