/**
 * Enhanced Slack Block Kit formatting.
 *
 * Extracts structured markdown elements and converts them to Block Kit blocks:
 * - Headers: # Heading → header block
 * - Callouts: > [!NOTE], > [!WARNING], etc. → styled sections with emoji
 * - Images: ![alt](url) → image blocks (for standalone images)
 * - Task lists: - [ ] / - [x] → emoji checkboxes
 */

import type { Block, KnownBlock } from "@slack/web-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExtractedContent = {
  blocks: (Block | KnownBlock)[];
  text: string;
};

type CalloutType = "note" | "tip" | "important" | "warning" | "caution";

type CalloutInfo = {
  type: CalloutType;
  emoji: string;
  label: string;
};

const CALLOUT_CONFIG: Record<CalloutType, CalloutInfo> = {
  note: { type: "note", emoji: ":information_source:", label: "NOTE" },
  tip: { type: "tip", emoji: ":bulb:", label: "TIP" },
  important: { type: "important", emoji: ":exclamation:", label: "IMPORTANT" },
  warning: { type: "warning", emoji: ":warning:", label: "WARNING" },
  caution: { type: "caution", emoji: ":no_entry_sign:", label: "CAUTION" },
};

// ---------------------------------------------------------------------------
// Header extraction
// ---------------------------------------------------------------------------

/**
 * Convert markdown headers to Slack header blocks.
 * Only converts level 1-3 headers (H4+ become bold text instead).
 */
function extractHeaders(text: string): { blocks: KnownBlock[]; text: string } {
  const blocks: KnownBlock[] = [];
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      result.push(line);
      continue;
    }

    // Match # Header, ## Header, ### Header
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1]?.length ?? 1;
      const headerText = headerMatch[2]?.trim() ?? "";

      if (headerText) {
        blocks.push({
          type: "header",
          text: {
            type: "plain_text",
            text: headerText,
            emoji: true,
          },
        });
        // Add divider after H1/H2 for visual separation
        if (level <= 2) {
          blocks.push({ type: "divider" });
        }
        continue;
      }
    }

    // H4+ becomes bold text (handled by normal markdown conversion)
    const h4PlusMatch = line.match(/^(#{4,})\s+(.+)$/);
    if (h4PlusMatch) {
      const headerText = h4PlusMatch[2]?.trim() ?? "";
      result.push(`**${headerText}**`);
      continue;
    }

    result.push(line);
  }

  return { blocks, text: result.join("\n") };
}

// ---------------------------------------------------------------------------
// Callout extraction
// ---------------------------------------------------------------------------

const CALLOUT_PATTERN = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;

/**
 * Extract GitHub-style callouts and convert to styled Slack sections.
   Example: > [!NOTE] This is important
 */
function extractCallouts(text: string): { blocks: KnownBlock[]; text: string } {
  const blocks: KnownBlock[] = [];
  const lines = text.split("\n");
  const result: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      result.push(line);
      i++;
      continue;
    }

    const calloutMatch = line.match(CALLOUT_PATTERN);
    if (calloutMatch) {
      const typeKey = calloutMatch[1]?.toUpperCase() as CalloutType;
      const firstLineText = calloutMatch[2]?.trim() ?? "";
      const config = CALLOUT_CONFIG[typeKey.toLowerCase() as CalloutType] ?? CALLOUT_CONFIG.note;

      // Collect continuation lines (blockquote lines that follow)
      const contentLines: string[] = firstLineText ? [firstLineText] : [];
      i++;
      while (i < lines.length && lines[i]?.startsWith("> ")) {
        const continuation = lines[i]?.slice(2).trim();
        if (continuation) {
          contentLines.push(continuation);
        }
        i++;
      }

      // Build callout block
      const content = contentLines.join("\n");
      const calloutText = content
        ? `${config.emoji} *${config.label}*\n${content}`
        : `${config.emoji} *${config.label}*`;

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: calloutText,
        },
      });

      continue;
    }

    result.push(line);
    i++;
  }

  return { blocks, text: result.join("\n") };
}

// ---------------------------------------------------------------------------
// Image extraction
// ---------------------------------------------------------------------------

const IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/;

/**
 * Extract standalone markdown images as Slack image blocks.
 * Only matches images on their own line (not inline with text).
 */
function extractImages(text: string): { blocks: KnownBlock[]; text: string } {
  const blocks: KnownBlock[] = [];
  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const imageMatch = trimmed.match(IMAGE_PATTERN);

    if (imageMatch) {
      const alt = imageMatch[1] ?? "image";
      const url = imageMatch[2] ?? "";

      // Only extract http/https URLs (Slack image blocks need public URLs)
      if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        blocks.push({
          type: "image",
          image_url: url,
          alt_text: alt || "image",
        });
        continue;
      }
    }

    result.push(line);
  }

  return { blocks, text: result.join("\n") };
}

// ---------------------------------------------------------------------------
// Task list conversion
// ---------------------------------------------------------------------------

const TASK_UNCHECKED = /^\s*[-*+]\s+\[\s\]\s+(.*)$/;
const TASK_CHECKED = /^\s*[-*+]\s+\[x\]\s+(.*)$/i;

/**
 * Convert GitHub-style task lists to emoji checkboxes.
   - [ ] unchecked → ⬜ unchecked
   - [x] checked → ✅ checked
 */
function convertTaskLists(text: string): string {
  const lines = text.split("\n");
  const result = lines.map((line) => {
    const uncheckedMatch = line.match(TASK_UNCHECKED);
    if (uncheckedMatch) {
      const content = uncheckedMatch[1] ?? "";
      return `⬜ ${content}`;
    }

    const checkedMatch = line.match(TASK_CHECKED);
    if (checkedMatch) {
      const content = checkedMatch[1] ?? "";
      return `✅ ${content}`;
    }

    return line;
  });

  return result.join("\n");
}

// ---------------------------------------------------------------------------
// Code block language hints
// ---------------------------------------------------------------------------

const FENCED_CODE_PATTERN = /^```(\w*)([^\n]*)\n([\s\S]*?)```$/gm;

/**
 * Add language labels to fenced code blocks.
 * ```typescript → ```typescript (TypeScript)
 */
function addCodeBlockLanguageHints(text: string): string {
  return text.replace(FENCED_CODE_PATTERN, (match, lang, rest, code) => {
    if (!lang) {
      return match; // No language specified
    }
    // Normalize common language names
    const normalizedLang = normalizeLanguageName(lang);
    if (!normalizedLang) {
      return match;
    }
    // Add language hint at the start of the code block
    return "```" + lang + rest + "\n(" + normalizedLang + ")\n" + code + "```";
  });
}

function normalizeLanguageName(lang: string): string | null {
  const lower = lang.toLowerCase();
  const languageNames: Record<string, string> = {
    ts: "TypeScript",
    typescript: "TypeScript",
    js: "JavaScript",
    javascript: "JavaScript",
    py: "Python",
    python: "Python",
    rb: "Ruby",
    ruby: "Ruby",
    go: "Go",
    golang: "Go",
    rs: "Rust",
    rust: "Rust",
    java: "Java",
    kt: "Kotlin",
    kotlin: "Kotlin",
    swift: "Swift",
    c: "C",
    cpp: "C++",
    "c++": "C++",
    cs: "C#",
    csharp: "C#",
    "c#": "C#",
    php: "PHP",
    sh: "Shell",
    bash: "Bash",
    shell: "Shell",
    zsh: "Zsh",
    fish: "Fish",
    ps1: "PowerShell",
    powershell: "PowerShell",
    sql: "SQL",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    xml: "XML",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    md: "Markdown",
    markdown: "Markdown",
    dockerfile: "Dockerfile",
    docker: "Docker",
    makefile: "Makefile",
    make: "Make",
    graphql: "GraphQL",
    gql: "GraphQL",
    terraform: "Terraform",
    tf: "Terraform",
    hcl: "HCL",
    scala: "Scala",
    clojure: "Clojure",
    elixir: "Elixir",
    erlang: "Erlang",
    haskell: "Haskell",
    lua: "Lua",
    perl: "Perl",
    r: "R",
    matlab: "MATLAB",
    vim: "Vim",
    vimscript: "Vim",
    diff: "Diff",
    patch: "Patch",
  };
  return languageNames[lower] ?? null;
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extract structured markdown elements and convert to Block Kit blocks.
 * Returns both the blocks and the remaining markdown text.
 *
 * Processing order:
 * 1. Headers → header blocks + dividers
 * 2. Callouts → styled sections with emoji
 * 3. Images → image blocks
 * 4. Task lists → emoji checkboxes (inline text conversion)
 * 5. Code block language hints
 */
export function extractEnhancedBlocks(text: string): ExtractedContent {
  // Process in order: headers, callouts, images, task lists, code hints
  const headerResult = extractHeaders(text);
  const calloutResult = extractCallouts(headerResult.text);
  const imageResult = extractImages(calloutResult.text);
  const taskListText = convertTaskLists(imageResult.text);
  const convertedText = addCodeBlockLanguageHints(taskListText);

  // Combine all blocks
  const blocks: (Block | KnownBlock)[] = [
    ...headerResult.blocks,
    ...calloutResult.blocks,
    ...imageResult.blocks,
  ];

  return {
    blocks,
    text: convertedText,
  };
}
