/**
 * Slack Block Kit table rendering.
 *
 * Extracts the first markdown table from a message and converts it to a
 * native Slack `table` block.  The Slack API allows at most one table block
 * per message and caps tables at 100 rows / 20 columns.
 */

import type { KnownBlock, RawTextElement } from "@slack/web-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtractedTable = {
  headers: string[];
  rows: string[][];
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Quick heuristic: does the text contain a markdown table separator row? */
export function containsMarkdownTable(text: string): boolean {
  // Look for a pipe-delimited separator row like |---|---| or | :---: | --- |
  return /^\|[\s:]*-{3,}[\s:]*\|/m.test(text);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

// Matches a full markdown table:
//   header row  |...|...|
//   separator   |---|---|  (with optional alignment colons)
//   data rows   |...|...|  (one or more)
const TABLE_RE =
  /^(\|[^\n]+\|)\n(\|[\s:]*-{3,}[\s:]*(?:\|[\s:]*-{3,}[\s:]*)*\|)\n((?:\|[^\n]+\|\n?)+)/m;

function parsePipeRow(row: string): string[] {
  // Strip leading/trailing pipes and split on inner pipes
  const trimmed = row.trim();
  const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailing = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  return withoutTrailing.split("|").map((cell) => cell.trim());
}

/**
 * Extract the first markdown table from `text`.
 * Returns the remaining text (table removed) and the parsed table, or null
 * if no table is found.
 */
export function extractFirstTable(text: string): {
  textWithoutTable: string;
  table: ExtractedTable | null;
} {
  const match = TABLE_RE.exec(text);
  if (!match) {
    return { textWithoutTable: text, table: null };
  }

  const headerRow = match[1] ?? "";
  const dataBlock = match[3] ?? "";

  const headers = parsePipeRow(headerRow);
  const rows = dataBlock
    .trim()
    .split("\n")
    .map((line) => parsePipeRow(line));

  // Remove the matched table from text
  const tableStart = match.index ?? 0;
  const tableEnd = tableStart + match[0].length;
  const before = text.slice(0, tableStart);
  const after = text.slice(tableEnd);
  // Collapse excessive blank lines at the seam
  const textWithoutTable = (before + after).replace(/\n{3,}/g, "\n\n").trim();

  return {
    textWithoutTable,
    table: { headers, rows },
  };
}

// ---------------------------------------------------------------------------
// Block Kit builder
// ---------------------------------------------------------------------------

const MAX_ROWS = 100;
const MAX_COLUMNS = 20;

function rawTextCell(text: string): RawTextElement {
  return { type: "raw_text", text };
}

/** Convert an extracted table to a Slack `table` Block Kit block. */
export function buildSlackTableBlock(table: ExtractedTable): KnownBlock {
  const colCount = Math.min(table.headers.length, MAX_COLUMNS);
  const headers = table.headers.slice(0, colCount);
  const rows = table.rows.slice(0, MAX_ROWS).map((row) => {
    const cells = row.slice(0, colCount);
    // Pad short rows with empty cells
    while (cells.length < colCount) {
      cells.push("");
    }
    return cells.map((cell) => rawTextCell(cell));
  });

  // Header row is the first row in the rows array for Slack table blocks
  const headerCells = headers.map((h) => rawTextCell(h));

  return {
    type: "table",
    rows: [headerCells, ...rows],
  } as KnownBlock;
}
