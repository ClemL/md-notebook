"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { StoredImage } from "@/lib/image";
import { storeImage } from "@/lib/image";

/**
 * Excalidraw embedded as a component rather than an iframe. A cross-origin frame of
 * excalidraw.com could be drawn in but never read back — same-origin is what makes the
 * round trip (image in, flattened PNG and a reusable scene out) possible at all.
 *
 * The editor is a large bundle, so it is loaded only when opened.
 */
const Excalidraw = dynamic(
  async () => {
    const mod = await import("@excalidraw/excalidraw");
    return mod.Excalidraw;
  },
  { ssr: false, loading: () => <div className="editor-loading">Loading Excalidraw…</div> },
);

/** Fixed id so a saved scene can be re-attached to the image it was drawn over. */
const FILE_ID = "md-notebook-image";

type ExcalidrawApi = {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
};

export type ExcalidrawResult = { image: StoredImage };

export default function ExcalidrawEditor({
  image,
  onSave,
  onCancel,
}: {
  image: StoredImage;
  onSave: (next: StoredImage) => void;
  onCancel: () => void;
}) {
  const apiRef = useRef<ExcalidrawApi | null>(null);
  const [initialData, setInitialData] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The image as pasted: an Excalidraw save replaces dataUrl with its export, so re-opening
  // has to start from the original or each pass would composite on top of the last.
  const source = image.original ?? image.dataUrl;

  useEffect(() => {
    // Self-hosted fonts: the default asset path is a CDN, which the offline and static copies
    // cannot reach. document.baseURI keeps this correct under file:// too.
    const w = window as unknown as { EXCALIDRAW_ASSET_PATH?: string };
    w.EXCALIDRAW_ASSET_PATH = new URL("excalidraw-assets/", document.baseURI).href;

    const files = {
      [FILE_ID]: {
        id: FILE_ID,
        dataURL: source,
        mimeType: "image/png",
        created: Date.now(),
        lastRetrieved: Date.now(),
      },
    };

    let elements: unknown[] = [];
    if (image.scene) {
      try {
        const parsed: unknown = JSON.parse(image.scene);
        if (Array.isArray(parsed)) elements = parsed;
      } catch {
        /* a corrupt scene just starts the drawing over */
      }
    }

    const build = async () => {
      if (!elements.length) {
        const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
        elements = convertToExcalidrawElements([
          {
            type: "image",
            fileId: FILE_ID,
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
            locked: true,
          },
        ] as never);
      }
      setInitialData({
        elements,
        files,
        appState: { viewBackgroundColor: "#ffffff", currentItemStrokeWidth: 2 },
        scrollToContent: true,
      });
    };

    void build();
  }, [source, image.scene, image.width, image.height]);

  const save = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    setBusy(true);
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const elements = api.getSceneElements();
      const blob = await exportToBlob({
        elements: elements as never,
        appState: { ...api.getAppState(), exportBackground: true, exportPadding: 0 } as never,
        files: api.getFiles() as never,
        mimeType: "image/png",
      });
      const stored = await storeImage(blob, image.name);
      onSave({
        ...image,
        dataUrl: stored.dataUrl,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        original: source,
        // Elements only: the image itself is re-attached from `original` on the next open,
        // so the scene does not carry a second copy of the pixels.
        scene: JSON.stringify(elements),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The drawing could not be saved.");
      setBusy(false);
    }
  }, [image, onSave, source]);

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Excalidraw">
      <div className="editor-bar">
        <span className="editor-title">Excalidraw</span>
        {error && <span className="editor-error">{error}</span>}
        <span className="spacer" />
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="primary" onClick={save} disabled={busy || !initialData}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="editor-stage excalidraw-stage">
        {initialData && (
          <Excalidraw
            initialData={initialData as never}
            excalidrawAPI={((api: ExcalidrawApi) => {
              apiRef.current = api;
            }) as never}
            theme="dark"
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } } as never}
          />
        )}
      </div>
    </div>
  );
}
