import { describe, expect, it } from "vitest";
import { basename, buildPrintHtml, renderMarkdown } from "./markdown";

describe("basename", () => {
  it("returns a file name from a Windows path", () => {
    expect(basename("C:\\Users\\Person\\Notes\\today.md")).toBe("today.md");
  });

  it("returns a file name from a POSIX path", () => {
    expect(basename("/home/person/notes/today.md")).toBe("today.md");
  });

  it("keeps a bare file name unchanged", () => {
    expect(basename("today.md")).toBe("today.md");
  });
});

describe("renderMarkdown", () => {
  it("renders headings and emphasis", () => {
    const html = renderMarkdown("# Title\n\nThis is **bold** and *italic*.");

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders GitHub-style tables", () => {
    const html = renderMarkdown("| Column | Value |\n| --- | --- |\n| Item | Detail |");

    expect(html).toContain("<table>");
    expect(html).toContain("<th>Column</th>");
    expect(html).toContain("<td>Detail</td>");
  });
});

describe("buildPrintHtml", () => {
  it("contains only the printable document wrapper and rendered body", () => {
    const html = buildPrintHtml("# Printable\n\nNo app chrome here.");

    expect(html).toContain('class="print-document"');
    expect(html).toContain("<h1>Printable</h1>");
    expect(html).not.toContain("topbar");
    expect(html).not.toContain("tauri.localhost");
  });
});
