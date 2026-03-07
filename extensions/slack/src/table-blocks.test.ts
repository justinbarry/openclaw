import { describe, expect, it } from "vitest";
import { buildSlackTableBlock, containsMarkdownTable, extractFirstTable } from "./table-blocks.js";

describe("containsMarkdownTable", () => {
  it("detects a standard markdown table", () => {
    const text = "| A | B |\n|---|---|\n| 1 | 2 |";
    expect(containsMarkdownTable(text)).toBe(true);
  });

  it("detects a table with alignment markers", () => {
    const text = "| A | B |\n| :---: | ---: |\n| 1 | 2 |";
    expect(containsMarkdownTable(text)).toBe(true);
  });

  it("detects a table embedded in surrounding text", () => {
    const text = "Hello\n\n| X | Y |\n|---|---|\n| a | b |\n\nGoodbye";
    expect(containsMarkdownTable(text)).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(containsMarkdownTable("no tables here")).toBe(false);
  });

  it("returns false for a pipe used in code", () => {
    expect(containsMarkdownTable("cmd | grep foo")).toBe(false);
  });

  it("returns false for incomplete separator (too few dashes)", () => {
    expect(containsMarkdownTable("| A |\n|--|\n| 1 |")).toBe(false);
  });
});

describe("extractFirstTable", () => {
  it("extracts a simple table", () => {
    const md = "| Name | Age |\n|---|---|\n| Alice | 30 |\n| Bob | 25 |";
    const result = extractFirstTable(md);
    expect(result.table).toEqual({
      headers: ["Name", "Age"],
      rows: [
        ["Alice", "30"],
        ["Bob", "25"],
      ],
    });
    expect(result.textWithoutTable).toBe("");
  });

  it("preserves surrounding text", () => {
    const md = "Intro paragraph\n\n| H1 | H2 |\n|---|---|\n| a | b |\n\nOutro paragraph";
    const result = extractFirstTable(md);
    expect(result.table).not.toBeNull();
    expect(result.table!.headers).toEqual(["H1", "H2"]);
    expect(result.textWithoutTable).toContain("Intro paragraph");
    expect(result.textWithoutTable).toContain("Outro paragraph");
  });

  it("extracts only the first table when multiple exist", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n\n| C | D |\n|---|---|\n| 3 | 4 |";
    const result = extractFirstTable(md);
    expect(result.table!.headers).toEqual(["A", "B"]);
    // The second table remains in the text
    expect(result.textWithoutTable).toContain("| C | D |");
  });

  it("returns null when no table is present", () => {
    const result = extractFirstTable("just some text");
    expect(result.table).toBeNull();
    expect(result.textWithoutTable).toBe("just some text");
  });

  it("handles tables with alignment markers in separator", () => {
    const md = "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |";
    const result = extractFirstTable(md);
    expect(result.table).toEqual({
      headers: ["Left", "Center", "Right"],
      rows: [["a", "b", "c"]],
    });
  });

  it("handles a single-row table", () => {
    const md = "| H |\n|---|\n| V |";
    const result = extractFirstTable(md);
    expect(result.table).toEqual({
      headers: ["H"],
      rows: [["V"]],
    });
  });
});

describe("buildSlackTableBlock", () => {
  it("builds a table block with correct structure", () => {
    const block = buildSlackTableBlock({
      headers: ["Name", "Score"],
      rows: [
        ["Alice", "95"],
        ["Bob", "87"],
      ],
    });

    expect(block).toEqual({
      type: "table",
      rows: [
        [
          { type: "raw_text", text: "Name" },
          { type: "raw_text", text: "Score" },
        ],
        [
          { type: "raw_text", text: "Alice" },
          { type: "raw_text", text: "95" },
        ],
        [
          { type: "raw_text", text: "Bob" },
          { type: "raw_text", text: "87" },
        ],
      ],
    });
  });

  it("truncates to 100 rows", () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`row${i}`]);
    const block = buildSlackTableBlock({ headers: ["Col"], rows });
    // 1 header row + 100 data rows
    expect((block as { rows: unknown[][] }).rows).toHaveLength(101);
  });

  it("truncates to 20 columns", () => {
    const headers = Array.from({ length: 25 }, (_, i) => `H${i}`);
    const rows = [Array.from({ length: 25 }, (_, i) => `C${i}`)];
    const block = buildSlackTableBlock({ headers, rows });
    const tableRows = (block as { rows: unknown[][] }).rows;
    // Each row should have exactly 20 cells
    expect(tableRows[0]).toHaveLength(20);
    expect(tableRows[1]).toHaveLength(20);
  });

  it("pads short rows with empty cells", () => {
    const block = buildSlackTableBlock({
      headers: ["A", "B", "C"],
      rows: [["only-one"]],
    });
    const dataRow = (block as { rows: { type: string; text: string }[][] }).rows[1];
    expect(dataRow).toHaveLength(3);
    expect(dataRow[0]).toEqual({ type: "raw_text", text: "only-one" });
    expect(dataRow[1]).toEqual({ type: "raw_text", text: "" });
    expect(dataRow[2]).toEqual({ type: "raw_text", text: "" });
  });
});
