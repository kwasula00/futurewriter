"use client";

import { useState } from "react";
import type {
  StoryBible,
  HardRule,
  SoftRule,
  Character,
  Relationship,
} from "@/lib/world/schemas";

type Props = {
  bible: StoryBible;
  onChange: (next: StoryBible) => void;
};

type Section = "hard" | "soft" | "chars" | "rels" | "narr";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const input =
  "w-full rounded border border-black/[.12] bg-transparent px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-400 dark:border-white/[.18] dark:text-zinc-200 dark:focus:border-zinc-500";
const label = "text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const btn =
  "rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-black/[.06] dark:border-white/[.18] dark:text-zinc-300 dark:hover:bg-white/[.08]";
const btnDanger =
  "rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400";

export function WorldPanel({ bible, onChange }: Props) {
  const [section, setSection] = useState<Section>("hard");
  const patch = (partial: Partial<StoryBible>) => onChange({ ...bible, ...partial });

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-1 border-b border-black/[.08] pb-2 dark:border-white/[.12]">
        {([
          ["hard", "Hard"],
          ["soft", "Soft"],
          ["chars", "Characters"],
          ["rels", "Relations"],
          ["narr", "Narrative"],
        ] as const).map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={`rounded px-2 py-1 text-xs ${
              section === id
                ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-black/[.06] dark:text-zinc-400 dark:hover:bg-white/[.08]"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {section === "hard" && (
          <HardRulesEditor
            rules={bible.worldHardRules}
            onChange={(worldHardRules) => patch({ worldHardRules })}
          />
        )}
        {section === "soft" && (
          <SoftRulesEditor
            rules={bible.worldSoftRules}
            onChange={(worldSoftRules) => patch({ worldSoftRules })}
          />
        )}
        {section === "chars" && (
          <CharactersEditor
            characters={bible.characters}
            onChange={(characters) => patch({ characters })}
          />
        )}
        {section === "rels" && (
          <RelationshipsEditor
            characters={bible.characters}
            relationships={bible.relationships}
            onChange={(relationships) => patch({ relationships })}
          />
        )}
        {section === "narr" && (
          <NarrativeEditor
            rules={bible.narrativeRules}
            onChange={(narrativeRules) => patch({ narrativeRules })}
          />
        )}
      </div>
    </div>
  );
}

function HardRulesEditor({
  rules,
  onChange,
}: {
  rules: HardRule[];
  onChange: (next: HardRule[]) => void;
}) {
  const update = (id: string, patch: Partial<HardRule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {rules.map((r) => (
        <div
          key={r.id}
          className="space-y-1 rounded border border-black/[.08] p-2 dark:border-white/[.12]"
        >
          <div className="flex items-center justify-between gap-2">
            <select
              value={r.category}
              onChange={(e) =>
                update(r.id, { category: e.target.value as HardRule["category"] })
              }
              className={input}
            >
              {["physics", "magic", "social", "timeline", "geography"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={btnDanger}
              onClick={() => onChange(rules.filter((x) => x.id !== r.id))}
            >
              Delete
            </button>
          </div>
          <div>
            <span className={label}>Rule</span>
            <textarea
              value={r.rule}
              rows={2}
              onChange={(e) => update(r.id, { rule: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <span className={label}>Violation consequence</span>
            <textarea
              value={r.violationConsequence}
              rows={2}
              onChange={(e) => update(r.id, { violationConsequence: e.target.value })}
              className={input}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className={btn}
        onClick={() =>
          onChange([
            ...rules,
            {
              id: uid(),
              category: "physics",
              rule: "",
              violationConsequence: "",
            },
          ])
        }
      >
        + Add hard rule
      </button>
    </div>
  );
}

function SoftRulesEditor({
  rules,
  onChange,
}: {
  rules: SoftRule[];
  onChange: (next: SoftRule[]) => void;
}) {
  const update = (id: string, patch: Partial<SoftRule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {rules.map((r) => (
        <div
          key={r.id}
          className="space-y-1 rounded border border-black/[.08] p-2 dark:border-white/[.12]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Soft rule</span>
            <button
              type="button"
              className={btnDanger}
              onClick={() => onChange(rules.filter((x) => x.id !== r.id))}
            >
              Delete
            </button>
          </div>
          <textarea
            value={r.rule}
            rows={2}
            onChange={(e) => update(r.id, { rule: e.target.value })}
            className={input}
          />
          <div>
            <span className={label}>Conditions (comma separated)</span>
            <input
              value={(r.conditions ?? []).join(", ")}
              onChange={(e) =>
                update(r.id, {
                  conditions: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className={input}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className={btn}
        onClick={() => onChange([...rules, { id: uid(), rule: "" }])}
      >
        + Add soft rule
      </button>
    </div>
  );
}

function CharactersEditor({
  characters,
  onChange,
}: {
  characters: Character[];
  onChange: (next: Character[]) => void;
}) {
  const update = (id: string, patch: Partial<Character>) =>
    onChange(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const splitCsv = (v: string) =>
    v.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-3">
      {characters.map((c) => (
        <details
          key={c.id}
          className="rounded border border-black/[.08] p-2 dark:border-white/[.12]"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {c.name || "(unnamed)"}
            </span>
            <button
              type="button"
              className={btnDanger}
              onClick={(e) => {
                e.preventDefault();
                onChange(characters.filter((x) => x.id !== c.id));
              }}
            >
              Delete
            </button>
          </summary>
          <div className="mt-2 space-y-1">
            <div>
              <span className={label}>Name</span>
              <input
                value={c.name}
                onChange={(e) => update(c.id, { name: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Aliases (comma separated)</span>
              <input
                value={(c.aliases ?? []).join(", ")}
                onChange={(e) => update(c.id, { aliases: splitCsv(e.target.value) })}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Appearance</span>
              <textarea
                rows={2}
                value={c.appearance}
                onChange={(e) => update(c.id, { appearance: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Traits (comma separated)</span>
              <input
                value={c.traits.join(", ")}
                onChange={(e) => update(c.id, { traits: splitCsv(e.target.value) })}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Motivation</span>
              <textarea
                rows={2}
                value={c.motivation}
                onChange={(e) => update(c.id, { motivation: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Fear</span>
              <textarea
                rows={2}
                value={c.fear}
                onChange={(e) => update(c.id, { fear: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Secret (optional)</span>
              <textarea
                rows={2}
                value={c.secret ?? ""}
                onChange={(e) => update(c.id, { secret: e.target.value })}
                className={input}
              />
            </div>
            <div>
              <span className={label}>Speech style</span>
              <textarea
                rows={2}
                value={c.speechStyle}
                onChange={(e) => update(c.id, { speechStyle: e.target.value })}
                className={input}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={label}>Arc from</span>
                <input
                  value={c.arc?.from ?? ""}
                  onChange={(e) =>
                    update(c.id, {
                      arc: { from: e.target.value, to: c.arc?.to ?? "" },
                    })
                  }
                  className={input}
                />
              </div>
              <div>
                <span className={label}>Arc to</span>
                <input
                  value={c.arc?.to ?? ""}
                  onChange={(e) =>
                    update(c.id, {
                      arc: { from: c.arc?.from ?? "", to: e.target.value },
                    })
                  }
                  className={input}
                />
              </div>
            </div>
          </div>
        </details>
      ))}
      <button
        type="button"
        className={btn}
        onClick={() =>
          onChange([
            ...characters,
            {
              id: uid(),
              name: "",
              appearance: "",
              traits: [""],
              motivation: "",
              fear: "",
              speechStyle: "",
            },
          ])
        }
      >
        + Add character
      </button>
    </div>
  );
}

function RelationshipsEditor({
  characters,
  relationships,
  onChange,
}: {
  characters: Character[];
  relationships: Relationship[];
  onChange: (next: Relationship[]) => void;
}) {
  const update = (idx: number, patch: Partial<Relationship>) =>
    onChange(relationships.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {relationships.map((r, idx) => (
        <div
          key={idx}
          className="space-y-1 rounded border border-black/[.08] p-2 dark:border-white/[.12]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Relationship</span>
            <button
              type="button"
              className={btnDanger}
              onClick={() => onChange(relationships.filter((_, i) => i !== idx))}
            >
              Delete
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={r.fromId}
              onChange={(e) => update(idx, { fromId: e.target.value })}
              className={input}
            >
              <option value="">From...</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "(unnamed)"}
                </option>
              ))}
            </select>
            <select
              value={r.toId}
              onChange={(e) => update(idx, { toId: e.target.value })}
              className={input}
            >
              <option value="">To...</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "(unnamed)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={r.type}
              onChange={(e) =>
                update(idx, { type: e.target.value as Relationship["type"] })
              }
              className={input}
            >
              {[
                "love", "hate", "friend", "rival",
                "family", "mentor", "betrayal", "debt",
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={10}
              value={r.intensity}
              onChange={(e) => update(idx, { intensity: Number(e.target.value) })}
              className={input}
            />
          </div>
          <div>
            <span className={label}>History</span>
            <textarea
              rows={2}
              value={r.history}
              onChange={(e) => update(idx, { history: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <span className={label}>Current state</span>
            <textarea
              rows={2}
              value={r.currentState}
              onChange={(e) => update(idx, { currentState: e.target.value })}
              className={input}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        className={btn}
        disabled={characters.length < 2}
        onClick={() =>
          onChange([
            ...relationships,
            {
              fromId: characters[0]?.id ?? "",
              toId: characters[1]?.id ?? "",
              type: "friend",
              intensity: 5,
              history: "",
              currentState: "",
            },
          ])
        }
      >
        + Add relationship
      </button>
    </div>
  );
}

function NarrativeEditor({
  rules,
  onChange,
}: {
  rules: StoryBible["narrativeRules"];
  onChange: (next: StoryBible["narrativeRules"]) => void;
}) {
  const splitCsv = (v: string) =>
    v.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>POV</span>
          <select
            value={rules.pov}
            onChange={(e) =>
              onChange({ ...rules, pov: e.target.value as typeof rules.pov })
            }
            className={input}
          >
            {["first", "third_limited", "third_omniscient"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Tense</span>
          <select
            value={rules.tense}
            onChange={(e) =>
              onChange({ ...rules, tense: e.target.value as typeof rules.tense })
            }
            className={input}
          >
            {["past", "present"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>Tone</span>
          <input
            value={rules.tone}
            onChange={(e) => onChange({ ...rules, tone: e.target.value })}
            className={input}
          />
        </div>
        <div>
          <span className={label}>Pacing</span>
          <select
            value={rules.pacing}
            onChange={(e) =>
              onChange({ ...rules, pacing: e.target.value as typeof rules.pacing })
            }
            className={input}
          >
            {["slow", "medium", "fast"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>Scene min words</span>
          <input
            type="number"
            value={rules.sceneLengthWords.min}
            onChange={(e) =>
              onChange({
                ...rules,
                sceneLengthWords: {
                  ...rules.sceneLengthWords,
                  min: Number(e.target.value),
                },
              })
            }
            className={input}
          />
        </div>
        <div>
          <span className={label}>Scene max words</span>
          <input
            type="number"
            value={rules.sceneLengthWords.max}
            onChange={(e) =>
              onChange({
                ...rules,
                sceneLengthWords: {
                  ...rules.sceneLengthWords,
                  max: Number(e.target.value),
                },
              })
            }
            className={input}
          />
        </div>
      </div>
      <div>
        <span className={label}>Dialogue ratio (0-1)</span>
        <input
          type="number"
          step="0.05"
          min={0}
          max={1}
          value={rules.dialogueRatio}
          onChange={(e) =>
            onChange({ ...rules, dialogueRatio: Number(e.target.value) })
          }
          className={input}
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={rules.showDontTell}
          onChange={(e) => onChange({ ...rules, showDontTell: e.target.checked })}
        />
        Show, don&apos;t tell
      </label>
      <div>
        <span className={label}>Forbidden tropes (comma separated)</span>
        <input
          value={rules.forbiddenTropes.join(", ")}
          onChange={(e) =>
            onChange({ ...rules, forbiddenTropes: splitCsv(e.target.value) })
          }
          className={input}
        />
      </div>
    </div>
  );
}