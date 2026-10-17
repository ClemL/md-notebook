import { describe, expect, it } from "vitest";
import {
  maybeTable,
  parseCsv,
  parseJsonRows,
  tableRows,
  toCsv,
  toJsonRows,
  toSqlInsert,
  toSqlValues,
  toTsv,
} from "@/lib/table";

describe("a pasted JSON array becomes a table", () => {
  it("takes keys in first-seen order, blanks nulls, and stringifies nested values", () => {
    const json = JSON.stringify([
      { name: "rg-prod", location: "eastus", tags: null },
      { name: "rg-dev", location: "westus", tags: { env: "dev" }, extra: 3 },
    ]);
    expect(parseJsonRows(json)).toEqual([
      ["name", "location", "tags", "extra"],
      ["rg-prod", "eastus", "", ""],
      ["rg-dev", "westus", '{"env":"dev"}', "3"],
    ]);
    expect(maybeTable(json)).toBe(
      [
        "| name | location | tags | extra |",
        "| --- | --- | --- | --- |",
        "| rg-prod | eastus |  |  |",
        '| rg-dev | westus | {"env":"dev"} | 3 |',
      ].join("\n"),
    );
  });

  it("unwraps an Azure DevOps { count, value } envelope", () => {
    expect(parseJsonRows('{"count":1,"value":[{"id":7,"name":"Main"}]}')).toEqual([
      ["id", "name"],
      ["7", "Main"],
    ]);
  });

  it("leaves anything else alone", () => {
    expect(parseJsonRows("[1, 2, 3]")).toBeNull();
    expect(parseJsonRows('{"id": 1}')).toBeNull();
    expect(parseJsonRows("[]")).toBeNull();
    expect(parseJsonRows("[{}]")).toBeNull();
    expect(parseJsonRows("[not json")).toBeNull();
    expect(parseJsonRows("plain prose")).toBeNull();
  });
});

describe("a .csv file is read without the prose guard", () => {
  it("accepts two unquoted columns only when told the text is CSV", () => {
    expect(parseCsv("a,b\n1,2")).toBeNull();
    expect(parseCsv("a,b\n1,2", { strict: false })).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("copying a table back out", () => {
  const T = [
    "| Id | Name | Amount | Note |",
    "| --- | --- | ---: | --- |",
    "| 007 | O'Brien | 12.5 | a \\| b |",
    "| 8 | Smith, J | 1,200 |  |",
  ].join("\n");
  const rows = tableRows(T)!;

  it("reads the cells as data: escaped pipes restored", () => {
    expect(rows).toEqual([
      ["Id", "Name", "Amount", "Note"],
      ["007", "O'Brien", "12.5", "a | b"],
      ["8", "Smith, J", "1,200", ""],
    ]);
    expect(tableRows("not a table")).toBeNull();
  });

  it("writes TSV for Excel and RFC 4180 CSV", () => {
    expect(toTsv(rows)).toBe("Id\tName\tAmount\tNote\n007\tO'Brien\t12.5\ta | b\n8\tSmith, J\t1,200\t\n");
    expect(toCsv([["a", 'say "hi"'], ["x,y", "line\nbreak"]])).toBe('a,"say ""hi"""\r\n"x,y","line\nbreak"\r\n');
  });

  it("writes JSON with plain numbers as numbers and empty cells as null", () => {
    expect(JSON.parse(toJsonRows(rows))).toEqual([
      { Id: "007", Name: "O'Brien", Amount: 12.5, Note: "a | b" },
      { Id: 8, Name: "Smith, J", Amount: "1,200", Note: null },
    ]);
    expect(JSON.parse(toJsonRows([["A", "A", ""], ["1", "2", "3"]]))).toEqual([{ A: 1, A_2: 2, Column3: 3 }]);
  });

  it("writes T-SQL with quoted names, N'' strings and NULLs", () => {
    expect(toSqlInsert(rows, "#Tmp")).toBe(
      [
        "CREATE TABLE #Tmp (",
        "    [Id] NVARCHAR(MAX) NULL,",
        "    [Name] NVARCHAR(MAX) NULL,",
        "    [Amount] NVARCHAR(MAX) NULL,",
        "    [Note] NVARCHAR(MAX) NULL",
        ");",
        "",
        "INSERT INTO #Tmp ([Id], [Name], [Amount], [Note]) VALUES",
        "    (N'007', N'O''Brien', 12.5, N'a | b'),",
        "    (8, N'Smith, J', N'1,200', NULL);",
        "",
      ].join("\n"),
    );
    expect(toSqlValues([["a]b"], ["1"]])).toBe("SELECT *\nFROM (VALUES\n    (1)\n) AS t ([a]]b]);\n");
  });

  it("splits INSERTs at SQL Server's 1000-row VALUES limit", () => {
    const big = [["n"], ...Array.from({ length: 2001 }, (_, i) => [String(i)])];
    expect(toSqlInsert(big).match(/INSERT INTO/g)).toHaveLength(3);
  });
});
