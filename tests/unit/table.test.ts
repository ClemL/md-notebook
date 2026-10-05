import { describe, expect, it } from "vitest";
import {
  blankTable,
  deleteTableColumn,
  maybeTable,
  parseCsv,
  parseDelimited,
  parseTable,
  repairPipeTable,
  rowsToMarkdownTable,
  sortTable,
} from "@/lib/table";
import { TEMPLATES } from "@/lib/templates";

describe("editing a table in place", () => {
  const T = "| Name | Qty |\n| --- | ---: |\n| pear | 10 |\n| apple | $2.50 |\n|  | 1,200 |\n| Item 10 | (4) |\n| item 2 | -3% |";

  it("recognizes an entry that is one table and nothing else", () => {
    expect(parseTable(T)?.header).toEqual(["Name", "Qty"]);
    expect(parseTable(`${T}\n`)).not.toBeNull();
    expect(parseTable(`Intro\n\n${T}`)).toBeNull();
    expect(parseTable(`${T}\n\nAfterword`)).toBeNull();
    expect(parseTable("| a | b |\n| 1 | 2 |")).toBeNull();
  });

  it("sorts text naturally with blanks last, and keeps the alignment row", () => {
    const out = sortTable(T, 0, "asc")!;
    expect(out.split("\n")[1]).toBe("| --- | ---: |");
    expect(parseTable(out)!.rows.map((r) => r[0])).toEqual(["apple", "item 2", "Item 10", "pear", ""]);
    expect(parseTable(sortTable(T, 0, "desc")!)!.rows.map((r) => r[0])).toEqual([
      "pear",
      "Item 10",
      "item 2",
      "apple",
      "",
    ]);
  });

  it("sorts numbers, currency, thousands, percents and accounting negatives as numbers", () => {
    const qty = parseTable(sortTable(T, 1, "asc")!)!.rows.map((r) => r[1]);
    expect(qty).toEqual(["(4)", "-3%", "$2.50", "10", "1,200"]);
  });

  it("keeps escaped pipes inside cells", () => {
    const t = "| a | b |\n| - | - |\n| x \\| y | 2 |\n| w | 1 |";
    expect(sortTable(t, 1, "asc")).toBe("| a | b |\n| - | - |\n| w | 1 |\n| x \\| y | 2 |");
  });

  it("deletes a column, but never the last one", () => {
    expect(deleteTableColumn(T, 0)).toBe("| Qty |\n| ---: |\n| 10 |\n| $2.50 |\n| 1,200 |\n| (4) |\n| -3% |");
    expect(deleteTableColumn("| a |\n| - |\n| 1 |", 0)).toBeNull();
    expect(deleteTableColumn(T, 5)).toBeNull();
  });
});

describe("tab-separated paste", () => {
  it("converts an Excel grid to a markdown table", () => {
    const tsv = "Vendor\tFeed\tOwner\nPharmaForce\tdaily\tSrini\nOptum\tweekly\tTeja";
    expect(maybeTable(tsv)).toBe(
      [
        "| Vendor | Feed | Owner |",
        "| --- | --- | --- |",
        "| PharmaForce | daily | Srini |",
        "| Optum | weekly | Teja |",
      ].join("\n"),
    );
  });

  it("escapes pipes inside cells", () => {
    expect(maybeTable("a\tb\nx|y\tz")).toContain("| x\\|y | z |");
  });

  it("ignores single lines, untabbed text and ragged grids", () => {
    expect(parseDelimited("Vendor\tFeed")).toBeNull();
    expect(parseDelimited("no tabs here\nsecond line")).toBeNull();
    expect(parseDelimited("a\tb\tc\td\ne")).toBeNull();
  });
});

describe("pipe rows without a delimiter row", () => {
  it("inserts the delimiter row GFM requires", () => {
    expect(repairPipeTable("| Vendor | Feed |\n| Optum | weekly |")).toBe(
      "| Vendor | Feed |\n| --- | --- |\n| Optum | weekly |",
    );
  });

  it("leaves a table that already has one alone", () => {
    expect(repairPipeTable("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBeNull();
    expect(repairPipeTable("| a | b |\n|:--|--:|\n| 1 | 2 |")).toBeNull();
  });

  it("refuses rows of differing widths and prose containing a pipe", () => {
    expect(repairPipeTable("| a | b |\n| 1 |")).toBeNull();
    expect(repairPipeTable("run a | b to pipe\nthen c | d | e")).toBeNull();
  });
});

describe("rowsToMarkdownTable", () => {
  it("pads short rows to the widest row", () => {
    expect(rowsToMarkdownTable([["a", "b", "c"], ["1"]])).toBe(
      "| a | b | c |\n| --- | --- | --- |\n| 1 |  |  |",
    );
  });
});

describe("blank table templates", () => {
  it("builds a 2x2 with a header row", () => {
    expect(blankTable(2, 2)).toBe(
      "| Column A | Column B |\n| --- | --- |\n|  |  |\n|  |  |\n",
    );
  });

  it("builds a 3x3", () => {
    const md = blankTable(3, 3);
    expect(md.split("\n").filter(Boolean)).toHaveLength(5);
    expect(md).toContain("| Column A | Column B | Column C |");
  });

  it("is offered as templates", () => {
    expect(TEMPLATES.map((t) => t.label)).toEqual(
      expect.arrayContaining(["Table 2×2", "Table 3×3"]),
    );
  });
});

describe("CSV paste", () => {
  const SAMPLE = [
    '"ServerName","ResourceGroup","Location","DatabaseName","Edition","Sku","ElasticPool","Status","BackupRedundancy","PitrDays","DiffBackupHours","LtrWeekly","LtrMonthly","LtrYearly","LtrWeekOfYear","LtrBackupCount","Flag_LowPitr","Flag_NoLtr","Error"',
    '"bilhinscriptprod2","BILH","centralus","Prod","BusinessCritical","BC_Gen5",,"Online","Geo","7","12","P8W","P26W","P52W","1",,"False","False",',
    '"bilhinscripttest2","BILH","centralus","Test","GeneralPurpose","GP_Gen5",,"Online","Geo","7","12","P4W","P8W","Off",,,"False","False",',
    '"orginscriptprod2","Org","centralus","Prod","GeneralPurpose","GP_Gen5",,"Online","Geo","7","12","P4W","P8W","Off",,,"False","False",',
  ].join("\r\n");

  it("turns an exported CSV into a table, first row as the header, empty fields kept", () => {
    const rows = parseCsv(SAMPLE)!;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.length === 19)).toBe(true);
    expect(rows[0][0]).toBe("ServerName");
    expect(rows[1].slice(5, 8)).toEqual(["BC_Gen5", "", "Online"]);
    expect(rows[2][18]).toBe("");

    const md = maybeTable(SAMPLE)!;
    const lines = md.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0].startsWith("| ServerName | ResourceGroup | Location |")).toBe(true);
    expect(lines[1]).toBe(`| ${Array(19).fill("---").join(" | ")} |`);
    expect(lines[2]).toContain("| BC_Gen5 |  | Online |");
  });

  it("handles commas, doubled quotes and line breaks inside quoted fields", () => {
    const csv = 'name,note,count\n"Smith, J","said ""hi""",3\n"Lee","two\nlines",4';
    expect(parseCsv(csv)).toEqual([
      ["name", "note", "count"],
      ["Smith, J", 'said "hi"', "3"],
      ["Lee", "two lines", "4"],
    ]);
    // A comma inside a cell does not split it, and a pipe is escaped for markdown.
    expect(maybeTable('a,b\n"x|y","1,2"')).toBe("| a | b |\n| --- | --- |\n| x\\|y | 1,2 |");
  });

  it("leaves prose with commas alone", () => {
    expect(parseCsv("Hello, world.\nYes, sure.")).toBeNull();
    expect(maybeTable("We met Kris, Srini and Teja.\nThen lunch, then the review.")).toBeNull();
    // Rows of different widths are not a table.
    expect(parseCsv("a,b,c\n1,2\n3,4,5")).toBeNull();
    // A single row is not a table either.
    expect(parseCsv('"a","b","c"')).toBeNull();
    // An unterminated quote is not CSV.
    expect(parseCsv('a,b,c\n"1,2,3')).toBeNull();
  });
});
