import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import {
  Bold,
  FilePlus,
  FolderOpen,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  Printer,
  Save,
  SaveAll,
  SquareCode,
  Table,
  TextQuote,
  createIcons,
} from "lucide";
import { basename, buildPrintHtml } from "./markdown";
import "./styles.css";

type DocumentState = {
  path: string | null;
  markdown: string;
  dirty: boolean;
  lastSavedAt: number | null;
};

type LoadedFile = {
  path: string;
  contents: string;
};

type DialogOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type AppCommand =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "print"
  | "find"
  | "h1"
  | "h2"
  | "bold"
  | "italic"
  | "bullet-list"
  | "quote"
  | "code-block"
  | "link"
  | "table"
  | "about";

declare global {
  interface Window {
    __markdownPadRunCommand?: (command: AppCommand) => Promise<void>;
  }
}

const starterMarkdown = "";

const state: DocumentState = {
  path: null,
  markdown: starterMarkdown,
  dirty: false,
  lastSavedAt: null,
};

let crepe: Crepe | null = null;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <section class="file-actions" aria-label="File actions">
        <button id="newBtn" class="icon-button" title="New (Ctrl+N)" aria-label="New"><i data-lucide="FilePlus"></i></button>
        <button id="openBtn" class="icon-button" title="Open Markdown (Ctrl+O)" aria-label="Open Markdown"><i data-lucide="FolderOpen"></i></button>
        <button id="saveBtn" class="icon-button" title="Save (Ctrl+S)" aria-label="Save"><i data-lucide="Save"></i></button>
        <button id="saveAsBtn" class="icon-button" title="Save As (Ctrl+Shift+S)" aria-label="Save As"><i data-lucide="SaveAll"></i></button>
        <button id="printBtn" class="icon-button" title="Print (Ctrl+P)" aria-label="Print"><i data-lucide="Printer"></i></button>
      </section>
      <section class="format-actions" aria-label="Formatting">
        <button class="icon-button" data-command="h1" title="Heading 1" aria-label="Heading 1"><i data-lucide="Heading1"></i></button>
        <button class="icon-button" data-command="h2" title="Heading 2" aria-label="Heading 2"><i data-lucide="Heading2"></i></button>
        <button class="icon-button" data-command="bold" title="Bold (Ctrl+B)" aria-label="Bold"><i data-lucide="Bold"></i></button>
        <button class="icon-button" data-command="italic" title="Italic (Ctrl+I)" aria-label="Italic"><i data-lucide="Italic"></i></button>
        <button class="icon-button" data-command="bullet-list" title="Bullet list" aria-label="Bullet list"><i data-lucide="List"></i></button>
        <button class="icon-button" data-command="quote" title="Quote" aria-label="Quote"><i data-lucide="TextQuote"></i></button>
        <button class="icon-button" data-command="code-block" title="Code block" aria-label="Code block"><i data-lucide="SquareCode"></i></button>
        <button class="icon-button" data-command="link" title="Link" aria-label="Link"><i data-lucide="Link"></i></button>
        <button class="icon-button" data-command="table" title="Table" aria-label="Table"><i data-lucide="Table"></i></button>
      </section>
      <section class="right-actions" aria-label="View actions">
        <select id="recentSelect" title="Recent files">
          <option value="">Recent files</option>
        </select>
      </section>
    </header>

    <div id="findBar" class="find-bar" hidden>
      <input id="findInput" type="search" placeholder="Find in document" />
      <button id="findNextBtn">Next</button>
      <button id="findCloseBtn">Close</button>
    </div>

    <section class="document-meta">
      <span id="fileLabel">Untitled.md</span>
      <span id="statusLabel">Ready</span>
    </section>

    <section class="editor-wrap">
      <div id="editor" class="editor"></div>
    </section>

    <section id="printRoot" class="print-root" aria-hidden="true"></section>

    <div id="dialogOverlay" class="dialog-overlay" hidden>
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle" aria-describedby="dialogMessage">
        <h2 id="dialogTitle"></h2>
        <p id="dialogMessage"></p>
        <div class="dialog-actions">
          <button id="dialogCancelBtn" type="button"></button>
          <button id="dialogConfirmBtn" type="button"></button>
        </div>
      </section>
    </div>
  </main>
`;

const fileLabel = document.querySelector<HTMLSpanElement>("#fileLabel")!;
const statusLabel = document.querySelector<HTMLSpanElement>("#statusLabel")!;
const recentSelect = document.querySelector<HTMLSelectElement>("#recentSelect")!;
const findBar = document.querySelector<HTMLDivElement>("#findBar")!;
const findInput = document.querySelector<HTMLInputElement>("#findInput")!;
const dialogOverlay = document.querySelector<HTMLDivElement>("#dialogOverlay")!;
const dialogTitle = document.querySelector<HTMLHeadingElement>("#dialogTitle")!;
const dialogMessage = document.querySelector<HTMLParagraphElement>("#dialogMessage")!;
const dialogCancelBtn = document.querySelector<HTMLButtonElement>("#dialogCancelBtn")!;
const dialogConfirmBtn = document.querySelector<HTMLButtonElement>("#dialogConfirmBtn")!;

createIcons({
  icons: {
    Bold,
    FilePlus,
    FolderOpen,
    Heading1,
    Heading2,
    Italic,
    Link,
    List,
    Printer,
    Save,
    SaveAll,
    SquareCode,
    Table,
    TextQuote,
  },
});

async function boot() {
  await createEditor(state.markdown);
  bindControls();
  await refreshRecentFiles();
  await loadStartupFile();

  await listen<string>("tauri://drag-drop", async (event) => {
    const path = Array.isArray(event.payload) ? event.payload[0] : event.payload;
    if (typeof path === "string" && path.toLowerCase().endsWith(".md")) {
      await openPath(path);
    }
  });
}

async function createEditor(markdown: string) {
  const root = document.querySelector<HTMLDivElement>("#editor")!;
  root.innerHTML = "";
  await crepe?.destroy();
  crepe = new Crepe({
    root,
    defaultValue: markdown,
  }).on((listener) => {
    listener.markdownUpdated((_, nextMarkdown) => {
      state.markdown = nextMarkdown;
      markDirty(true);
    });
  });
  await crepe.create();

  const editorElement = root.querySelector(".milkdown") ?? root;
  editorElement.addEventListener("input", () => {
    syncMarkdownFromEditor();
    markDirty(true);
  });

  editorElement.addEventListener("click", (event) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor?.getAttribute("href")) {
      return;
    }
    event.preventDefault();
    void openUrl(anchor.getAttribute("href")!);
  });
}

function getMarkdown(): string {
  try {
    return crepe?.getMarkdown() ?? state.markdown;
  } catch {
    return state.markdown;
  }
}

function syncMarkdownFromEditor() {
  state.markdown = getMarkdown();
}

function bindControls() {
  window.__markdownPadRunCommand = runCommand;

  document.querySelector("#newBtn")?.addEventListener("click", () => void runCommand("new"));
  document.querySelector("#openBtn")?.addEventListener("click", () => void runCommand("open"));
  document.querySelector("#saveBtn")?.addEventListener("click", () => void runCommand("save"));
  document.querySelector("#saveAsBtn")?.addEventListener("click", () => void runCommand("save-as"));
  document.querySelector("#printBtn")?.addEventListener("click", () => void runCommand("print"));
  document.querySelector("#findNextBtn")?.addEventListener("click", findNext);
  document.querySelector("#findCloseBtn")?.addEventListener("click", hideFind);
  findInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      findNext();
    }
  });

  recentSelect.addEventListener("change", async () => {
    const path = recentSelect.value;
    recentSelect.value = "";
    if (path) {
      await openPath(path);
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
    const command = button.dataset.command as AppCommand | undefined;
    button.addEventListener("click", () => {
      if (command) {
        void runCommand(command);
      }
    });
  });

  window.addEventListener("keydown", (event) => {
    if (!event.ctrlKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      void runCommand("new");
    } else if (key === "o") {
      event.preventDefault();
      void runCommand("open");
    } else if (key === "s") {
      event.preventDefault();
      if (event.shiftKey) {
        void runCommand("save-as");
      } else {
        void runCommand("save");
      }
    } else if (key === "p") {
      event.preventDefault();
      void runCommand("print");
    } else if (key === "f") {
      event.preventDefault();
      void runCommand("find");
    } else if (key === "b") {
      event.preventDefault();
      void runCommand("bold");
    } else if (key === "i") {
      event.preventDefault();
      void runCommand("italic");
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (state.dirty) {
      event.preventDefault();
    }
  });
}

async function runCommand(command: AppCommand) {
  if (command === "new") {
    await newDocument();
  } else if (command === "open") {
    await openDocument();
  } else if (command === "save") {
    await saveDocument();
  } else if (command === "save-as") {
    await saveDocumentAs();
  } else if (command === "print") {
    await printDocument();
  } else if (command === "find") {
    showFind();
  } else if (command === "h1") {
    insertAtLineStart("# ");
  } else if (command === "h2") {
    insertAtLineStart("## ");
  } else if (command === "bold") {
    wrapSelection("**");
  } else if (command === "italic") {
    wrapSelection("*");
  } else if (command === "bullet-list") {
    insertAtLineStart("- ");
  } else if (command === "quote") {
    insertAtLineStart("> ");
  } else if (command === "code-block") {
    insertBlock("```\ncode\n```");
  } else if (command === "link") {
    insertBlock("[link text](https://example.com)");
  } else if (command === "table") {
    await appendParsedMarkdownBlock("| Column | Value |\n| --- | --- |\n| Item | Detail |");
  } else if (command === "about") {
    await showAppDialog({
      title: "Markdown Pad",
      message: "A fast local Markdown editor for Windows.",
      confirmText: "OK",
    });
  }
}

async function newDocument() {
  if (!(await confirmSafeToDiscard())) {
    return;
  }
  state.path = null;
  state.markdown = "";
  state.lastSavedAt = null;
  await createEditor("");
  markDirty(false);
  updateChrome("New document");
}

async function openDocument() {
  if (!(await confirmSafeToDiscard())) {
    return;
  }
  const selected = await invoke<string | null>("open_file_dialog");
  if (selected) {
    await openPath(selected, true);
  }
}

async function openPath(path: string, alreadyConfirmed = false) {
  if (!alreadyConfirmed && !(await confirmSafeToDiscard())) {
    return;
  }
  try {
    const loaded = await invoke<LoadedFile>("read_markdown_file", { path });
    state.path = loaded.path;
    state.markdown = loaded.contents;
    state.lastSavedAt = Date.now();
    await createEditor(loaded.contents);
    markDirty(false);
    await refreshRecentFiles();
    updateChrome("Opened");
  } catch (error) {
    showStatus(`Could not open file: ${String(error)}`);
  }
}

async function saveDocument() {
  syncMarkdownFromEditor();
  if (!state.path) {
    await saveDocumentAs();
    return;
  }
  await saveToPath(state.path);
}

async function saveDocumentAs() {
  syncMarkdownFromEditor();
  const defaultName = state.path ?? "Untitled.md";
  const selected = await invoke<string | null>("save_file_dialog", { defaultPath: defaultName });
  if (selected) {
    await saveToPath(selected);
  }
}

async function saveToPath(path: string) {
  try {
    await invoke("save_markdown_file", { path, contents: state.markdown });
    state.path = path;
    state.lastSavedAt = Date.now();
    markDirty(false);
    await refreshRecentFiles();
    updateChrome("Saved");
  } catch (error) {
    showStatus(`Could not save file: ${String(error)}`);
  }
}

async function loadStartupFile() {
  const files = await invoke<string[]>("startup_markdown_files");
  if (files.length > 0) {
    await openPath(files[0]);
  }
}

async function refreshRecentFiles() {
  const files = await invoke<string[]>("recent_files_get");
  recentSelect.innerHTML = `<option value="">Recent files</option>`;
  files.forEach((file) => {
    const option = document.createElement("option");
    option.value = file;
    option.textContent = basename(file);
    option.title = file;
    recentSelect.append(option);
  });
}

async function confirmSafeToDiscard() {
  if (!state.dirty) {
    return true;
  }
  return showAppDialog({
    title: "Discard changes?",
    message: "This document has unsaved changes. Opening or creating another file will discard them.",
    confirmText: "Discard",
    cancelText: "Cancel",
    destructive: true,
  });
}

function markDirty(dirty: boolean) {
  state.dirty = dirty;
  updateChrome();
}

function updateChrome(status?: string) {
  const name = state.path ? basename(state.path) : "Untitled.md";
  fileLabel.textContent = `${name}${state.dirty ? " *" : ""}`;
  document.title = `${state.dirty ? "* " : ""}${name} - Markdown Pad`;
  if (status) {
    showStatus(status);
  } else {
    statusLabel.textContent = state.dirty ? "Unsaved changes" : "Ready";
  }
}

function showStatus(message: string) {
  statusLabel.textContent = message;
  window.setTimeout(() => updateChrome(), 2400);
}

function showAppDialog(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const hasCancel = Boolean(options.cancelText);

    dialogTitle.textContent = options.title;
    dialogMessage.textContent = options.message;
    dialogConfirmBtn.textContent = options.confirmText ?? "OK";
    dialogConfirmBtn.classList.toggle("destructive", Boolean(options.destructive));
    dialogCancelBtn.textContent = options.cancelText ?? "";
    dialogCancelBtn.hidden = !hasCancel;
    dialogOverlay.hidden = false;

    const finish = (result: boolean) => {
      dialogOverlay.hidden = true;
      dialogConfirmBtn.classList.remove("destructive");
      dialogConfirmBtn.removeEventListener("click", onConfirm);
      dialogCancelBtn.removeEventListener("click", onCancel);
      dialogOverlay.removeEventListener("click", onOverlayClick);
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus();
      resolve(result);
    };

    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onOverlayClick = (event: MouseEvent) => {
      if (event.target === dialogOverlay && hasCancel) {
        finish(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && hasCancel) {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      }
    };

    dialogConfirmBtn.addEventListener("click", onConfirm);
    dialogCancelBtn.addEventListener("click", onCancel);
    dialogOverlay.addEventListener("click", onOverlayClick);
    window.addEventListener("keydown", onKeyDown, true);
    window.setTimeout(() => dialogConfirmBtn.focus(), 0);
  });
}

function showFind() {
  findBar.hidden = false;
  findInput.focus();
  findInput.select();
}

function hideFind() {
  findBar.hidden = true;
}

function findNext() {
  const term = findInput.value.trim();
  if (!term) {
    return;
  }
  const find = (window as Window & { find?: (...args: unknown[]) => boolean }).find;
  find?.(term, false, false, true, false, false, false);
}

function wrapSelection(marker: string) {
  document.execCommand("insertText", false, `${marker}${getSelectedText() || "text"}${marker}`);
  syncMarkdownFromEditor();
  markDirty(true);
}

function insertAtLineStart(prefix: string) {
  document.execCommand("insertText", false, `${prefix}${getSelectedText() || "Heading"}`);
  syncMarkdownFromEditor();
  markDirty(true);
}

function insertBlock(block: string) {
  document.execCommand("insertText", false, `\n${block}\n`);
  syncMarkdownFromEditor();
  markDirty(true);
}

async function appendParsedMarkdownBlock(block: string) {
  syncMarkdownFromEditor();
  state.markdown = `${state.markdown.trimEnd()}\n\n${block}\n`;
  await createEditor(state.markdown);
  markDirty(true);
}

function getSelectedText() {
  return window.getSelection()?.toString() ?? "";
}

async function printDocument() {
  syncMarkdownFromEditor();
  const printRoot = document.querySelector<HTMLElement>("#printRoot")!;
  printRoot.innerHTML = buildPrintHtml(state.markdown);
  const previousTitle = document.title;
  document.title = " ";
  window.addEventListener(
    "afterprint",
    () => {
      document.title = previousTitle;
    },
    { once: true },
  );
  window.print();
}

void boot().catch((error) => {
  console.error(error);
  showStatus(`Startup failed: ${String(error)}`);
});
