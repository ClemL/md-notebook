"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Btn from "./Btn";
import CellView from "./CellView";
import { FlashProvider, useFlash } from "./flash";
import {
  Cell,
  STORAGE_KEY,
  downloadText,
  joinCells,
  loadCells,
  isImageCell,
  makeBackup,
  makeCell,
  makeImageCell,
  matchesQuery,
  parseBackup,
  parseStored,
  saveCells,
  splitMarkdown,
  timestamp,
  toCheckboxes,
  toggleTaskAtLine,
  writeClipboard,
} from "@/lib/markdown";
import { mergeTexts, splitAt } from "@/lib/editor";
import { copyImage, imageFromTransfer, readClipboardImage, storeImage } from "@/lib/image";
import { maybeTable } from "@/lib/table";
import { readClipboardSmart } from "@/lib/richPaste";
import { receiveCode, sendEntries } from "@/lib/transferClient";
import { TEMPLATES } from "@/lib/templates";

const SEP_KEY = "md-notebook:separators";
const RICH_KEY = "md-notebook:richpaste";
const TOP_KEY = "md-notebook:inserttop";
const COMPACT_KEY = "md-notebook:compact";
const HINT_KEY = "md-notebook:hint";
const COLLAPSED_KEY = "md-notebook:collapsed";
const HISTORY_LIMIT = 30;

type ToastAction = { label: string; run: () => void };
type Toast = { message: string; action?: ToastAction };

const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);

export default function Notebook() {
  return (
    <FlashProvider>
      <NotebookInner />
    </FlashProvider>
  );
}

function NotebookInner() {
  const { flashed, flash } = useFlash();
  const [cells, setCells] = useState<Cell[]>([]);
  // History lives in refs: a snapshot must be read when the change happens, not when a lazy
  // state updater later runs, or it captures the post-change state. `histVersion` only exists
  // to re-render the undo/redo buttons.
  const [histVersion, setHistVersion] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [separators, setSeparators] = useState(true);
  const [richPaste, setRichPaste] = useState(true);
  const [insertTop, setInsertTop] = useState(false);
  const [compact, setCompact] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rawIds, setRawIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [receiving, setReceiving] = useState(false);

  const cellsRef = useRef<Cell[]>([]);
  const pastRef = useRef<Cell[][]>([]);
  const futureRef = useRef<Cell[][]>([]);
  const editingIdRef = useRef<string | null>(null);
  const skipSaveRef = useRef(false);
  const editSnapshotRef = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const undoRef = useRef<() => void>(() => {});
  const insertTopRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const receivingRef = useRef(false);
  const codeRef = useRef<HTMLInputElement | null>(null);

  cellsRef.current = cells;
  editingIdRef.current = editingId;
  insertTopRef.current = insertTop;
  selectedIdRef.current = selectedId;
  receivingRef.current = receiving;

  // A toast may carry one action, used to offer Undo after a delete or to jump to a duplicate.
  const say = useCallback((message: string, action?: ToastAction) => {
    setToast({ message, action });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 7000 : 3200);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  /* ---------------------------------------------------------------- state */

  const bumpHistory = useCallback(() => setHistVersion((v) => v + 1), []);

  // Structural change: snapshot the current cells so Ctrl+Z can step back.
  const apply = useCallback(
    (next: Cell[]) => {
      pastRef.current = [...pastRef.current, cellsRef.current].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      cellsRef.current = next;
      setCells(next);
      bumpHistory();
    },
    [bumpHistory],
  );

  const mutate = useCallback(
    (fn: (prev: Cell[]) => Cell[]) => {
      const next = fn(cellsRef.current);
      if (next !== cellsRef.current) apply(next);
    },
    [apply],
  );

  const undo = useCallback(() => {
    if (!pastRef.current.length) return say("Nothing to undo.");
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [cellsRef.current, ...futureRef.current].slice(0, HISTORY_LIMIT);
    cellsRef.current = prev;
    setCells(prev);
    setEditingId(null);
    bumpHistory();
  }, [bumpHistory, say]);

  undoRef.current = undo;

  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, cellsRef.current].slice(-HISTORY_LIMIT);
    cellsRef.current = next;
    setCells(next);
    setEditingId(null);
    bumpHistory();
  }, [bumpHistory]);

  /* -------------------------------------------------------------- storage */

  useEffect(() => {
    setCells(loadCells());
    setSeparators(localStorage.getItem(SEP_KEY) !== "0");
    setRichPaste(localStorage.getItem(RICH_KEY) !== "0");
    setInsertTop(localStorage.getItem(TOP_KEY) === "1");
    setCompact(localStorage.getItem(COMPACT_KEY) === "1");
    setShowHint(localStorage.getItem(HINT_KEY) !== "0");
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      if (Array.isArray(saved)) {
        setCollapsedIds(Object.fromEntries(saved.filter((id) => typeof id === "string").map((id) => [id, true])));
      }
    } catch {
      /* a corrupt list just means nothing starts collapsed */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setStorageOk(saveCells(cells));
  }, [cells, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem(SEP_KEY, separators ? "1" : "0");
  }, [separators, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem(RICH_KEY, richPaste ? "1" : "0");
  }, [richPaste, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem(TOP_KEY, insertTop ? "1" : "0");
  }, [insertTop, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem(COMPACT_KEY, compact ? "1" : "0");
  }, [compact, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem(HINT_KEY, showHint ? "1" : "0");
  }, [showHint, loaded]);

  // Only ids that still exist are remembered, so the list cannot grow without bound.
  useEffect(() => {
    if (!loaded) return;
    const live = cells.filter((c) => collapsedIds[c.id]).map((c) => c.id);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(live));
  }, [collapsedIds, cells, loaded]);

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Another tab wrote the notebook: adopt its state instead of overwriting it on our next save.
  // An entry being edited here is preserved, so a background tab cannot discard in-progress text.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      const incoming = parseStored(e.newValue);
      const editing = editingIdRef.current;
      let merged = incoming;
      if (editing) {
        const local = cellsRef.current.find((c) => c.id === editing);
        if (local) {
          const at = incoming.findIndex((c) => c.id === editing);
          merged =
            at >= 0
              ? incoming.map((c) => (c.id === editing ? local : c))
              : [...incoming, local];
        }
      }
      // Only echo back to storage when the merge actually differs from what we received.
      skipSaveRef.current = merged === incoming;
      cellsRef.current = merged;
      setCells(merged);
      if (merged !== incoming) say("Merged an update from another tab; your open entry was kept.");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [say]);

  /* ------------------------------------------------------------- mutators */

  /** Where new entries land: below everything, or above it when the option is on. */
  const place = useCallback((prev: Cell[], incoming: Cell[]) => {
    return insertTopRef.current ? [...incoming, ...prev] : [...prev, ...incoming];
  }, []);

  const appendCell = useCallback(
    (text: string, after?: string) => {
      const cell = makeCell(text);
      mutate((prev) => {
        if (!after) return place(prev, [cell]);
        const i = prev.findIndex((c) => c.id === after);
        if (i < 0) return place(prev, [cell]);
        return [...prev.slice(0, i + 1), cell, ...prev.slice(i + 1)];
      });
      setSelectedId(cell.id);
      setEditingId(cell.id);
      editSnapshotRef.current = null;
      return cell.id;
    },
    [mutate, place],
  );

  const insertBefore = useCallback(
    (id: string) => {
      const cell = makeCell("");
      mutate((prev) => {
        const i = prev.findIndex((c) => c.id === id);
        if (i < 0) return [...prev, cell];
        return [...prev.slice(0, i), cell, ...prev.slice(i)];
      });
      setSelectedId(cell.id);
      setEditingId(cell.id);
    },
    [mutate],
  );

  const jumpTo = useCallback((id: string) => {
    setQuery("");
    setSelectedId(id);
    setEditingId(null);
    requestAnimationFrame(() =>
      document.getElementById(`cell-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }, []);

  const addImage = useCallback(
    async (file: File | Blob, name?: string) => {
      try {
        const image = await storeImage(file, name);
        const cell = makeImageCell(image);
        mutate((prev) => place(prev, [cell]));
        setSelectedId(cell.id);
        setEditingId(null);
        requestAnimationFrame(() =>
          document.getElementById(`cell-${cell.id}`)?.scrollIntoView({ block: "center" }),
        );
        say(`Image stored (${image.width}×${image.height}).`, {
          label: "Undo",
          run: () => undoRef.current(),
        });
      } catch (err) {
        say(err instanceof Error ? err.message : "That image could not be stored.");
      }
    },
    [mutate, place, say],
  );

  const newFromClipboard = useCallback(async () => {
    let text = "";
    let note: string | null = null;
    let rich = false;
    try {
      const image = await readClipboardImage();
      if (image) {
        await addImage(image);
        return;
      }
      const payload = await readClipboardSmart(richPaste);
      text = payload.text;
      rich = payload.rich;
      if (!rich) {
        const table = maybeTable(text);
        if (table) {
          text = table;
          rich = true;
        }
      }
    } catch {
      note = "Clipboard read was blocked — press Ctrl+V to paste into the new entry.";
    }

    // The same string pasted twice is almost always an accident in a scratchpad.
    const trimmed = text.trim();
    if (trimmed) {
      const twin = cellsRef.current.find((c) => c.text.trim() === trimmed);
      if (twin) {
        const at = cellsRef.current.indexOf(twin) + 1;
        jumpTo(twin.id);
        say(`Already saved as entry ${at} — jumped to it.`, {
          label: "Add anyway",
          run: () => appendCell(text),
        });
        return;
      }
    }

    appendCell(text);
    if (note) say(note);
    else if (!trimmed) say("Clipboard was empty — new entry is blank.");
    else if (rich) say("Pasted as markdown (converted from rich content).");
  }, [addImage, appendCell, jumpTo, richPaste, say]);

  const beginEdit = useCallback((id: string) => {
    const cell = cellsRef.current.find((c) => c.id === id);
    editSnapshotRef.current = cell ? cell.text : null;
    setSelectedId(id);
    setEditingId(id);
  }, []);

  // Keystrokes do not each become an undo step; the snapshot taken at edit start is pushed
  // once, when the entry is committed with different text.
  const commitEdit = useCallback(() => {
    const id = editingIdRef.current;
    setEditingId(null);
    if (!id) return;
    const before = editSnapshotRef.current;
    editSnapshotRef.current = null;
    const after = cellsRef.current.find((c) => c.id === id)?.text;
    if (before === null || after === undefined || before === after) return;
    const restored = cellsRef.current.map((c) => (c.id === id ? { ...c, text: before } : c));
    pastRef.current = [...pastRef.current, restored].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  const update = useCallback((id: string, text: string) => {
    const next = cellsRef.current.map((c) =>
      c.id === id ? { ...c, text, updatedAt: Date.now() } : c,
    );
    cellsRef.current = next;
    setCells(next);
  }, []);

  const remove = useCallback(
    (id: string) => {
      const i = cellsRef.current.findIndex((c) => c.id === id);
      mutate((prev) => prev.filter((c) => c.id !== id));
      if (editingIdRef.current === id) setEditingId(null);
      const rest = cellsRef.current;
      setSelectedId(rest.length ? rest[Math.min(i, rest.length - 1)].id : null);
      say(`Deleted entry ${i + 1}.`, { label: "Undo", run: () => undoRef.current() });
    },
    [mutate, say],
  );

  const splitCell = useCallback(
    (id: string, caret: number) => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!cell) return;
      const [head, tail] = splitAt(cell.text, caret);
      if (!head || !tail) return say("Nothing to split — put the caret between two lines.");
      const now = Date.now();
      const second = makeCell(tail, now);
      mutate((prev) =>
        prev.flatMap((c) => (c.id === id ? [{ ...c, text: head, updatedAt: now }, second] : [c])),
      );
      setEditingId(null);
      setSelectedId(second.id);
      say("Entry split in two.", { label: "Undo", run: () => undoRef.current() });
    },
    [mutate, say],
  );

  const mergeWithNext = useCallback(
    (id: string) => {
      const i = cellsRef.current.findIndex((c) => c.id === id);
      if (i < 0 || i === cellsRef.current.length - 1) return;
      const next = cellsRef.current[i + 1];
      // An image entry holds no markdown, so merging one would silently discard the image.
      if (isImageCell(cellsRef.current[i]) || isImageCell(next)) {
        return say("Image entries cannot be merged.");
      }
      const merged = mergeTexts(cellsRef.current[i].text, next.text);
      mutate((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, text: merged, updatedAt: Date.now() } : c))
          .filter((c) => c.id !== next.id),
      );
      setSelectedId(id);
      say("Merged with the entry below.", { label: "Undo", run: () => undoRef.current() });
    },
    [mutate, say],
  );

  const insertTemplate = useCallback(
    (id: string) => {
      const template = TEMPLATES.find((t) => t.id === id);
      if (!template) return;
      appendCell(template.build());
    },
    [appendCell],
  );

  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      mutate((prev) => {
        const i = prev.findIndex((c) => c.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    },
    [mutate],
  );

  const checkbox = useCallback(
    (id: string) => {
      mutate((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, text: toCheckboxes(c.text), updatedAt: Date.now() } : c,
        ),
      );
    },
    [mutate],
  );

  const checkboxAll = useCallback(() => {
    mutate((prev) => prev.map((c) => ({ ...c, text: toCheckboxes(c.text), updatedAt: Date.now() })));
    say("Every line in every entry is now a task.");
  }, [mutate, say]);

  const toggleTask = useCallback(
    (id: string, line: number) => {
      mutate((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, text: toggleTaskAtLine(c.text, line), updatedAt: Date.now() } : c,
        ),
      );
    },
    [mutate],
  );

  /* ------------------------------------------------------------ transfer */

  /**
   * Send: push one entry's markdown to the transfer store and put the returned code on the
   * clipboard. The code is one-shot — receiving it deletes it — and expires after 24h.
   */
  const sendCell = useCallback(
    async (id: string) => {
      const cell = cellsRef.current.find((c) => c.id === id);
      if (!cell) return;
      if (isImageCell(cell)) return say("Image entries cannot be sent — copy the image instead.");
      setSendingId(id);
      let result;
      try {
        result = await sendEntries([cell.text]);
      } finally {
        setSendingId(null);
      }
      if (!result.ok) return say(result.message);
      flash(`send-${id}`);
      try {
        await writeClipboard(result.code);
        say(`Code ${result.code} copied — valid 24h or until received.`);
      } catch {
        say(`Code ${result.code} — clipboard was blocked, so write it down.`);
      }
    },
    [flash, say],
  );

  /**
   * Where a received transfer lands: the top when that option is on, otherwise just below the
   * selected entry, the way `b` inserts. The insertion goes through `mutate`, so it is one undo
   * step like any other import.
   */
  const insertReceived = useCallback(
    (texts: string[]) => {
      const now = Date.now();
      const incoming = texts.map((t) => makeCell(t, now));
      mutate((prev) => {
        if (insertTopRef.current) return place(prev, incoming);
        const i = prev.findIndex((c) => c.id === selectedIdRef.current);
        if (i < 0) return place(prev, incoming);
        return [...prev.slice(0, i + 1), ...incoming, ...prev.slice(i + 1)];
      });
      setSelectedId(incoming[0].id);
      setEditingId(null);
      requestAnimationFrame(() =>
        document.getElementById(`cell-${incoming[0].id}`)?.scrollIntoView({ block: "center" }),
      );
      return incoming.length;
    },
    [mutate, place],
  );

  const openReceive = useCallback(() => {
    setReceiveOpen(true);
    requestAnimationFrame(() => codeRef.current?.focus());
  }, []);

  const closeReceive = useCallback(() => {
    setReceiveOpen(false);
    setCodeInput("");
  }, []);

  const doReceive = useCallback(
    async (raw: string) => {
      if (receivingRef.current) return;
      setReceiving(true);
      let result;
      try {
        result = await receiveCode(raw);
      } finally {
        setReceiving(false);
      }
      if (!result.ok) return say(result.message);
      const added = insertReceived(result.entries);
      closeReceive();
      say(`Received ${added} ${added === 1 ? "entry" : "entries"}.`);
    },
    [closeReceive, insertReceived, say],
  );

  /* ------------------------------------------------------- search + bulk */

  const visible = useMemo(() => cells.filter((c) => matchesQuery(c, query)), [cells, query]);
  const filtering = query.trim().length > 0;
  const canUndo = useMemo(() => pastRef.current.length > 0, [histVersion]);
  const canRedo = useMemo(() => futureRef.current.length > 0, [histVersion]);

  const copyAll = useCallback(async () => {
    const text = joinCells(visible, separators);
    if (!text.trim()) return say("Nothing to copy.");
    try {
      await writeClipboard(text);
      flash("copy-all");
      say(`Copied ${visible.length} ${visible.length === 1 ? "entry" : "entries"}${filtering ? " (filtered)" : ""}.`);
    } catch {
      say("Copy failed — the browser blocked clipboard write.");
    }
  }, [visible, separators, filtering, flash, say]);

  const exportAll = useCallback(() => {
    const text = joinCells(visible, separators);
    if (!text.trim()) return say("Nothing to export.");
    const name = `md-notebook_${timestamp()}.md`;
    downloadText(name, text);
    flash("export-all");
    say(`Exported ${name}`);
  }, [visible, separators, flash, say]);

  const backup = useCallback(() => {
    if (!cells.length) return say("Nothing to back up.");
    const name = `md-notebook-backup_${timestamp()}.json`;
    downloadText(name, makeBackup(cells), "application/json");
    flash("backup");
    say(`Saved ${name} (all ${cells.length} entries, timestamps included).`);
  }, [cells, flash, say]);

  const clearAll = useCallback(() => {
    if (!cells.length) return;
    if (!window.confirm(`Delete all ${cells.length} entries? Ctrl+Z can undo this.`)) return;
    const count = cells.length;
    apply([]);
    setEditingId(null);
    setSelectedId(null);
    say(`Deleted all ${count} entries.`, { label: "Undo", run: () => undoRef.current() });
  }, [cells.length, apply, say]);

  /* --------------------------------------------------------------- import */

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      let added = 0;
      for (const file of list) {
        if (file.type.startsWith("image/")) {
          await addImage(file, file.name);
          added += 1;
          continue;
        }
        const body = await file.text();
        if (file.name.toLowerCase().endsWith(".json")) {
          let restored: Cell[];
          try {
            restored = parseBackup(body);
          } catch {
            say(`${file.name} is not a md-notebook backup.`);
            continue;
          }
          const replace =
            cellsRef.current.length === 0 ||
            window.confirm(
              `Replace the ${cellsRef.current.length} current entries with ${restored.length} from ${file.name}?\n\nCancel appends them instead. Either way Ctrl+Z undoes it.`,
            );
          apply(replace ? restored : place(cellsRef.current, restored));
          added += restored.length;
        } else {
          const parts = splitMarkdown(body);
          if (!parts.length) continue;
          apply(place(cellsRef.current, parts));
          added += parts.length;
        }
      }
      if (added) say(`Imported ${added} ${added === 1 ? "entry" : "entries"}.`);
    },
    [addImage, apply, place, say],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void addImage(file, file.name || undefined);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addImage]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      setDragging(false);
      void importFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importFiles]);

  /* ------------------------------------------------------------ shortcuts */

  const selectRelative = useCallback(
    (delta: -1 | 1) => {
      if (!visible.length) return;
      const i = visible.findIndex((c) => c.id === selectedId);
      const next = i < 0 ? (delta === 1 ? 0 : visible.length - 1) : Math.min(Math.max(i + delta, 0), visible.length - 1);
      setSelectedId(visible[next].id);
      document.getElementById(`cell-${visible[next].id}`)?.scrollIntoView({ block: "nearest" });
    },
    [visible, selectedId],
  );

  const dKey = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTypingTarget(e.target);

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        appendCell("");
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "v" && !typing) {
        e.preventDefault();
        void newFromClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        exportAll();
        return;
      }
      if (mod && e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void copyAll();
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && selectedId) {
        e.preventDefault();
        move(selectedId, e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (typing || mod || e.altKey) return;

      // Command mode: no text field has focus.
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          selectRelative(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          selectRelative(-1);
          break;
        case "Enter":
        case "e":
          if (selectedId) {
            e.preventDefault();
            beginEdit(selectedId);
          }
          break;
        case "a":
          if (selectedId) {
            e.preventDefault();
            insertBefore(selectedId);
          }
          break;
        case "b":
          e.preventDefault();
          appendCell("", selectedId ?? undefined);
          break;
        case "c":
          if (selectedId) {
            e.preventDefault();
            const cell = cellsRef.current.find((c) => c.id === selectedId);
            if (cell) void writeClipboard(cell.text).then(() => say("Entry copied."));
          }
          break;
        case "t":
          if (selectedId) {
            e.preventDefault();
            checkbox(selectedId);
          }
          break;
        case "r":
          if (selectedId) {
            e.preventDefault();
            setRawIds((prev) => ({ ...prev, [selectedId]: !prev[selectedId] }));
          }
          break;
        case "s":
          if (selectedId) {
            e.preventDefault();
            void sendCell(selectedId);
          }
          break;
        case "g":
          e.preventDefault();
          openReceive();
          break;
        case "M":
          if (selectedId) {
            e.preventDefault();
            mergeWithNext(selectedId);
          }
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "d": {
          const now = Date.now();
          if (now - dKey.current < 600 && selectedId) {
            dKey.current = 0;
            remove(selectedId);
          } else {
            dKey.current = now;
          }
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    appendCell,
    beginEdit,
    checkbox,
    copyAll,
    exportAll,
    insertBefore,
    mergeWithNext,
    move,
    newFromClipboard,
    openReceive,
    redo,
    remove,
    say,
    selectRelative,
    selectedId,
    sendCell,
    undo,
  ]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  /* ----------------------------------------------------------------- view */

  return (
    // data-ready flips once client state is restored; tests wait on it instead of racing hydration.
    <div className="app" data-ready={loaded ? "true" : undefined} data-compact={compact ? "on" : undefined}>
      <header className="bar">
        <span className="title">md-notebook</span>

        <Btn className="primary" tip="New entry from clipboard" hotkey="Ctrl+Shift+V" onClick={newFromClipboard}>
          + Paste New
        </Btn>
        <Btn tip="New empty entry" hotkey="Ctrl+Shift+Enter" onClick={() => appendCell("")}>
          + Empty
        </Btn>
        <Btn tip="Undo the last change" hotkey="Ctrl+Z" onClick={undo} disabled={!canUndo}>
          Undo
        </Btn>
        <Btn tip="Redo the change you just undid" hotkey="Ctrl+Shift+Z" onClick={redo} disabled={!canRedo}>
          Redo
        </Btn>

        <span className="search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search entries…  (Ctrl+K)"
            aria-label="Search entries"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
          />
          {filtering && (
            <span className="count">
              {visible.length}/{cells.length}
            </span>
          )}
        </span>

        <span className="spacer" />

        <Btn
          tip={filtering ? "Copy the filtered entries" : "Copy every entry to the clipboard"}
          hotkey="Ctrl+Alt+C"
          onClick={copyAll}
          disabled={!visible.length}
          flash={flashed === "copy-all"}
        >
          Copy{filtering ? ` (${visible.length})` : " All"}
        </Btn>
        <Btn
          tip={filtering ? "Download the filtered entries as .md" : "Download every entry as one .md file"}
          hotkey="Ctrl+S"
          onClick={exportAll}
          disabled={!visible.length}
          flash={flashed === "export-all"}
        >
          Export{filtering ? ` (${visible.length})` : " All"}
        </Btn>

        <div className="menuwrap" ref={menuRef}>
          <Btn tip="More actions" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
            ⋯
          </Btn>
          {menuOpen && (
            <div className="menu" role="menu">
              <button onClick={() => { checkboxAll(); setMenuOpen(false); }}>
                Checkbox All <kbd>t</kbd>
              </button>
              <hr />
              <span className="menu-label">Insert template</span>
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => { insertTemplate(t.id); setMenuOpen(false); }}>
                  {t.label}
                </button>
              ))}
              <hr />
              <button onClick={() => { openReceive(); setMenuOpen(false); }}>
                Receive a transfer… <kbd>g</kbd>
              </button>
              <hr />
              <button onClick={() => { fileRef.current?.click(); setMenuOpen(false); }}>
                Import .md / .json…
              </button>
              <button onClick={() => { backup(); setMenuOpen(false); }}>Backup as .json</button>
              <hr />
              <label>
                <input type="checkbox" checked={separators} onChange={(e) => setSeparators(e.target.checked)} />
                <span>
                  <code>---</code> between entries on export
                </span>
              </label>
              <label>
                <input type="checkbox" checked={richPaste} onChange={(e) => setRichPaste(e.target.checked)} />
                <span>Convert rich paste to markdown</span>
              </label>
              <label>
                <input type="checkbox" checked={insertTop} onChange={(e) => setInsertTop(e.target.checked)} />
                <span>New entries go to the top</span>
              </label>
              <label>
                <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                <span>Compact mode</span>
              </label>
              <label>
                <input type="checkbox" checked={showHint} onChange={(e) => setShowHint(e.target.checked)} />
                <span>Show the shortcut hints</span>
              </label>
              <hr />
              <button className="danger" onClick={() => { clearAll(); setMenuOpen(false); }}>
                Delete all entries
              </button>
            </div>
          )}
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.txt,.json"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void importFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {receiveOpen && (
        <div className="receive">
          <label htmlFor="receive-code">Transfer code</label>
          <input
            id="receive-code"
            ref={codeRef}
            value={codeInput}
            placeholder="e.g. 7K2QM9X"
            aria-label="Transfer code"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void doReceive(codeInput);
              } else if (e.key === "Escape") {
                e.preventDefault();
                closeReceive();
              }
            }}
          />
          <Btn
            className="primary"
            tip="Fetch that transfer and insert it as new entries"
            hotkey="Enter"
            onClick={() => void doReceive(codeInput)}
            disabled={receiving}
          >
            {receiving ? "Receiving…" : "Receive"}
          </Btn>
          <Btn tip="Close without receiving" hotkey="Esc" onClick={closeReceive}>
            Cancel
          </Btn>
          <span className="receive-note">A code works once, within 24h of being sent.</span>
        </div>
      )}

      {!storageOk && (
        <div className="banner">
          Local storage is full or blocked — entries are kept in memory only and will be lost on
          reload. Use <strong>Backup as .json</strong> now.
        </div>
      )}

      {showHint && (
        <p className="hint">
          <span>
            Entries render on blur. <kbd>Esc</kbd>/<kbd>Ctrl+Enter</kbd> commits · <kbd>j</kbd>
            <kbd>k</kbd> move · <kbd>Enter</kbd> edit · <kbd>a</kbd>/<kbd>b</kbd> insert ·{" "}
            <kbd>dd</kbd> delete · <kbd>r</kbd> raw · <kbd>Shift+M</kbd> merge ·{" "}
            <kbd>Ctrl+Shift+-</kbd> split · <kbd>/</kbd> search · <kbd>s</kbd> send ·{" "}
            <kbd>g</kbd> receive. Stored in this browser only.
          </span>
          <button className="hint-close" onClick={() => setShowHint(false)} aria-label="Hide the shortcut hints">
            ✕
          </button>
        </p>
      )}

      {!loaded ? null : cells.length === 0 ? (
        <div className="empty-state">
          No entries yet. <strong>+ Paste New</strong> drops your clipboard into a fresh entry, or
          drag a <code>.md</code> file anywhere on this page.
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          No entry matches <code>{query}</code>.
        </div>
      ) : (
        visible.map((cell, i) => (
          <CellView
            key={cell.id}
            cell={cell}
            index={cells.indexOf(cell)}
            first={i === 0}
            last={i === visible.length - 1}
            editing={editingId === cell.id}
            selected={selectedId === cell.id}
            raw={!!rawIds[cell.id]}
            collapsed={!!collapsedIds[cell.id]}
            onToggleCollapse={() => toggleCollapsed(cell.id)}
            canMerge={(() => {
              const at = cells.indexOf(cell);
              const next = cells[at + 1];
              return !!next && !isImageCell(cell) && !isImageCell(next);
            })()}
            onSelect={() => setSelectedId(cell.id)}
            onToggleRaw={() => setRawIds((prev) => ({ ...prev, [cell.id]: !prev[cell.id] }))}
            onSplit={(caret) => splitCell(cell.id, caret)}
            onMerge={() => mergeWithNext(cell.id)}
            onEdit={() => beginEdit(cell.id)}
            onCommit={commitEdit}
            onChange={(text) => update(cell.id, text)}
            onCheckbox={() => checkbox(cell.id)}
            onToggleTask={(line) => toggleTask(cell.id, line)}
            onDelete={() => remove(cell.id)}
            onMove={(d) => move(cell.id, d)}
            richPaste={richPaste}
            flashed={flashed === cell.id}
            sendFlashed={flashed === `send-${cell.id}`}
            sending={sendingId === cell.id}
            onSend={() => void sendCell(cell.id)}
            onCopy={async () => {
              try {
                if (isImageCell(cell)) {
                  await copyImage(cell.image!);
                  flash(cell.id);
                  say("Image copied to the clipboard.");
                } else {
                  await writeClipboard(cell.text);
                  flash(cell.id);
                  say("Entry copied.");
                }
              } catch (err) {
                say(err instanceof Error ? err.message : "Copy failed.");
              }
            }}
          />
        ))
      )}

      {dragging && <div className="dropzone">Drop .md or .json to import</div>}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action?.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
