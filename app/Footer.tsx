"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { parseChangelog } from "@/lib/changelog";

const APP_NAME = "md-notebook";
const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

/**
 * Build info and the newest changelog entry, which opens the whole changelog, newest first.
 *
 * Entries come from public/updates.txt, one per line, oldest first, so shipping one is a
 * one-line append and needs no code change. A missing, unreadable or empty file leaves the build
 * info on its own: no button, no message.
 */
export default function Footer() {
  const [entries, setEntries] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Relative, like the static build's asset paths, so a copy hosted in a subfolder still finds
    // it. Over file:// the browser refuses the request and the footer shows build info alone.
    fetch("updates.txt")
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!cancelled) setEntries(parseChangelog(text));
      })
      .catch(() => {
        /* a missing changelog is not worth a message */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = entries.at(-1);

  return (
    <>
      <footer className="build-info">
        <div>
          {APP_NAME} · v{VERSION}
          {BUILD_TIME ? ` · built ${BUILD_TIME}` : ""}
        </div>
        {latest && (
          <button
            type="button"
            className="changelog-trigger"
            title={latest}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            {latest}
          </button>
        )}
      </footer>

      {/* Outside <footer>, so the dialog does not take on the footer's small type. */}
      {open && (
        <Modal title="Changelog" onClose={() => setOpen(false)}>
          <ul className="changelog-list">
            {[...entries].reverse().map((line, i) => (
              // A text child, so React escapes it: an entry cannot inject markup.
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
