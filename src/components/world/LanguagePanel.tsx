"use client";

import { useEffect, useState } from "react";
import { listLanguageTemplates, saveLanguageTemplate } from "@/app/actions/language-templates";
import type { LanguagePolicy, LanguageTemplate } from "@/lib/world/schemas";

type Props = {
  policy: LanguagePolicy;
  onChange: (next: LanguagePolicy) => void;
};

const input =
  "w-full rounded border border-black/[.12] bg-transparent px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-400 dark:border-white/[.18] dark:text-zinc-200 dark:focus:border-zinc-500";
const label = "text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const btn =
  "rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-black/[.06] dark:border-white/[.18] dark:text-zinc-300 dark:hover:bg-white/[.08]";

/** Suggestions only — the writer can type anything. */
const GENRES = [
  "horror",
  "comedy",
  "poetry",
  "drama",
  "thriller",
  "romance",
  "fantasy",
  "science fiction",
  "sci-fi",
  "literary fiction",
  "description",
  "essay / referat",
  "report",
  "non-fiction",
];

const SUBGENRES = [
  "gothic",
  "psychological",
  "satire",
  "parody",
  "free verse",
  "sonnet",
  "epic",
  "dialogue",
  "letter",
  "diary",
  "travelogue",
];

export function LanguagePanel({ policy, onChange }: Props) {
  const [pasteError, setPasteError] = useState("");
  // The templates the writer has kept. They live in the database rather than in
  // this panel, so a rule set written here can be loaded in any of their works.
  const [templates, setTemplates] = useState<LanguageTemplate[]>([]);
  // The template being edited. Loading one fills the panel; saving writes the
  // panel back into it. Empty means the next save keeps a new template.
  const [editingId, setEditingId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const kept = await listLanguageTemplates();
        if (alive) setTemplates(kept);
      } catch {
        if (alive) setTemplateNote("Could not read the saved templates.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Brings a template's policy across into the panel, ready to be used or
   *  changed in place. */
  function loadTemplate(id: string) {
    const template = templates.find((kept) => kept.id === id);
    if (!template) return;
    onChange(template.policy);
    setEditingId(template.id);
    setTemplateName(template.name);
    setTemplateNote(`Loaded "${template.name}".`);
  }

  /** Detaches the panel from the loaded template, so the next save keeps a new
   *  one instead of writing over the one it came from. */
  function startNewTemplate() {
    setEditingId("");
    setTemplateName("");
    setTemplateNote("");
  }

  /** Keeps the policy as it stands under the name in the box: over the template
   *  being edited, or over whichever template already holds that name. */
  async function saveTemplate() {
    setBusy(true);
    setTemplateNote("");
    try {
      const saved = await saveLanguageTemplate({
        id: editingId === "" ? undefined : editingId,
        name: templateName,
        policy,
      });
      setTemplates((current) =>
        [...current.filter((kept) => kept.id !== saved.id && kept.name !== saved.name), saved].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      setEditingId(saved.id);
      setTemplateName(saved.name);
      setTemplateNote(`Saved "${saved.name}".`);
    } catch {
      setTemplateNote("Could not save the template.");
    } finally {
      setBusy(false);
    }
  }

  /** Appends the clipboard to the rules window, keeping anything already held. */
  async function pasteFromClipboard() {
    setPasteError("");
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim() === "") return;
      const current = policy.rules;
      const rules = current.trim() === "" ? text : `${current}\n\n${text}`;
      onChange({ ...policy, rules });
    } catch {
      setPasteError("Could not read the clipboard. Paste into the window below instead.");
    }
  }

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 text-sm">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Rules the assistant must obey when it writes: grammar, punctuation, spelling and
        the language of the output. Paste them from your own language reference.
      </p>

      <div className="shrink-0 space-y-1 rounded-md border border-black/[.08] p-2 dark:border-white/[.12]">
        <div className="flex items-center justify-between">
          <span className={label}>Templates</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {templates.length === 0 ? "none kept yet" : `${templates.length} kept`}
          </span>
        </div>
        {/* The picker takes a row of its own: three controls on one line do not
            fit the width of this panel, and the row ran past its border. */}
        <select
          value={editingId}
          onChange={(event) =>
            event.target.value === ""
              ? startNewTemplate()
              : loadTemplate(event.target.value)
          }
          className={`${input} block min-w-0`}
        >
          <option value="">New template</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="text"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="Template name"
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void saveTemplate()}
            disabled={busy || templateName.trim() === ""}
            className={`${btn} shrink-0 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {editingId === "" ? "Save" : "Update"}
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          {templateNote !== ""
            ? templateNote
            : "Load a template to fill the panel, or name the rules below and keep them."}
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={policy.enabled}
          onChange={(event) => onChange({ ...policy, enabled: event.target.checked })}
        />
        Apply the language policy to the assistant
      </label>

      <div className="space-y-1">
        <span className={label}>Output language</span>
        <input
          type="text"
          value={policy.language}
          onChange={(event) => onChange({ ...policy, language: event.target.value })}
          placeholder="e.g. Polish"
          className={input}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className={label}>Genre / form</span>
          <input
            type="text"
            list="language-genres"
            value={policy.genre}
            onChange={(event) => onChange({ ...policy, genre: event.target.value })}
            placeholder="e.g. horror"
            className={input}
          />
          <datalist id="language-genres">
            {GENRES.map((genre) => (
              <option key={genre} value={genre} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <span className={label}>Subgenre</span>
          <input
            type="text"
            list="language-subgenres"
            value={policy.subgenre}
            onChange={(event) => onChange({ ...policy, subgenre: event.target.value })}
            placeholder="e.g. gothic"
            className={input}
          />
          <datalist id="language-subgenres">
            {SUBGENRES.map((subgenre) => (
              <option key={subgenre} value={subgenre} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className={label}>Grammar &amp; punctuation rules</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {policy.rules.length} chars
          </span>
        </div>
        <textarea
          value={policy.rules}
          onChange={(event) => onChange({ ...policy, rules: event.target.value })}
          placeholder="Paste your language rules here..."
          className={`${input} min-h-0 flex-1 resize-none leading-relaxed`}
        />
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={() => void pasteFromClipboard()} className={btn}>
            Paste from clipboard
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...policy, rules: "" })}
            disabled={policy.rules === ""}
            className={`${btn} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Clear
          </button>
        </div>
        {pasteError !== "" && (
          <p className="text-[11px] text-red-600 dark:text-red-400">{pasteError}</p>
        )}
      </div>
    </div>
  );
}