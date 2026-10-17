"use client";

import { useEffect, useState, type ReactNode } from "react";

type MermaidApi = typeof import("mermaid").default;

/**
 * Mermaid is a couple of megabytes, so it is fetched the first time a ```mermaid block renders
 * and never otherwise. `strict` security sanitizes labels and disables click handlers, so a
 * pasted diagram cannot run script.
 */
let loader: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  loader ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
    return mermaid;
  });
  return loader;
}

let seq = 0;

/**
 * A ```mermaid fenced block drawn as a diagram. Until the library arrives, and when the diagram
 * does not parse, the source shows as an ordinary code block (`fallback`), with the parse error
 * above it.
 */
export default function MermaidDiagram({ code, fallback }: { code: string; fallback: ReactNode }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const id = `mermaid-${++seq}`;
    loadMermaid()
      .then(async (mermaid) => {
        await mermaid.parse(code);
        const { svg } = await mermaid.render(id, code);
        if (live) {
          setSvg(svg);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        // A failed render can leave its scratch element behind in <body>.
        document.getElementById(`d${id}`)?.remove();
        if (!live) return;
        setSvg(null);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [code]);

  if (svg) {
    return <div className="mermaid-diagram" role="img" aria-label="Mermaid diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  return (
    <>
      {error && <div className="mermaid-error">Mermaid: {error.split("\n")[0]}</div>}
      {fallback}
    </>
  );
}
