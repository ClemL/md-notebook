"use client";

import { useEffect, useState } from "react";
import Btn from "./Btn";
import { Cell, formatStamp } from "@/lib/markdown";
import { formatBytes } from "@/lib/image";

/**
 * An image entry holds a pasted screenshot and nothing else: the only actions are copying it back
 * to the clipboard and deleting it. The thumbnail opens full size in an overlay.
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
}) {
  const [zoomed, setZoomed] = useState(false);
  const image = cell.image!;

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
        </button>
      </div>

      {zoomed && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setZoomed(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.dataUrl} alt={image.name ?? "Pasted image, full size"} />
          <button className="lightbox-close" onClick={() => setZoomed(false)} aria-label="Close">
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
