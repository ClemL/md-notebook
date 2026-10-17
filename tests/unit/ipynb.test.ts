import { describe, expect, it } from "vitest";
import { parseIpynb, partsToCells, toIpynb } from "@/lib/ipynb";
import type { Cell } from "@/lib/markdown";
import type { StoredImage } from "@/lib/image";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

const text: Cell = { id: "a1", text: "# Title\nline two\n", createdAt: 1000, updatedAt: 2000 };
const image: Cell = {
  id: "b2",
  text: "",
  createdAt: 3000,
  updatedAt: 4000,
  image: {
    dataUrl: PNG,
    width: 40,
    height: 20,
    bytes: PNG.length,
    addedAt: 3000,
    name: "shot.png",
    view: "width",
    annotations: [{ id: "s", kind: "rect", x1: 1, y1: 2, x2: 3, y2: 4, color: "#ff5c5c" }],
  },
};

const fakeStore = async (dataUrl: string): Promise<StoredImage> => ({
  dataUrl,
  width: 1,
  height: 1,
  bytes: dataUrl.length,
  addedAt: 0,
});

describe("exporting a notebook", () => {
  const nb = JSON.parse(toIpynb([text, image], new Map([["b2", "data:image/png;base64,RkxBVA=="]])));

  it("writes nbformat 4.5 markdown cells with line-split source", () => {
    expect(nb.nbformat).toBe(4);
    expect(nb.nbformat_minor).toBe(5);
    expect(nb.cells[0]).toMatchObject({
      cell_type: "markdown",
      id: "a1",
      source: ["# Title\n", "line two\n"],
      metadata: { mdnb: { createdAt: 1000, updatedAt: 2000 } },
    });
  });

  it("attaches the flattened picture and keeps the clean original in the metadata", () => {
    const cell = nb.cells[1];
    expect(cell.source).toEqual(["![shot.png](attachment:image.png)"]);
    expect(cell.attachments).toEqual({ "image.png": { "image/png": "RkxBVA==" } });
    expect(cell.metadata.mdnb.image.original).toBe(PNG);
    expect(cell.metadata.mdnb.image.dataUrl).toBeUndefined();
  });

  it("round-trips text, timestamps, pixels and annotations", async () => {
    const back = await partsToCells(parseIpynb(toIpynb([text, image])), fakeStore);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ text: "# Title\nline two", createdAt: 1000, updatedAt: 2000 });
    expect(back[1].image).toEqual({ ...image.image, bytes: PNG.length });
    expect(back[1]).toMatchObject({ createdAt: 3000, updatedAt: 4000 });
  });

  it("restores the clean original of an annotated image, not the flattened copy", async () => {
    const back = await partsToCells(
      parseIpynb(toIpynb([image], new Map([["b2", "data:image/png;base64,RkxBVA=="]]))),
      fakeStore,
    );
    expect(back[0].image?.dataUrl).toBe(PNG);
    expect(back[0].image?.annotations).toHaveLength(1);
  });
});

describe("importing a notebook from Jupyter or VS Code", () => {
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { language_info: { name: "python" } },
    cells: [
      { cell_type: "markdown", source: ["Intro ", "text\n", "![x](attachment:p.png)"], attachments: { "p.png": { "image/png": "QUJD" } } },
      {
        cell_type: "code",
        source: "print(1)\ndf.head()",
        outputs: [
          { output_type: "stream", text: ["1\n"] },
          { output_type: "execute_result", data: { "text/plain": ["   a\n", "0  1"] } },
          { output_type: "display_data", data: { "image/png": "REVG\n", "text/plain": "<Figure>" } },
        ],
      },
      { cell_type: "raw", source: "raw ```stuff```" },
      { cell_type: "code", source: "", outputs: [] },
    ],
  };

  it("keeps markdown, fences code with its output, and lifts images into their own entries", () => {
    const parts = parseIpynb(JSON.stringify(nb));
    expect(parts).toEqual([
      { kind: "text", text: "Intro text" },
      { kind: "image", dataUrl: "data:image/png;base64,QUJD" },
      { kind: "text", text: "```python\nprint(1)\ndf.head()\n```\n\n```text\n1\n   a\n0  1\n```" },
      { kind: "image", dataUrl: "data:image/png;base64,REVG" },
      { kind: "text", text: "````\nraw ```stuff```\n````" },
    ]);
  });

  it("sends foreign images through the store, which fits them to the budget", async () => {
    const cells = await partsToCells(parseIpynb(JSON.stringify(nb)), fakeStore, 99);
    expect(cells.filter((c) => c.image).map((c) => c.image!.width)).toEqual([1, 1]);
    expect(cells[0].createdAt).toBe(99);
  });

  it("refuses what is not an nbformat 4 notebook", () => {
    expect(() => parseIpynb("{")).toThrow(/not valid JSON/);
    expect(() => parseIpynb('{"worksheets": []}')).toThrow(/nbformat 4/);
    expect(() => parseIpynb('{"cells": 1}')).toThrow(/not a Jupyter notebook/);
  });
});
