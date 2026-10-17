"use client";

import { useEffect, useState } from "react";
import Btn from "./Btn";
import { timestamp } from "@/lib/markdown";
import { toCsv, toJsonRows, toSqlInsert, toSqlValues, toTsv } from "@/lib/table";

const SQL_TABLE_KEY = "md-notebook:sqltable";

/**
 * The side panel for what is used now and then: the selected table as TSV, CSV, JSON or T-SQL,
 * printing, and the notebook in Jupyter format. Kept out of the header and the entry toolbars so
 * the everyday controls stay uncluttered.
 */
export default function ToolsPanel({
  table,
  entryLabel,
  filtering,
  flashed,
  onCopy,
  onDownload,
  onCopyAllRich,
  onPrint,
  onExportIpynb,
  onImport,
  onClose,
}: {
  /** The selected entry's table as plain rows, header first; null when it is not a table. */
  table: string[][] | null;
  /** "[3]" for the selected entry, or null when nothing is selected. */
  entryLabel: string | null;
  filtering: boolean;
  flashed: string | null;
  onCopy: (flashId: string, text: string, message: string) => void;
  onDownload: (flashId: string, filename: string, text: string, mime: string) => void;
  onCopyAllRich: () => void;
  onPrint: () => void;
  onExportIpynb: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  const [sqlTable, setSqlTable] = useState("#Pasted");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SQL_TABLE_KEY);
      if (saved) setSqlTable(saved);
    } catch {
      /* storage blocked: keep the default name */
    }
  }, []);

  const rename = (name: string) => {
    setSqlTable(name);
    try {
      localStorage.setItem(SQL_TABLE_KEY, name);
    } catch {
      /* not worth a warning */
    }
  };

  const size = table ? `${table.length - 1} rows × ${table[0].length} columns` : "";
  const copy = (id: string, text: string, what: string) => onCopy(`tools:${id}`, text, `Copied the table as ${what}.`);
  const all = filtering ? "filtered entries" : "all entries";

  return (
    <aside className="tools-panel" aria-label="Tools">
      <div className="tools-head">
        <strong>Tools</strong>
        <span className="spacer" />
        <Btn tip="Close the tools panel" hotkey="Esc" onClick={onClose}>
          ✕
        </Btn>
      </div>

      <section>
        <h3>Selected table {entryLabel && table ? <span className="dim">{entryLabel}</span> : null}</h3>
        {!table ? (
          <p className="dim">
            {entryLabel
              ? `Entry ${entryLabel} is not a table. Select an entry that is one markdown table and nothing else.`
              : "Select a table entry (click it, or j / k) to copy it out as data."}
          </p>
        ) : (
          <>
            <p className="dim">{size}</p>
            <div className="tools-row">
              <Btn tip="Tab-separated, for pasting into Excel" flash={flashed === "tools:tsv"} onClick={() => copy("tsv", toTsv(table), "TSV")}>
                Copy TSV
              </Btn>
            </div>
            <div className="tools-row">
              <Btn tip="Comma-separated values" flash={flashed === "tools:csv"} onClick={() => copy("csv", toCsv(table), "CSV")}>
                Copy CSV
              </Btn>
              <Btn
                tip="Download as a .csv file"
                flash={flashed === "tools:csv-file"}
                onClick={() => onDownload("tools:csv-file", `table_${timestamp()}.csv`, toCsv(table), "text/csv")}
              >
                .csv ⬇
              </Btn>
            </div>
            <div className="tools-row">
              <Btn tip="An array of objects keyed by the header" flash={flashed === "tools:json"} onClick={() => copy("json", toJsonRows(table), "JSON")}>
                Copy JSON
              </Btn>
              <Btn
                tip="Download as a .json file"
                flash={flashed === "tools:json-file"}
                onClick={() => onDownload("tools:json-file", `table_${timestamp()}.json`, toJsonRows(table), "application/json")}
              >
                .json ⬇
              </Btn>
            </div>
            <label className="tools-field">
              <span>SQL table</span>
              <input
                type="text"
                value={sqlTable}
                spellCheck={false}
                aria-label="SQL table name"
                onChange={(e) => rename(e.target.value)}
              />
            </label>
            <div className="tools-row">
              <Btn
                tip="CREATE TABLE plus INSERT … VALUES, in batches of 1000 rows"
                flash={flashed === "tools:sql-insert"}
                onClick={() => copy("sql-insert", toSqlInsert(table, sqlTable), "SQL INSERT statements")}
              >
                Copy INSERT
              </Btn>
              <Btn
                tip="SELECT * FROM (VALUES …) AS t (…), to join against without creating a table"
                flash={flashed === "tools:sql-values"}
                onClick={() => copy("sql-values", toSqlValues(table), "a SQL VALUES list")}
              >
                Copy VALUES
              </Btn>
            </div>
          </>
        )}
      </section>

      <section>
        <h3>Notebook</h3>
        <div className="tools-row">
          <Btn tip={`Copy the ${all} formatted, for Outlook, Teams and Word`} flash={flashed === "copy-all-rich"} onClick={onCopyAllRich}>
            Copy rich text
          </Btn>
        </div>
        <div className="tools-row">
          <Btn tip={`Print the ${all}, or choose Save as PDF in the print dialog`} hotkey="Ctrl+P" onClick={onPrint}>
            Print / PDF
          </Btn>
        </div>
        <div className="tools-row">
          <Btn tip={`Download the ${all} as a Jupyter notebook, images included`} flash={flashed === "export-ipynb"} onClick={onExportIpynb}>
            Export .ipynb
          </Btn>
          <Btn tip="Import .ipynb, .md, .json, .csv or .tsv files" onClick={onImport}>
            Import…
          </Btn>
        </div>
      </section>
    </aside>
  );
}
