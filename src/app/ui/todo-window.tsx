"use client";

import { useState } from "react";

import type { TodoItem } from "@/lib/world/schemas";

const toolButton =
  "rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.06] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[.18] dark:text-zinc-300 dark:hover:bg-white/[.08]";

/** A line looks like text until it is hovered, then it looks editable. */
const lineInput =
  "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-zinc-800 outline-none hover:border-black/[.12] focus:border-zinc-400 dark:text-zinc-100 dark:hover:border-white/[.18]";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * The project's to-do list, opened from the header. A line is written where it
 * belongs — the empty row at the end of the list — and becomes an entry the
 * moment it is filled in. Every entry stays editable in place, and the button
 * beside it takes it off the list.
 */
export function TodoWindow({
  todos,
  onChange,
  onClose,
}: {
  todos: TodoItem[];
  onChange: (next: TodoItem[]) => void;
  onClose: () => void;
}) {
  // The line being written. It is kept out of the list until it is committed,
  // so a half-typed entry never reaches the project's saved notes.
  const [draft, setDraft] = useState("");

  function addTodo() {
    const text = draft.trim();
    if (text === "") return;
    onChange([...todos, { id: uid(), text }]);
    setDraft("");
  }

  function updateTodo(id: string, text: string) {
    onChange(todos.map((todo) => (todo.id === id ? { ...todo, text } : todo)));
  }

  return (
    <div
      role="dialog"
      aria-label="To-do list"
      className="fixed left-1/2 top-24 z-50 flex max-h-[70vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-black/[.12] bg-white shadow-2xl dark:border-white/[.18] dark:bg-zinc-950"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[.08] px-4 py-3 dark:border-white/[.12]">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
            To-do list
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {todos.length} {todos.length === 1 ? "item" : "items"}
          </span>
        </div>

        <button type="button" onClick={onClose} title="Close the list" className={toolButton}>
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {todos.length === 0 && (
          <p className="px-2 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            Nothing to do yet. Write the first line below.
          </p>
        )}

        <ul className="flex flex-col">
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-2">
              <input
                value={todo.text}
                onChange={(event) => updateTodo(todo.id, event.target.value)}
                aria-label="To-do item"
                className={lineInput}
              />
              <button
                type="button"
                onClick={() => onChange(todos.filter((item) => item.id !== todo.id))}
                aria-label={`Delete "${todo.text}"`}
                title="Delete this item"
                className={`${toolButton} text-zinc-500 dark:text-zinc-400`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* The row that grows the list: filling it in adds the entry, whether the
          writer presses Enter or simply moves on. */}
      <div className="flex shrink-0 items-center gap-2 border-t border-black/[.08] px-4 py-2 dark:border-white/[.12]">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addTodo();
          }}
          onBlur={addTodo}
          placeholder="Add a line and press Enter…"
          aria-label="New to-do item"
          className={`${lineInput} hover:border-transparent dark:hover:border-transparent`}
        />
      </div>
    </div>
  );
}
