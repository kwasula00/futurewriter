"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";

import { updateProject, updateProjectPage } from "@/app/actions/projects";
import { WorldPanel } from "@/components/world/WorldPanel";
import { ScenePanel } from "@/components/world/ScenePanel";
import { LanguagePanel } from "@/components/world/LanguagePanel";
import { StoryDiagram } from "@/components/world/StoryDiagram";
import { TodoWindow } from "@/app/ui/todo-window";
import { getStoryBible, saveStoryBible } from "@/app/actions/world";
import { emptyBible, type StoryBible } from "@/lib/world/schemas";
import { compileLanguagePolicy } from "@/lib/world/compile";
import {
  PAGE_FORMATS,
  PAGE_FORMAT_META,
  formatSize,
  mmToPx,
  standardMargins,
  type PageFormat,
  type PageMargins,
  type PageSettings,
} from "@/lib/pages/schemas";
import { sectionHeadingHtml } from "@/lib/structure/presets";
import type { StructureNode } from "@/lib/structure/schemas";

type Project = {
  id: string;
  title: string;
  content: string;
  page: PageSettings;
};

/**
 * What the outline in the left column can ask of the draft: the headings it
 * owns live in the same document as the prose, so only the editor can reach them.
 */
export type EditorHandle = {
  insertSection: (node: StructureNode) => void;
  insertMissingSections: (nodes: StructureNode[]) => void;
  renameSection: (id: string, title: string) => void;
  removeSections: (ids: string[]) => void;
  reorderSections: (orderedIds: string[]) => void;
  jumpToSection: (id: string) => void;
};

const panelClass =
  "rounded-2xl border border-black/[.08] bg-white dark:border-white/[.12] dark:bg-zinc-950";
const panelTitleClass = "text-sm font-medium text-zinc-500 dark:text-zinc-400";
const toolButtonClass =
  "rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.06] dark:border-white/[.18] dark:text-zinc-300 dark:hover:bg-white/[.08]";

type ListStyle = "decimal" | "lower-alpha" | "upper-alpha";

type Tool = {
  label: string;
  title: string;
  command?: string;
  value?: string;
  listStyle?: ListStyle;
  className?: string;
};

/** Formatting buttons for the Draft header, in display order. */
const TOOLBAR: Tool[] = [
  { label: "B", title: "Bold", command: "bold", className: "font-bold" },
  { label: "I", title: "Italic", command: "italic", className: "italic" },
  { label: "U", title: "Underline", command: "underline", className: "underline" },
  { label: "S", title: "Strikethrough", command: "strikeThrough", className: "line-through" },
  { label: "P", title: "Paragraph", command: "formatBlock", value: "<p>" },
  { label: "H1", title: "Heading 1", command: "formatBlock", value: "<h1>" },
  { label: "H2", title: "Heading 2", command: "formatBlock", value: "<h2>" },
  { label: "H3", title: "Heading 3", command: "formatBlock", value: "<h3>" },
  { label: "•", title: "Bulleted list", command: "insertUnorderedList" },
  { label: "1.", title: "Numbered list", listStyle: "decimal" },
  { label: "a.", title: "Lowercase lettered list", listStyle: "lower-alpha" },
  { label: "A.", title: "Uppercase lettered list", listStyle: "upper-alpha" },
  { label: "Left", title: "Align left", command: "justifyLeft" },
  { label: "Center", title: "Align center", command: "justifyCenter" },
  { label: "Right", title: "Align right", command: "justifyRight" },
  { label: "HR", title: "Horizontal line", command: "insertHorizontalRule" },
  { label: "Clear", title: "Clear formatting", command: "removeFormat" },
];

/** Line heights the Draft header can stamp onto the selected blocks. */
const LINE_HEIGHTS = [
  { label: "Tight", value: "1.25" },
  { label: "Normal", value: "1.75" },
  { label: "Relaxed", value: "2" },
  { label: "Loose", value: "2.5" },
];

/** Blocks the line-height control can stamp a value onto. */
const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div";

/** Font sizes the Draft header can stamp onto the selected rows. */
const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px"];

/** Font size of the draft rows when the toolbar starts up. */
const DEFAULT_FONT_SIZE = "16px";

/**
 * The whole draft is written to the database in one piece, so autosave waits for
 * a real pause in typing rather than firing between keystrokes. Leaving the
 * surface — blur, tab switch, window close — flushes it straight away, so the
 * wait never costs the last sentence.
 */
const AUTOSAVE_DELAY_MS = 3000;

/** The four margins of the page, in the order the controls read. */
const MARGIN_SIDES: { key: keyof PageMargins; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
];

/** One numbered row in the gutter, measured from the block it belongs to. */
type LineMarker = {
  top: number;
  fontSize: string;
  lineHeight: string;
};

/** One turn of the assistant conversation. */
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** Echoed back to the provider so reasoning survives across turns. */
  reasoningDetails?: unknown;
};

/** What the last answer offers: whole block or highlighted chunk, draft or inquiry. */
const COPY_ACTIONS = [
  { label: "Block → Draft", scope: "block", destination: "draft" },
  { label: "Block → Inquiry", scope: "block", destination: "inquiry" },
  { label: "Selection → Draft", scope: "selection", destination: "draft" },
  { label: "Selection → Inquiry", scope: "selection", destination: "inquiry" },
] as const;

/** Escapes an answer before it is handed to the editor as HTML. */
function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (character) =>
    character === "&" ? "&amp;" : character === "<" ? "&lt;" : "&gt;",
  );
}

/** Turns an answer into draft HTML, one paragraph per blank-line block. */
function textToParagraphHtml(value: string) {
  // A block with no words in it is no paragraph: as an empty one it would land
  // in the draft as a row with no height, which the reader cannot see, the
  // caret cannot sit in and the numbering cannot tell from a line.
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** The ways a row can hold a line: words on it, a break or rule in it, or
 *  something drawn on it. A row holding none of them has no height, so nothing
 *  is seen beside it and the caret can find nowhere to sit. */
const LINE_HOLDERS = "br, hr, img, svg, canvas, video, table";

/** Whether a row is a line of the draft at all, rather than the empty row a
 *  paste can leave behind. Blank lines the writer made hold a break, so they
 *  count; a row the reader cannot see and the caret cannot reach does not. */
function holdsALine(element: Element): boolean {
  if ((element.textContent ?? "").trim() !== "") return true;
  return element.matches(LINE_HOLDERS) || element.querySelector(LINE_HOLDERS) !== null;
}

/** Takes the rows that hold no line out of the draft, and answers how many
 *  were taken. They are caret traps rather than writing: the text below them
 *  cannot be moved back up past a row nothing can be typed in. */
function pruneEmptyRows(root: HTMLElement): number {
  let removed = 0;
  for (const child of Array.from(root.children)) {
    if (child.matches(BLOCK_SELECTOR) && !child.querySelector(BLOCK_SELECTOR)) {
      if (!holdsALine(child)) {
        child.remove();
        removed += 1;
        continue;
      }
    }
    removed += pruneEmptyRows(child as HTMLElement);
  }
  return removed;
}

/** The tags a paste can carry that start a row of their own in the draft. */
const PASTED_BLOCKS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

/** The tags a paste can carry that hold no words of the draft at all. */
const PASTED_DROPS = new Set([
  "EMBED",
  "HEAD",
  "IFRAME",
  "LINK",
  "META",
  "NOSCRIPT",
  "OBJECT",
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "TITLE",
]);

/**
 * Rebuilds pasted markup as the rows the draft is written in. A page brings its
 * own fonts, wrappers and line heights, and any of them can lay the text out on
 * lines the draft's own line counting never sees, which is what leaves gaps in
 * the numbering, so only the text and its emphasis are kept.
 */
function pasteToDraftHtml(html: string) {
  // The pasted markup is read in a document of its own, so nothing it carries
  // is fetched, run or shown before it has been taken apart.
  const source = new DOMParser().parseFromString(html, "text/html");
  const rows: string[] = [];
  let row = "";

  const flushRow = () => {
    rows.push(row);
    row = "";
  };

  /** The inline markup of a node, keeping the emphasis a draft is written in
   *  and dropping every tag and attribute a page happened to carry. */
  const inlineHtml = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? "");
    if (!(node instanceof HTMLElement)) return "";
    if (PASTED_DROPS.has(node.tagName)) return "";
    if (node.tagName === "BR") return "<br>";
    const inner = Array.from(node.childNodes).map(inlineHtml).join("");
    if (node.tagName === "B" || node.tagName === "STRONG") return `<strong>${inner}</strong>`;
    if (node.tagName === "I" || node.tagName === "EM") return `<em>${inner}</em>`;
    if (node.tagName === "U") return `<u>${inner}</u>`;
    return inner;
  };

  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child instanceof HTMLElement && PASTED_DROPS.has(child.tagName)) continue;
      if (child instanceof HTMLElement && PASTED_BLOCKS.has(child.tagName)) {
        flushRow();
        visit(child);
        flushRow();
        continue;
      }
      row += inlineHtml(child);
    }
  };

  visit(source.body);
  flushRow();

  // The whitespace the markup keeps between its blocks is not a line, so only
  // rows with something on them are kept, and a blank line keeps its break so
  // the empty row still gets its number.
  return rows
    .filter((value) => value.includes("<br>") || value.trim() !== "")
    .map((value) => `<div>${value.trim()}</div>`)
    .join("");
}

/** Shortest the slider thumb ever gets, so it stays grabbable in a long draft. */
const MIN_THUMB_HEIGHT = 24;

export function WorkspaceEditor({
  project,
  ref,
  openDiagram = false,
  openTodo = false,
}: {
  project: Project;
  ref?: Ref<EditorHandle>;
  /**
   * Set when the workspace was opened from the header's Story Diagram link, so
   * the diagram is up as soon as the project is. The button in the assistant
   * panel opens the same window without touching the address.
   */
  openDiagram?: boolean;
  /** Set when the workspace was opened from the header's To-do list link. */
  openTodo?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [draft, setDraft] = useState(project.content);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lineHeight, setLineHeight] = useState("1.75");
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [lineMarkers, setLineMarkers] = useState<LineMarker[]>([]);
  const [inquiry, setInquiry] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatError, setChatError] = useState("");
  // Index of the answer whose copy menu is open; only the last one offers it.
  const [copyMenuFor, setCopyMenuFor] = useState<number | null>(null);
  // Highlighted chunk of the transcript, kept for the menu's selection actions.
  const [answerSelection, setAnswerSelection] = useState("");
  const [rightTab, setRightTab] = useState<"chat" | "world" | "scene" | "language">("chat");
  // The assistant lifts out of the grid onto the top layer while it is worked
  // in, so its answers get the whole workspace to be read in. Releasing it drops
  // it back into its column.
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  // The Story Diagram is kept per project, so the window is handed the project
  // it belongs to; it can be summoned from the assistant panel or arrive
  // already open from the header link.
  const [diagramOpen, setDiagramOpen] = useState(openDiagram);
  // The to-do list is kept with the project's bible, so the window is handed
  // the project it belongs to; it arrives already open from the header link.
  const [todoOpen, setTodoOpen] = useState(openTodo);
  const [bible, setBible] = useState<StoryBible>(emptyBible);
  const [bibleLoaded, setBibleLoaded] = useState(false);
  // The header link can arrive while the same project is already open, in which
  // case the editor is not remounted and the request has to be noticed. The last
  // request is remembered so it can be compared during render, which opens the
  // window in the render the request arrives instead of the one after it.
  const [seenOpenDiagram, setSeenOpenDiagram] = useState(openDiagram);
  if (seenOpenDiagram !== openDiagram) {
    setSeenOpenDiagram(openDiagram);
    if (openDiagram) setDiagramOpen(true);
  }
  const [seenOpenTodo, setSeenOpenTodo] = useState(openTodo);
  if (seenOpenTodo !== openTodo) {
    setSeenOpenTodo(openTodo);
    if (openTodo) setTodoOpen(true);
  }

  /**
   * Closes the map. The address keeps the project it was drawn for, so a second
   * click on the header link reads the same project and opens the window again.
   */
  function closeDiagram() {
    setDiagramOpen(false);
    if (!openDiagram) return;
    const next = new URLSearchParams(window.location.search);
    next.delete("diagram");
    next.set("project", project.id);
    router.replace(`/workspace?${next.toString()}`, { scroll: false });
  }

  /**
   * Closes the to-do list, leaving the project in the address for the same
   * reason as the diagram: the header link reads it back.
   */
  function closeTodo() {
    setTodoOpen(false);
    if (!openTodo) return;
    const next = new URLSearchParams(window.location.search);
    next.delete("todo");
    next.set("project", project.id);
    router.replace(`/workspace?${next.toString()}`, { scroll: false });
  }
  // The transcript is part of the story bible, so it is saved with the rest and
  // is back in the panel the next time the project is opened.
  const messages = bible.assistant.messages;
  function setMessages(update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) {
    setBible((current) => ({
      ...current,
      assistant: {
        ...current.assistant,
        messages: typeof update === "function" ? update(current.assistant.messages) : update,
      },
    }));
  }
  // The page the draft is laid out on: a real trim size with the margins the
  // text is set inside, so what is written here matches what gets printed.
  const [page, setPage] = useState<PageSettings>(project.page);
  // How many pages the draft currently runs to, so the sheet is that many
  // sheets tall and each one gets its number.
  const [pageCount, setPageCount] = useState(1);

  const editorRef = useRef<HTMLDivElement>(null);
  // The column the numbers are painted in. A number is placed from this box, so
  // the gutter has to be measured rather than worked out from the page's margin.
  const gutterRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  // The assistant panel as a whole, so the enlarged card can tell when the
  // click that ends its turn lands somewhere else in the workspace.
  const assistantRef = useRef<HTMLElement>(null);
  // The draft scrolls in its own box, and the bar that moves it is drawn by
  // hand so it can sit left of the line numbers.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const initialContent = useRef(project.content);
  // Picking a line height moves focus out of the editor, so the caret's range
  // is stashed on mousedown and put back before the value is applied. The chat
  // panel reuses it to know where an answer should land in the draft.
  const savedRange = useRef<Range | null>(null);

  // What the database currently holds. Comparing against this rather than the
  // props lets the autosave settle without waiting for a server round trip.
  const savedVersion = useRef({ title: project.title, content: project.content });
  const isDirty =
    title !== savedVersion.current.title || draft !== savedVersion.current.content;

  // The prose as it stands right now. The listeners that flush on leaving the
  // tab are bound once, so they read the draft from here instead of a closure
  // captured on an earlier render.
  const latest = useRef({ title, draft });
  useEffect(() => {
    latest.current = { title, draft };
  }, [title, draft]);

  // The bible as it stands right now, read by the flush below, which is bound
  // once and so cannot close over the bible of an earlier render. `loaded` is
  // carried with it: nothing may be written before the stored bible has been
  // read, or an empty one would be saved over the rules already in the database.
  const latestBible = useRef({ bible, loaded: bibleLoaded });
  useEffect(() => {
    latestBible.current = { bible, loaded: bibleLoaded };
  }, [bible, bibleLoaded]);

  // Handing the workspace back to another window — a press anywhere outside the
  // lifted panel, or Escape — returns the assistant to its own column.
  useEffect(() => {
    if (!assistantExpanded) return;
    const onPointerDown = (event: PointerEvent) => {
      const panel = assistantRef.current;
      if (panel && !panel.contains(event.target as Node)) setAssistantExpanded(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssistantExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [assistantExpanded]);

  // The editor surface is uncontrolled: re-rendering its children from React
  // would drop the caret. The saved HTML is written once on mount, then read
  // back into state on every edit.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = initialContent.current;
    // A saved draft can carry rows with nothing in them, which the reader never
    // saw and the caret can never reach. They are taken out as the draft is
    // read, so the writing below them can be moved back to the first line, and
    // the cleaned draft is saved back in place of the one holding them.
    if (pruneEmptyRows(editor) > 0) setDraft(editor.innerHTML);
    syncLineNumbers();
    syncPagination();
    syncSlider();

    // Rows shift when the window resizes, text wraps, or a font size changes,
    // so the gutter, the page count and the slider are re-measured whenever the
    // draft's box moves.
    const remeasure = () => {
      syncLineNumbers();
      syncPagination();
      syncSlider();
    };
    const observer = new ResizeObserver(remeasure);
    observer.observe(editor);
    if (scrollRef.current) observer.observe(scrollRef.current);
    window.addEventListener("resize", remeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, []);

  // Answers stream into a height-capped transcript, so the newest tokens are
  // pulled into view as they arrive.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages]);

  // The story bible lives in Supabase; load it once per project.
  useEffect(() => {
    void (async () => {
      try {
        const loaded = await getStoryBible(project.id);
        setBible(loaded);
      } finally {
        setBibleLoaded(true);
      }
    })();
  }, [project.id]);

  // Every world edit is persisted, but the writer types fast, so writes wait
  // until they pause.
  useEffect(() => {
    if (!bibleLoaded) return;
    const t = setTimeout(() => {
      void saveStoryBible(project.id, bible);
    }, 800);
    return () => clearTimeout(t);
  }, [bible, bibleLoaded, project.id]);

  // Leaving the workspace — clicking away, switching tabs, closing the window —
  // writes the bible at once, so a rule typed in the last moment before the
  // pause above still reaches the database. The writer's rules are only ever
  // replaced by what the writer typed, never lost to a timer that never fired.
  useEffect(() => {
    const flush = () => {
      const { bible: current, loaded } = latestBible.current;
      if (!loaded) return;
      void saveStoryBible(project.id, current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [project.id]);

  // The prose is saved as it is written, so closing the tab mid-sentence does
  // not lose the draft. Waiting for a real pause keeps the writes few and large,
  // since every one of them rewrites the whole document.
  useEffect(() => {
    if (!isDirty) return;
    const t = setTimeout(() => {
      void handleSave();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [title, draft, isDirty]);

  // Leaving the surface — clicking away, switching tabs, closing the window —
  // writes at once, so the pause above never costs the last sentence.
  useEffect(() => {
    const flush = () => {
      void handleSave();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [project.id]);

  // The page is saved the same way, and the first run is the page the project
  // was opened with, so there is nothing to write back yet.
  const pageUnchanged = useRef(true);
  useEffect(() => {
    if (pageUnchanged.current) {
      pageUnchanged.current = false;
      return;
    }
    const t = setTimeout(() => {
      void updateProjectPage(project.id, page);
    }, 800);
    return () => clearTimeout(t);
  }, [page, project.id]);

  // A page of another size holds another amount of text, so a new format or a
  // new margin is followed by taking the measurements again.
  useEffect(() => {
    syncLineNumbers();
    syncPagination();
    syncSlider();
  }, [page]);

  /** Choosing a format sets the page to the trim size and its standard margins,
   *  and the draft reflows to the new width. */
  function changeFormat(format: PageFormat) {
    setPage({ format, margins: standardMargins(format) });
  }

  function changeMargin(side: keyof PageMargins, value: number) {
    // A margin is a real length, so a number that cannot be one is ignored and
    // a page is never given more margin than it can hold.
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(100, Math.max(0, value));
    setPage((current) => ({ ...current, margins: { ...current.margins, [side]: clamped } }));
  }

  /** Mirrors the draft line by line: every line the reader sees is numbered. */
  function syncLineNumbers() {
    const editor = editorRef.current;
    const gutter = gutterRef.current;
    if (!editor || !gutter) return;
    // The numbers live in the gutter, so the lines are measured from the
    // gutter's own top rather than from the editor's. Both boxes are read
    // together, so the border and the top margin the sheet carries can never
    // push the numbers off the lines they count.
    const origin = gutter.getBoundingClientRect().top;
    const markers: LineMarker[] = [];

    // A surface the writer has emptied keeps one line break behind (sometimes
    // inside an empty row) so the caret still has somewhere to sit. That break
    // is furniture, not a line of the draft, so a draft holding no words and
    // nothing drawn is numbered not at all rather than "1". A blank line inside
    // a draft that does hold words is still a line, and is still numbered.
    const written = (editor.textContent ?? "").trim() !== "";
    const drawn = editor.querySelector("img, hr, svg, canvas, video, table") !== null;
    if (!written && !drawn) {
      setLineMarkers([]);
      return;
    }

    // The lines of a row follow one another a fixed line height apart, so a
    // single step for the whole row is what lets each line fall into a slot of
    // its own. Reading the step off each box instead lets a tall box and a short
    // box on one line land in different slots, and the two numbers are then
    // painted on top of each other. A row that states no line height still
    // spaces its lines, and its font size is the best guess at how far apart.
    const editorFontSize = Number.parseFloat(window.getComputedStyle(editor).fontSize);
    const fallbackStep = editorFontSize > 0 ? editorFontSize * 1.2 : 20;

    // A number borrows the typography of its own row, so a taller row gets a
    // taller number. One row can hold several lines, either because it wraps or
    // because it is broken by <br>, and each of those lines is a numbered line,
    // so the row's range is asked for its line boxes rather than the row being
    // counted once.
    const measure = (element: Element, range: Range) => {
      // A row that holds no line is not numbered: it is the empty row a paste
      // can leave behind, and numbering it would print a number beside nothing
      // while the writing below it starts at the next number along.
      if (!holdsALine(element)) return;

      const style = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight) || 0;
      const step = lineHeight > 0 ? lineHeight : fallbackStep;
      const slots = new Map<number, number>();

      const numberLine = (top: number) => {
        const slot = step > 0 ? Math.round(top / step) : slots.size;
        const known = slots.get(slot);
        if (known === undefined || top < known) slots.set(slot, top);
      };

      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width === 0 && rect.height === 0) continue;
        // A box covers the text, not the line box the text sits in, so the
        // leading that centres the text is taken off to reach the line's top.
        const leading = Math.max(0, (step - rect.height) / 2);
        const top = rect.top - origin - leading;

        // A box standing a whole number of lines tall is an atomic box - a
        // pasted inline-block or an image - and covers that many lines, so it
        // is numbered line by line rather than counted once.
        const ratio = step > 0 ? rect.height / step : 1;
        const lines = Math.round(ratio);
        if (lines >= 2 && Math.abs(ratio - lines) < 0.25) {
          for (let line = 0; line < lines; line += 1) {
            numberLine(top + line * step);
          }
          continue;
        }

        numberLine(top);
      }

      // A line with nothing on it reports no rect, so the row's own box stands
      // in for it and the empty line still gets a number.
      if (slots.size === 0) numberLine(element.getBoundingClientRect().top - origin);

      // The numbers read down the page, so the slots are laid out in the order
      // of the lines they count rather than the order the boxes arrived in, and
      // a line is never numbered twice: should two of them ever measure closer
      // together than half a line, the first number stands for both rather than
      // the two being painted on top of each other.
      let previous = Number.NEGATIVE_INFINITY;
      for (const top of Array.from(slots.values()).sort((a, b) => a - b)) {
        if (top - previous < step * 0.5) continue;
        previous = top;
        markers.push({ top, fontSize: style.fontSize, lineHeight: style.lineHeight });
      }
    };

    // Wrappers such as <ul> hold the real rows, so a container is descended
    // into while a block that holds no other block is a row itself.
    const visitBlock = (element: Element) => {
      if (element.matches(BLOCK_SELECTOR) && !element.querySelector(BLOCK_SELECTOR)) {
        const range = document.createRange();
        range.selectNodeContents(element);
        measure(element, range);
        return;
      }
      for (const child of Array.from(element.children)) visitBlock(child);
    };

    // The line a user types first stays a bare text node in Chrome, because
    // only the lines Enter creates are wrapped in <div>s. Runs of text and
    // inline nodes are therefore rows too, or the first line never gets a
    // number and every label below it is off by one.
    let run: Node[] = [];
    const flushRun = () => {
      const nodes = run;
      run = [];
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;

      // A run of nothing but whitespace is the indentation the serialised HTML
      // carries between blocks, so it is not a row. Text, a line break or a
      // horizontal rule all occupy a line, so they are.
      const occupied = nodes.some(
        (node) =>
          (node.textContent ?? "").trim() !== "" ||
          (node instanceof HTMLElement && (node.tagName === "BR" || node.tagName === "HR")),
      );
      if (!occupied) return;

      const range = document.createRange();
      range.setStartBefore(first);
      range.setEndAfter(last);
      measure(first instanceof HTMLElement ? first : (first.parentElement ?? editor), range);
    };

    for (const node of Array.from(editor.childNodes)) {
      const blockish =
        node instanceof Element && (node.matches(BLOCK_SELECTOR) || node.matches("ul, ol"));
      if (!blockish) {
        run.push(node);
        continue;
      }
      flushRun();
      visitBlock(node);
    }
    flushRun();

    setLineMarkers(markers);
  }

  /**
   * Counts the pages the draft runs to. One page holds the trim height less the
   * top and bottom margins, so the draft is as many pages as it takes to hold
   * the text, and the sheet is that many sheets tall.
   */
  function syncPagination() {
    const editor = editorRef.current;
    if (!editor) return;
    const textArea =
      pageSize.height - mmToPx(page.margins.top) - mmToPx(page.margins.bottom);
    if (textArea <= 0) {
      setPageCount(1);
      return;
    }
    setPageCount(Math.max(1, Math.ceil(editor.getBoundingClientRect().height / textArea)));
  }

  /** Divides the track the way a scrollbar divides its travel: the thumb keeps
   *  the share of the track that the visible rows keep of the draft. */
  function sliderGeometry() {
    const box = scrollRef.current;
    const trackHeight = sliderRef.current?.clientHeight ?? 0;
    const scrollHeight = box?.scrollHeight ?? 0;
    const clientHeight = box?.clientHeight ?? 0;
    const maxScroll = scrollHeight - clientHeight;
    const thumbHeight = Math.min(
      trackHeight,
      Math.max(MIN_THUMB_HEIGHT, (clientHeight / scrollHeight) * trackHeight),
    );
    return { thumbHeight, maxScroll, maxThumb: trackHeight - thumbHeight };
  }

  /** Places the thumb where the draft is scrolled to. Written straight to the
   *  DOM, so following a scroll does not re-render the draft. */
  function syncSlider() {
    const box = scrollRef.current;
    const thumb = thumbRef.current;
    if (!box || !thumb) return;

    const { thumbHeight, maxScroll, maxThumb } = sliderGeometry();
    // Nothing overflows, so there is no travel to offer.
    if (maxScroll <= 0 || maxThumb <= 0) {
      thumb.style.display = "none";
      return;
    }

    thumb.style.display = "";
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.top = `${(box.scrollTop / maxScroll) * maxThumb}px`;
  }

  /** Dragging the thumb moves the draft. Pressing the bare track first centres
   *  the thumb under the pointer, so the drag then starts from a known place. */
  function startSliderDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const box = scrollRef.current;
    const track = sliderRef.current;
    if (!box || !track) return;

    const { thumbHeight, maxScroll, maxThumb } = sliderGeometry();
    if (maxScroll <= 0 || maxThumb <= 0) return;
    event.preventDefault();

    const pointerTop = event.clientY - track.getBoundingClientRect().top;
    const thumbTop = (box.scrollTop / maxScroll) * maxThumb;
    const onThumb = pointerTop >= thumbTop && pointerTop <= thumbTop + thumbHeight;
    if (!onThumb) box.scrollTop = ((pointerTop - thumbHeight / 2) / maxThumb) * maxScroll;

    const startY = event.clientY;
    const startScrollTop = box.scrollTop;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      box.scrollTop = startScrollTop + ((moveEvent.clientY - startY) * maxScroll) / maxThumb;
    };
    const onEnd = () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onEnd);
      element.removeEventListener("pointercancel", onEnd);
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onEnd);
    element.addEventListener("pointercancel", onEnd);
  }

  function syncDraft() {
    setDraft(editorRef.current?.innerHTML ?? "");
    setStatus("idle");
    syncLineNumbers();
    syncPagination();
    syncSlider();
  }

  function runCommand(command?: string, value?: string) {
    if (!command) return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncDraft();
  }

  /** The lists the selection currently touches, so they can be restyled. */
  function selectedLists(): HTMLElement[] {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return [];
    const range = selection.getRangeAt(0);
    return Array.from(editor.querySelectorAll<HTMLElement>("ol, ul")).filter((list) =>
      range.intersectsNode(list),
    );
  }

  // execCommand can only build decimal lists, so alpha markers are stamped on
  // afterwards via list-style-type (with the legacy type="a"/"A" attribute).
  function runList(style: ListStyle) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    const existing = selectedLists();
    const alreadyOrdered = existing.length > 0 && existing.every((list) => list.tagName === "OL");

    if (!alreadyOrdered) document.execCommand("insertOrderedList", false);

    selectedLists()
      .filter((list) => list.tagName === "OL")
      .forEach((list) => {
        list.style.listStyleType = style;
        if (style === "decimal") list.removeAttribute("type");
        else list.setAttribute("type", style === "lower-alpha" ? "a" : "A");
      });

    syncDraft();
  }

  function rememberSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange();
    }
  }

  /** Stamps a style onto every block the current selection touches. */
  function applyToSelectedBlocks(apply: (block: HTMLElement) => void) {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const selection = window.getSelection();
    const range = savedRange.current;
    if (selection && range) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (!selection || selection.rangeCount === 0) return;

    // An empty draft has no block to style yet, so give the caret a paragraph.
    if (editor.childElementCount === 0) document.execCommand("formatBlock", false, "<p>");

    const caret = selection.getRangeAt(0);
    if (!editor.contains(caret.startContainer)) return;

    Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
      .filter((block) => caret.intersectsNode(block))
      .forEach(apply);

    syncDraft();
  }

  function applyLineHeight(value: string) {
    applyToSelectedBlocks((block) => {
      block.style.lineHeight = value;
    });
  }

  function applyFontSize(value: string) {
    applyToSelectedBlocks((block) => {
      block.style.fontSize = value;
    });
  }

  async function handleSave() {
    const { title: nextTitle, draft: nextDraft } = latest.current;
    const saved = savedVersion.current;
    // The manual button and the autosave both land here, so a burst of pauses
    // and a click on "Change & Save" never rewrite the same document twice.
    if (nextTitle === saved.title && nextDraft === saved.content) return;
    setStatus("saving");
    await updateProject(project.id, nextTitle, nextDraft);
    savedVersion.current = { title: nextTitle, content: nextDraft };
    setStatus("saved");
  }

  /** Keeps the highlighted chunk of the transcript around for the copy menu. */
  function captureAnswerSelection() {
    const selection = window.getSelection();
    // A plain click collapses the selection, so an empty one is ignored: the
    // user highlights a chunk first, then clicks the answer to open the menu.
    if (!selection || selection.isCollapsed) return;
    const anchor = selection.anchorNode;
    if (transcriptRef.current && anchor && transcriptRef.current.contains(anchor)) {
      setAnswerSelection(selection.toString());
    }
  }

  /** Drops raw HTML into the draft where the caret was last left. */
  function insertHtmlAtCaret(html: string) {
    const editor = editorRef.current;
    if (!editor || html.trim() === "") return;
    editor.focus();

    const selection = window.getSelection();
    const range = savedRange.current;
    if (selection && range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const caret = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    if (caret && editor.contains(caret.startContainer)) {
      caret.deleteContents();
      const holder = document.createElement("div");
      holder.innerHTML = html;
      const fragment = document.createDocumentFragment();
      while (holder.firstChild) fragment.appendChild(holder.firstChild);

      const last = fragment.lastChild;
      caret.insertNode(fragment);
      if (last && selection) {
        // Park the caret below the insert so the next one lands after it.
        const after = document.createRange();
        after.setStartAfter(last);
        after.collapse(true);
        selection.removeAllRanges();
        selection.addRange(after);
        savedRange.current = after.cloneRange();
      }
    } else {
      editor.insertAdjacentHTML("beforeend", html);
    }

    syncDraft();
  }

  /** Drops an answer into the draft where the caret was last left. */
  function insertIntoDraft(text: string) {
    insertHtmlAtCaret(textToParagraphHtml(text));
  }

  /** Takes a paste apart and lays it back down as draft rows, so nothing it
   *  carried can reach the page and leave lines the numbering cannot see. */
  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (html === "" && text === "") return;

    event.preventDefault();
    const rows = html !== "" ? pasteToDraftHtml(html) : textToParagraphHtml(text);
    if (rows.trim() === "") return;

    // The browser's own caret is where the paste was asked for, so the rows go
    // in there rather than at the caret remembered from the last key or click.
    document.execCommand("insertHTML", false, rows);
    syncDraft();
  }

  /** The heading the outline owns, if the draft still carries it. */
  function findSection(id: string): HTMLElement | null {
    return editorRef.current?.querySelector<HTMLElement>(`[data-section-id="${id}"]`) ?? null;
  }

  /** A heading plus an empty paragraph, so there is somewhere to type at once. */
  function sectionBlockHtml(node: StructureNode) {
    return `${sectionHeadingHtml(node)}<p><br></p>`;
  }

  function insertSection(node: StructureNode) {
    insertHtmlAtCaret(sectionBlockHtml(node));
  }

  /** Adds headings for outline entries the draft does not carry yet. */
  function insertMissingSections(nodes: StructureNode[]) {
    const missing = nodes.filter((node) => !findSection(node.id));
    if (missing.length === 0) return;
    insertHtmlAtCaret(missing.map(sectionBlockHtml).join(""));
  }

  function renameSection(id: string, title: string) {
    const heading = findSection(id);
    if (!heading) return;
    heading.textContent = title;
    syncDraft();
  }

  /** Removes each heading along with the prose that belongs to it. */
  function removeSections(ids: string[]) {
    if (!editorRef.current) return;
    for (const id of ids) {
      let node: ChildNode | null = findSection(id);
      while (node) {
        const next: ChildNode | null = node.nextSibling;
        node.remove();
        if (!next || (next instanceof Element && next.hasAttribute("data-section-id"))) break;
        node = next;
      }
    }
    syncDraft();
  }

  /**
   * Puts the draft's headings back into the order the outline now has, each
   * followed by the prose written under it. Moving an element in the list
   * therefore moves its text as well, instead of the writer rearranging the
   * draft by hand.
   */
  function reorderSections(orderedIds: string[]) {
    const editor = editorRef.current;
    if (!editor) return;

    // A heading owns every node up to the next heading, so the draft splits
    // into one run per element, in the order it currently holds them.
    const runs = new Map<string, ChildNode[]>();
    const leading: ChildNode[] = [];
    let run: ChildNode[] | null = null;
    for (const node of Array.from(editor.childNodes)) {
      const id = node instanceof Element ? node.getAttribute("data-section-id") : null;
      if (id) {
        run = [];
        runs.set(id, run);
      }
      if (run) run.push(node);
      else leading.push(node);
    }

    // A heading the outline no longer knows keeps its text, at the end.
    const ordered = new Set(orderedIds);
    const orphans = Array.from(runs)
      .filter(([id]) => !ordered.has(id))
      .flatMap(([, nodes]) => nodes);

    // The nodes are moved rather than rebuilt, so the prose, its formatting and
    // the caret all survive the trip.
    const fragment = document.createDocumentFragment();
    for (const node of leading) fragment.appendChild(node);
    for (const id of orderedIds) {
      for (const node of runs.get(id) ?? []) fragment.appendChild(node);
    }
    for (const node of orphans) fragment.appendChild(node);
    editor.appendChild(fragment);

    syncDraft();
  }

  /**
   * Brings an element's heading into view on the third numbered row, so the two
   * rows above it stay readable and the writer can see what precedes it. The
   * markers already hold where each row starts, so the third one is the offset
   * the heading has to land on.
   */
  function jumpToSection(id: string) {
    const heading = findSection(id);
    const gutter = gutterRef.current;
    const box = scrollRef.current;
    if (!heading || !gutter || !box) return;

    // The heading and the numbers are both placed from the gutter, so the one
    // offset can be measured against the other.
    const headingTop =
      heading.getBoundingClientRect().top - gutter.getBoundingClientRect().top;
    const thirdRowTop = lineMarkers[2]?.top ?? 0;
    box.scrollTo({ top: headingTop - thirdRowTop, behavior: "smooth" });

    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange.current = range.cloneRange();
  }

  useImperativeHandle(ref, () => ({
    insertSection,
    insertMissingSections,
    renameSection,
    removeSections,
    reorderSections,
    jumpToSection,
  }));

  /** Appends an answer to whatever is already typed in the inquiry box. */
  function insertIntoInquiry(text: string) {
    setInquiry((current) => (current.trim() === "" ? text : `${current}\n\n${text}`));
  }

  function copyAnswer(action: (typeof COPY_ACTIONS)[number], answer: string) {
    const text = action.scope === "block" ? answer : answerSelection;
    if (text.trim() === "") return;
    if (action.destination === "draft") insertIntoDraft(text);
    else insertIntoInquiry(text);
    setCopyMenuFor(null);
  }

  /** Folds one streamed delta into the answer that is being written. */
  function applyDelta(event: string, payload: unknown) {
    if (event === "content" && typeof payload === "string") {
      setMessages((current) => {
        const last = current[current.length - 1];
        if (!last || last.role !== "assistant") return current;
        return [...current.slice(0, -1), { ...last, content: last.content + payload }];
      });
    } else if (event === "reasoning_details") {
      // Held on the turn so the provider can resume its reasoning next time.
      setMessages((current) => {
        const last = current[current.length - 1];
        if (!last || last.role !== "assistant") return current;
        return [...current.slice(0, -1), { ...last, reasoningDetails: payload }];
      });
    } else if (event === "error") {
      setChatError(String(payload));
    }
  }

  /** Parses one server-sent frame and folds it into the transcript. */
  function applyFrame(frame: string) {
    let event = "message";
    const data: string[] = [];

    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) data.push(line.slice("data:".length).trim());
    }
    if (data.length === 0) return;

    try {
      applyDelta(event, JSON.parse(data.join("\n")));
    } catch {
      // A frame that is not valid JSON carries nothing the transcript can use.
    }
  }

  async function sendInquiry() {
    const question = inquiry.trim();
    if (question === "" || isStreaming) return;

    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInquiry("");
    setChatError("");
    setCopyMenuFor(null);
    setIsStreaming(true);

    try {
      // The language policy rides along as a system turn, so every answer
      // follows the writer's grammar and punctuation rules.
      const languagePrompt = compileLanguagePolicy(bible.languagePolicy);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...(languagePrompt === ""
              ? []
              : [{ role: "system" as const, content: languagePrompt }]),
            ...history.map(({ role, content, reasoningDetails }) => ({
              role,
              content,
              ...(reasoningDetails === undefined ? {} : { reasoning_details: reasoningDetails }),
            })),
          ],
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`The assistant request failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Frames arrive as `event: <name>\ndata: <json>\n\n`; the buffer holds a
      // trailing partial frame until the rest of it shows up.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          applyFrame(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
        }
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStreaming(false);
    }
  }

  // The page is shown at its real size, so a millimetre on screen is a
  // millimetre of the printed book.
  const pageSize = formatSize(page.format);
  // The folio sits in the bottom margin, and never closer than that to the page
  // edge, so it stays legible on a page with almost no bottom margin.
  const folioBand = Math.max(20, mmToPx(page.margins.bottom));

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setStatus("idle");
          }}
          placeholder="Untitled document"
          aria-label="Document title"
          className="min-w-0 max-w-md flex-1 bg-transparent text-xl font-medium tracking-tight outline-none placeholder:text-zinc-400"
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={status === "saving"}
          className="shrink-0 rounded-lg bg-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          Change &amp; Save
        </button>

        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          {status === "saving" ? "Saving..." : status === "saved" && !isDirty ? "Saved" : ""}
        </span>
      </div>

      <div
        className={`grid min-h-[24rem] flex-1 gap-4 ${
          assistantExpanded ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
        }`}
      >
        <section className={`${panelClass} flex flex-col p-4`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className={panelTitleClass}>Draft</h2>

            <div className="flex flex-wrap items-center gap-1">
              {TOOLBAR.map((tool) => (
                <button
                  key={tool.title}
                  type="button"
                  title={tool.title}
                  aria-label={tool.title}
                  // Keeping the caret and selection in the editor while the
                  // button is pressed, so the command applies where the user is.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    tool.listStyle ? runList(tool.listStyle) : runCommand(tool.command, tool.value)
                  }
                  className={`${toolButtonClass} ${tool.className ?? ""}`}
                >
                  {tool.label}
                </button>
              ))}

              <label
                onMouseDown={rememberSelection}
                className="ml-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                Line height
                <select
                  value={lineHeight}
                  aria-label="Line height"
                  onChange={(event) => {
                    setLineHeight(event.target.value);
                    applyLineHeight(event.target.value);
                  }}
                  className="rounded-md border border-black/[.12] bg-transparent px-1 py-1 text-xs text-zinc-700 dark:border-white/[.18] dark:text-zinc-300"
                >
                  {LINE_HEIGHTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                onMouseDown={rememberSelection}
                className="ml-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                Size
                <select
                  value={fontSize}
                  aria-label="Font size"
                  onChange={(event) => {
                    setFontSize(event.target.value);
                    applyFontSize(event.target.value);
                  }}
                  className="rounded-md border border-black/[.12] bg-transparent px-1 py-1 text-xs text-zinc-700 dark:border-white/[.18] dark:text-zinc-300"
                >
                  {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size.replace("px", "")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
            <label className="flex items-center gap-1">
              Page
              <select
                value={page.format}
                aria-label="Page format"
                onChange={(event) => changeFormat(event.target.value as PageFormat)}
                className="rounded-md border border-black/[.12] bg-transparent px-1 py-1 text-xs text-zinc-700 dark:border-white/[.18] dark:text-zinc-300"
              >
                {PAGE_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {PAGE_FORMAT_META[format].label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <span>Margins mm</span>
              {MARGIN_SIDES.map((side) => (
                <label key={side.key} className="flex items-center gap-1">
                  {side.label}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={page.margins[side.key]}
                    aria-label={`${side.label} margin in millimetres`}
                    onChange={(event) => changeMargin(side.key, Number(event.target.value))}
                    className="w-14 rounded-md border border-black/[.12] bg-transparent px-1 py-1 text-xs text-zinc-700 dark:border-white/[.18] dark:text-zinc-300"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() =>
                  setPage((current) => ({ ...current, margins: standardMargins(current.format) }))
                }
                className={toolButtonClass}
              >
                Standard
              </button>
            </div>
          </div>

          <div className="mt-3 flex max-h-[calc(100vh-15rem)] min-h-[16rem] flex-1 items-stretch gap-1">
            {/* The draft scrolls inside its own box, so the bar that moves it
                can be drawn here instead of by the browser. */}
            <div
              ref={sliderRef}
              onPointerDown={startSliderDrag}
              className="relative w-2 shrink-0 cursor-default touch-none rounded-full bg-black/[.05] dark:bg-white/[.08]"
            >
              <div
                ref={thumbRef}
                className="absolute right-0 left-0 rounded-full bg-zinc-400 hover:bg-zinc-500 dark:bg-zinc-600 dark:hover:bg-zinc-500"
              />
            </div>

            <div
              ref={scrollRef}
              onScroll={syncSlider}
              className="flex min-w-0 flex-1 items-start overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* The gutter and the page travel together, so a number sits beside
                  the line it counts however wide the page is. */}
              <div className="mx-auto flex shrink-0 items-start gap-2">
                <div
                  ref={gutterRef}
                  aria-hidden="true"
                  className="relative w-8 shrink-0 select-none pr-2 text-right text-zinc-400 dark:text-zinc-600"
                >
                  {lineMarkers.map((marker, index) => (
                    <span
                      key={index}
                      className="absolute right-2"
                      // Each number borrows the font size and line height of its own
                      // row, so a taller row gets a taller number.
                      style={{
                        top: marker.top,
                        fontSize: marker.fontSize,
                        lineHeight: marker.lineHeight,
                      }}
                    >
                      {index + 1}
                    </span>
                  ))}
                </div>

                {/* The sheet is the chosen trim size at its real size, and the
                    margins are its padding, so the text wraps where it will
                    print instead of at the edge of the window. It is as tall as
                    the whole run of pages, so the page numbers below land on the
                    page they belong to. */}
                <div
                  className="relative shrink-0 rounded-sm border border-black/[.08] bg-white shadow-sm dark:border-white/[.12] dark:bg-zinc-900"
                  style={{
                    width: pageSize.width,
                    minHeight: pageCount * pageSize.height,
                    paddingTop: mmToPx(page.margins.top),
                    paddingRight: mmToPx(page.margins.right),
                    paddingBottom: mmToPx(page.margins.bottom),
                    paddingLeft: mmToPx(page.margins.left),
                  }}
                >
                  {/* A folio sits in the bottom margin of its page, centred across
                      the text column, and is not part of the draft, so it is kept
                      out of the writing and out of the way of the caret. */}
                  {Array.from({ length: pageCount }, (_, index) => (
                    <span
                      key={index}
                      aria-hidden="true"
                      className="pointer-events-none absolute right-0 left-0 select-none text-center text-xs text-zinc-500 dark:text-zinc-400"
                      style={{
                        top: (index + 1) * pageSize.height - folioBand,
                        lineHeight: `${folioBand}px`,
                      }}
                    >
                      {index + 1}
                    </span>
                  ))}

                  <div
                    ref={editorRef}
                    contentEditable
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Draft"
                    data-placeholder="Start writing..."
                    onInput={syncDraft}
                    // A paste is rebuilt as draft rows before it lands, so it
                    // cannot bring in lines the numbering does not count.
                    onPaste={handlePaste}
                    // The chat panel inserts at this caret, so it is refreshed every
                    // time the user moves it inside the draft.
                    onKeyUp={rememberSelection}
                    onMouseUp={rememberSelection}
                    className="text-base leading-7 outline-none empty:before:text-zinc-400 empty:before:content-[attr(data-placeholder)] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-t [&_hr]:border-zinc-300 dark:[&_hr]:border-zinc-700 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_p]:my-2"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          ref={assistantRef}
          className={`${panelClass} flex min-h-0 flex-col p-4 ${
            assistantExpanded
              ? "fixed inset-4 z-50 overflow-hidden shadow-2xl lg:inset-x-16"
              : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* The heading and its enlarge control share a line, so the panel
                can be lifted without hunting for the button among the tabs. */}
            <div className="flex shrink-0 items-center gap-2">
              <h2 className={panelTitleClass}>AI assistant</h2>
              <button
                type="button"
                onClick={() => setAssistantExpanded((open) => !open)}
                aria-pressed={assistantExpanded}
                title={assistantExpanded ? "Restore panel" : "Enlarge panel"}
                className={toolButtonClass}
              >
                {assistantExpanded ? "Restore" : "Enlarge"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {(["chat", "world", "scene", "language"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRightTab(t)}
                  className={`rounded-md px-2 py-1 capitalize ${
                    rightTab === t
                      ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-500 hover:bg-black/[.06] dark:text-zinc-400 dark:hover:bg-white/[.08]"
                  }`}
                >
                  {t}
                </button>
              ))}

              {/* Wipes the transcript clean — the answers land in the draft, so
                  nothing written is lost with them. */}
              {rightTab === "chat" && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  disabled={messages.length === 0 || isStreaming}
                  className={`${toolButtonClass} ml-1 disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  Clear chat
                </button>
              )}

              {/* The diagram is built from the World and Scene tabs, so it is
                  reachable from anywhere in the panel. */}
              <button
                type="button"
                onClick={() => setDiagramOpen(true)}
                className={`${toolButtonClass} ml-1`}
              >
                Story Diagram
              </button>
            </div>
          </div>

          {rightTab === "chat" && (
            <>
          {/* Upper half: the conversation coming back from the assistant. */}
          <div
            ref={transcriptRef}
            onMouseUp={captureAnswerSelection}
            className={`mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 ${
              assistantExpanded ? "" : "max-h-[24rem]"
            }`}
          >
            {messages.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Ask for a scene, a rewrite, or a line of dialogue. Answers land in the draft at
                your caret.
              </p>
            ) : (
              messages.map((message, index) => {
                const isLastAnswer =
                  message.role === "assistant" && index === messages.length - 1;
                const isThinking = isLastAnswer && isStreaming && message.content === "";
                const hasSelection = answerSelection.trim() !== "";

                return (
                  <article
                    key={index}
                    onClick={
                      isLastAnswer
                        ? () =>
                            setCopyMenuFor((open) => (open === index ? null : index))
                        : undefined
                    }
                    className={
                      message.role === "user"
                        ? "max-w-full self-end whitespace-pre-wrap rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                        : `max-w-full self-start whitespace-pre-wrap rounded-lg px-3 py-2 text-sm text-zinc-800 dark:text-zinc-200 ${
                            isLastAnswer
                              ? "cursor-pointer ring-1 ring-black/[.06] hover:bg-black/[.03] dark:ring-white/[.12] dark:hover:bg-white/[.04]"
                              : ""
                          }`
                    }
                  >
                    {isThinking ? (
                      <span className="text-zinc-500 dark:text-zinc-400">Thinking...</span>
                    ) : (
                      message.content
                    )}

                    {/* Only the newest answer can be copied onward. */}
                    {isLastAnswer && copyMenuFor === index && !isThinking && (
                      <div
                        onClick={(event) => event.stopPropagation()}
                        className="mt-2 flex flex-wrap gap-1 border-t border-black/[.08] pt-2 dark:border-white/[.12]"
                      >
                        {COPY_ACTIONS.map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => copyAnswer(action, message.content)}
                            disabled={action.scope === "selection" && !hasSelection}
                            className={toolButtonClass}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          {chatError !== "" && (
            <p className="mt-2 shrink-0 text-xs text-red-600 dark:text-red-400">{chatError}</p>
          )}

          {/* Lower half: the inquiry the user types and sends. */}
          <div className="mt-3 shrink-0 border-t border-black/[.08] pt-3 dark:border-white/[.12]">
            <textarea
              value={inquiry}
              onChange={(event) => setInquiry(event.target.value)}
              onKeyDown={(event) => {
                // Enter or Return sends; Shift+Enter keeps a line break.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendInquiry();
                }
              }}
              rows={3}
              placeholder="Ask the assistant..."
              aria-label="Message the assistant"
              className="w-full resize-none rounded-lg border border-black/[.12] bg-transparent px-3 py-2 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/[.18] dark:text-zinc-200 dark:focus:border-zinc-500"
            />

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {isStreaming ? "Streaming..." : "Enter to send, Shift+Enter for a new line"}
              </span>
              <button
                type="button"
                onClick={() => void sendInquiry()}
                disabled={isStreaming || inquiry.trim() === ""}
                className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Send
              </button>
            </div>
          </div>
            </>
          )}

          {rightTab === "world" && (
            <WorldPanel bible={bible} onChange={setBible} />
          )}

          {rightTab === "scene" && (
            <ScenePanel
              bible={bible}
              onInsertToDraft={(text) => insertIntoDraft(text)}
              onApplyContinuity={(next) => setBible(next)}
            />
          )}

          {rightTab === "language" && (
            <LanguagePanel
              policy={bible.languagePolicy}
              onChange={(languagePolicy) => setBible((current) => ({ ...current, languagePolicy }))}
            />
          )}
        </section>

        {diagramOpen && (
          <StoryDiagram
            projectId={project.id}
            bible={bible}
            onCreateScene={(scene) =>
              setBible((current) => ({ ...current, scenes: [...current.scenes, scene] }))
            }
            onInsertToDraft={(text) => insertIntoDraft(text)}
            onApplyContinuity={(next) => setBible(next)}
            onClose={closeDiagram}
          />
        )}

        {todoOpen && (
          <TodoWindow
            todos={bible.todos}
            onChange={(todos) => setBible((current) => ({ ...current, todos }))}
            onClose={closeTodo}
          />
        )}
      </div>
    </div>
  );
}