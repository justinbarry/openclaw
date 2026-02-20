import { describe, expect, it } from "vitest";
import { extractEnhancedBlocks } from "./blocks-enhanced.js";

describe("extractEnhancedBlocks", () => {
  describe("headers", () => {
    it("converts H1 to header block", () => {
      const result = extractEnhancedBlocks("# Summary");
      expect(result.blocks).toEqual([
        { type: "header", text: { type: "plain_text", text: "Summary", emoji: true } },
        { type: "divider" },
      ]);
      expect(result.text.trim()).toBe("");
    });

    it("converts H2 to header block with divider", () => {
      const result = extractEnhancedBlocks("## Details");
      expect(result.blocks).toEqual([
        { type: "header", text: { type: "plain_text", text: "Details", emoji: true } },
        { type: "divider" },
      ]);
    });

    it("converts H3 to header block without divider", () => {
      const result = extractEnhancedBlocks("### Subsection");
      expect(result.blocks).toEqual([
        { type: "header", text: { type: "plain_text", text: "Subsection", emoji: true } },
      ]);
    });

    it("converts H4+ to bold text", () => {
      const result = extractEnhancedBlocks("#### Small heading");
      expect(result.blocks).toEqual([]);
      expect(result.text.trim()).toBe("**Small heading**");
    });

    it("preserves text after header", () => {
      const result = extractEnhancedBlocks("# Title\n\nSome content here.");
      expect(result.blocks).toHaveLength(2);
      expect(result.text).toContain("Some content here.");
    });

    it("handles multiple headers", () => {
      const result = extractEnhancedBlocks("# First\n\nContent\n\n## Second");
      expect(result.blocks).toHaveLength(4); // 2 headers + 2 dividers
    });
  });

  describe("callouts", () => {
    it("converts NOTE callout", () => {
      const result = extractEnhancedBlocks("> [!NOTE] This is important");
      expect(result.blocks).toEqual([
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ":information_source: *NOTE*\nThis is important",
          },
        },
      ]);
    });

    it("converts WARNING callout", () => {
      const result = extractEnhancedBlocks("> [!WARNING] Danger ahead");
      expect(result.blocks).toEqual([
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ":warning: *WARNING*\nDanger ahead",
          },
        },
      ]);
    });

    it("converts TIP callout", () => {
      const result = extractEnhancedBlocks("> [!TIP] Try this");
      expect(result.blocks[0]).toEqual({
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":bulb: *TIP*\nTry this",
        },
      });
    });

    it("converts IMPORTANT callout", () => {
      const result = extractEnhancedBlocks("> [!IMPORTANT] Do not forget");
      expect(result.blocks[0]).toEqual({
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":exclamation: *IMPORTANT*\nDo not forget",
        },
      });
    });

    it("converts CAUTION callout", () => {
      const result = extractEnhancedBlocks("> [!CAUTION] Be careful");
      expect(result.blocks[0]).toEqual({
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":no_entry_sign: *CAUTION*\nBe careful",
        },
      });
    });

    it("handles multiline callouts", () => {
      const result = extractEnhancedBlocks("> [!NOTE] First line\n> Second line\n> Third line");
      expect(result.blocks).toHaveLength(1);
      const text = (result.blocks[0] as { text: { text: string } }).text.text;
      expect(text).toContain("First line");
      expect(text).toContain("Second line");
      expect(text).toContain("Third line");
    });

    it("is case-insensitive", () => {
      const result = extractEnhancedBlocks("> [!note] lowercase");
      expect(result.blocks).toHaveLength(1);
      expect((result.blocks[0] as { text: { text: string } }).text.text).toContain("*NOTE*");
    });
  });

  describe("images", () => {
    it("extracts standalone image as image block", () => {
      const result = extractEnhancedBlocks("![Chart](https://example.com/chart.png)");
      expect(result.blocks).toEqual([
        {
          type: "image",
          image_url: "https://example.com/chart.png",
          alt_text: "Chart",
        },
      ]);
    });

    it("ignores inline images", () => {
      const result = extractEnhancedBlocks(
        "Here is an image: ![alt](https://example.com/img.png) in text",
      );
      expect(result.blocks).toEqual([]);
      expect(result.text).toContain("![alt]");
    });

    it("only extracts http/https URLs", () => {
      const result = extractEnhancedBlocks("![Local](file:///tmp/image.png)");
      expect(result.blocks).toEqual([]);
    });

    it("handles empty alt text", () => {
      const result = extractEnhancedBlocks("![](https://example.com/img.png)");
      expect(result.blocks).toEqual([
        {
          type: "image",
          image_url: "https://example.com/img.png",
          alt_text: "image",
        },
      ]);
    });
  });

  describe("task lists", () => {
    it("converts unchecked task to checkbox emoji", () => {
      const result = extractEnhancedBlocks("- [ ] Buy groceries");
      expect(result.text.trim()).toBe("⬜ Buy groceries");
    });

    it("converts checked task to check emoji", () => {
      const result = extractEnhancedBlocks("- [x] Buy groceries");
      expect(result.text.trim()).toBe("✅ Buy groceries");
    });

    it("handles asterisk list marker", () => {
      const result = extractEnhancedBlocks("* [ ] Task");
      expect(result.text.trim()).toBe("⬜ Task");
    });

    it("handles plus list marker", () => {
      const result = extractEnhancedBlocks("+ [x] Done");
      expect(result.text.trim()).toBe("✅ Done");
    });

    it("preserves indentation", () => {
      const result = extractEnhancedBlocks("  - [ ] Nested task");
      expect(result.text).toContain("⬜ Nested task");
    });

    it("handles [X] uppercase", () => {
      const result = extractEnhancedBlocks("- [X] Completed");
      expect(result.text.trim()).toBe("✅ Completed");
    });
  });

  describe("combined", () => {
    it("extracts multiple element types", () => {
      const markdown = `# Report

> [!NOTE] Check this out

- [ ] Task 1
- [x] Task 2

![Graph](https://example.com/graph.png)
`;

      const result = extractEnhancedBlocks(markdown);

      // Header + divider + callout + image = 4 blocks
      expect(result.blocks).toHaveLength(4);
      expect(result.text).toContain("⬜ Task 1");
      expect(result.text).toContain("✅ Task 2");
    });

    it("preserves regular content", () => {
      const markdown = "# Title\n\nSome **bold** text and a [link](https://example.com).";
      const result = extractEnhancedBlocks(markdown);
      expect(result.text).toContain("Some **bold** text");
      expect(result.text).toContain("[link](https://example.com)");
    });
  });
});

describe("code block language hints", () => {
  it("adds language label to TypeScript code block", () => {
    const result = extractEnhancedBlocks("```typescript\nconst x = 1;\n```");
    expect(result.text).toContain("(TypeScript)");
  });

  it("adds language label to Python code block", () => {
    const result = extractEnhancedBlocks("```python\nprint('hello')\n```");
    expect(result.text).toContain("(Python)");
  });

  it("handles short language names", () => {
    const result = extractEnhancedBlocks("```ts\nconst x = 1;\n```");
    expect(result.text).toContain("(TypeScript)");
  });

  it("handles js short name", () => {
    const result = extractEnhancedBlocks("```js\nconsole.log('hi');\n```");
    expect(result.text).toContain("(JavaScript)");
  });

  it("preserves unknown languages without label", () => {
    const result = extractEnhancedBlocks("```unknownlang\ncode\n```");
    expect(result.text).not.toContain("()");
    expect(result.text).toContain("```unknownlang");
  });

  it("preserves code blocks without language", () => {
    const result = extractEnhancedBlocks("```\ncode\n```");
    expect(result.text).toBe("```\ncode\n```");
  });

  it("handles multiple code blocks", () => {
    const result = extractEnhancedBlocks("```typescript\nts\n```\n\n```python\npy\n```");
    expect(result.text).toContain("(TypeScript)");
    expect(result.text).toContain("(Python)");
  });
});
