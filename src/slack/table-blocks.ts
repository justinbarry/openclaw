/**
 * Extract markdown tables from text and convert them to Slack Block Kit table blocks.
 *
 * Slack constraints:
 * - Only 1 table block per message (sent as attachment)
 * - Max 100 rows, max 20 columns
 * - Table block uses raw_text or rich_text cells
 *
 * Strategy: parse the markdown to find pipe-delimited tables, extract the first one,
 * return the remaining text (with the table removed) plus a Block Kit table block.
 */

import type { KnownBlock } from "@slack/web-api";

type TableData = {
  headers: string[];
  rows: string[][];
  /** Start index in original text */
  start: number;
  /** End index in original text (exclusive) */
  end: number;
};

/**
 * Regex-based extraction of the first markdown pipe table from text.
 * This avoids needing the full markdown-it IR pipeline.
 */
function extractFirstTable(text: string): TableData | null {
  const lines = text.split("\n");
  let tableStart = -1;
  let tableEnd = -1;
  let headers: string[] = [];
  const rows: string[][] = [];
  let inTable = false;
  let pastSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!inTable) {
      // Look for a header row: | col1 | col2 | ...
      if (line.startsWith("|") && line.endsWith("|") && line.includes("|", 1)) {
        const cells = parsePipeRow(line);
        if (cells.length >= 1) {
          // Check next line is separator: | --- | --- |
          const nextLine = lines[i + 1]?.trim();
          if (nextLine && isSeparatorRow(nextLine)) {
            inTable = true;
            pastSeparator = false;
            tableStart = i;
            headers = cells;
            continue;
          }
        }
      }
      continue;
    }

    // We're inside a table
    if (!pastSeparator) {
      // This should be the separator row
      if (isSeparatorRow(line)) {
        pastSeparator = true;
        continue;
      }
      // Not a valid table after all
      inTable = false;
      headers = [];
      continue;
    }

    // Data rows
    if (line.startsWith("|")) {
      const cells = parsePipeRow(line);
      rows.push(cells);
      tableEnd = i;
    } else {
      // End of table
      break;
    }
  }

  if (!inTable || headers.length === 0 || rows.length === 0) {
    return null;
  }

  // Compute character offsets
  let charStart = 0;
  for (let i = 0; i < tableStart; i++) {
    charStart += lines[i].length + 1; // +1 for newline
  }
  let charEnd = charStart;
  for (let i = tableStart; i <= (tableEnd === -1 ? tableStart + 1 : tableEnd); i++) {
    charEnd += lines[i].length + 1;
  }
  // Include the separator line
  // Recalculate: tableStart is header, tableStart+1 is separator, then rows until tableEnd
  charEnd = 0;
  for (let i = 0; i <= Math.max(tableEnd, tableStart + 1); i++) {
    charEnd += lines[i].length + 1;
  }
  charStart = 0;
  for (let i = 0; i < tableStart; i++) {
    charStart += lines[i].length + 1;
  }

  return {
    headers: headers.slice(0, 20), // Slack max 20 columns
    rows: rows.slice(0, 99).map((row) => row.slice(0, 20)), // 99 data rows + 1 header = 100
    start: charStart,
    end: charEnd,
  };
}

function parsePipeRow(line: string): string[] {
  // Remove leading/trailing pipes and split
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  if (!line.startsWith("|")) {
    return false;
  }
  // Match patterns like | --- | :---: | ---: |
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  const cells = inner.split("|");
  return cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

/**
 * Build a Slack Block Kit table block from parsed table data.
 */
function buildTableBlock(table: TableData): KnownBlock {
  const headerRow = table.headers.map((h) => ({
    type: "raw_text" as const,
    text: h || " ",
  }));

  const dataRows = table.rows.map((row) => {
    // Pad or truncate to match header count
    const cells: Array<{ type: "raw_text"; text: string }> = [];
    for (let i = 0; i < table.headers.length; i++) {
      cells.push({
        type: "raw_text" as const,
        text: (row[i] ?? "–").trim() || " ",
      });
    }
    return cells;
  });

  const allRows = [headerRow, ...dataRows];

  const columnSettings = table.headers.map(() => ({
    is_wrapped: true,
  }));

  // Slack's KnownBlock types may not include "table" yet, so cast
  return {
    type: "table",
    column_settings: columnSettings,
    rows: allRows,
  } as unknown as KnownBlock;
}

export type SlackTableExtraction = {
  /** Text with the first table removed */
  text: string;
  /** Block Kit table block, or null if no table found */
  tableBlock: KnownBlock | null;
};

/**
 * Extract the first markdown table from text and return:
 * - The text with the table removed (cleaned up)
 * - A Slack Block Kit table block
 *
 * If no table is found, returns the original text and null block.
 */
export function extractSlackTableBlock(markdown: string): SlackTableExtraction {
  const table = extractFirstTable(markdown);
  if (!table) {
    return { text: markdown, tableBlock: null };
  }

  // Remove the table from the text
  const before = markdown.slice(0, table.start).trimEnd();
  const after = markdown.slice(table.end).trimStart();
  const text = [before, after].filter(Boolean).join("\n\n");

  return {
    text,
    tableBlock: buildTableBlock(table),
  };
}
