import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: false,
});

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown) as string;
}

export function buildPrintHtml(markdown: string): string {
  return `
    <article class="print-document">
      ${renderMarkdown(markdown)}
    </article>
  `;
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
