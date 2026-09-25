"use client";

import { useState } from "react";
import type { StoryBible, SceneOutput } from "@/lib/world/schemas";
import {
  validateSceneAgainstBible,
  type ValidationIssue,
} from "@/lib/world/validate";
import { applyContinuity } from "@/lib/world/continuity";
import { copyScene, orderScenes } from "@/lib/world/scenes";

type Props = {
  bible: StoryBible;
  onInsertToDraft: (text: string) => void;
  onApplyContinuity: (next: StoryBible) => void;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const input =
  "w-full rounded border border-black/[.12] bg-transparent px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-400 dark:border-white/[.18] dark:text-zinc-200";
const label = "text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const btn =
  "rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-black/[.06] dark:border-white/[.18] dark:text-zinc-300";
const btnDanger =
  "rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400";

export function ScenePanel({ bible, onInsertToDraft, onApplyContinuity }: Props) {
  const [sceneId, setSceneId] = useState(bible.scenes[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SceneOutput | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState("");
  const [showEditor, setShowEditor] = useState(false);

  const scene = bible.scenes.find((s) => s.id === sceneId);
  const parent = scene?.parentId
    ? bible.scenes.find((s) => s.id === scene.parentId)
    : undefined;

  function addScene() {
    const s = {
      id: uid(),
      title: "New scene",
      goal: "",
      location: "",
      time: "",
      characterIds: [],
      conflict: "",
      turningPoint: "",
      consequence: "",
      status: "planned" as const,
    };
    onApplyContinuity({ ...bible, scenes: [...bible.scenes, s] });
    setSceneId(s.id);
    setShowEditor(true);
  }

  /** Copies the chosen scene. The copy becomes a child of the scene it came from. */
  function duplicateScene() {
    if (!scene) return;
    const copy = copyScene(scene, bible.scenes);
    onApplyContinuity({ ...bible, scenes: [...bible.scenes, copy] });
    setSceneId(copy.id);
    setShowEditor(true);
  }

  /** Removes the chosen scene. Its copies stay, set loose from a scene that is gone. */
  function deleteScene() {
    if (!scene) return;
    const remaining = bible.scenes
      .filter((s) => s.id !== scene.id)
      .map((s) => (s.parentId === scene.id ? { ...s, parentId: undefined } : s));
    onApplyContinuity({ ...bible, scenes: remaining });
    setSceneId(remaining[0]?.id ?? "");
    setResult(null);
    setIssues([]);
  }

  function updateScene(patch: Partial<NonNullable<typeof scene>>) {
    if (!scene) return;
    onApplyContinuity({
      ...bible,
      scenes: bible.scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)),
    });
  }

  async function generate() {
    if (!sceneId) return;
    setBusy(true);
    setError("");
    setResult(null);
    setIssues([]);
    try {
      const res = await fetch("/api/world/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bible,
          sceneId,
          previousScenes: bible.continuityLog,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setResult(data.output);
      setIssues(validateSceneAgainstBible(data.output, bible));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    if (!result) return;
    onInsertToDraft(result.prose);
    onApplyContinuity(applyContinuity(bible, sceneId, result));
    setResult(null);
    setIssues([]);
  }

  function toggleCharacter(id: string) {
    if (!scene) return;
    const has = scene.characterIds.includes(id);
    updateScene({
      characterIds: has
        ? scene.characterIds.filter((x) => x !== id)
        : [...scene.characterIds, id],
    });
  }

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 text-sm">
      <div className="flex gap-1">
        <select
          value={sceneId}
          onChange={(e) => setSceneId(e.target.value)}
          className={input}
        >
          <option value="">Select scene...</option>
          {orderScenes(bible.scenes).map(({ scene: s, depth }) => (
            <option key={s.id} value={s.id}>
              {depth > 0 ? `${"— ".repeat(depth)}` : ""}
              {s.title || "(untitled scene)"}
            </option>
          ))}
        </select>
        <button type="button" className={btn} onClick={addScene}>
          + New
        </button>
        <button
          type="button"
          className={btn}
          onClick={duplicateScene}
          disabled={!scene}
          title="Copy this scene — the copy becomes a child of it"
        >
          Copy
        </button>
        <button
          type="button"
          className={btnDanger}
          onClick={deleteScene}
          disabled={!scene}
          title="Delete this scene"
        >
          Delete
        </button>
      </div>

      {scene && (
        <>
          <button
            type="button"
            className={btn}
            onClick={() => setShowEditor((v) => !v)}
          >
            {showEditor ? "Hide scene plan" : "Edit scene plan"}
          </button>

          {showEditor && (
            <div className="space-y-1 rounded border border-black/[.08] p-2 dark:border-white/[.12]">
              {parent && (
                <div>
                  <span className={label}>Parent scene</span>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {parent.title || "(untitled scene)"} — this scene is a copy of it
                  </p>
                </div>
              )}
              {(["title", "goal", "location", "time", "conflict", "turningPoint", "consequence"] as const).map(
                (field) => (
                  <div key={field}>
                    <span className={label}>{field}</span>
                    <textarea
                      rows={field === "title" ? 1 : 2}
                      value={scene[field]}
                      onChange={(e) => updateScene({ [field]: e.target.value })}
                      className={input}
                    />
                  </div>
                ),
              )}
              <div>
                <span className={label}>Characters</span>
                <div className="flex flex-wrap gap-1">
                  {bible.characters.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCharacter(c.id)}
                      className={`rounded px-2 py-1 text-xs ${
                        scene.characterIds.includes(c.id)
                          ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                          : "border border-black/[.12] dark:border-white/[.18]"
                      }`}
                    >
                      {c.name || "(unnamed)"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? "Generating..." : "Generate scene"}
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {issues.length > 0 && (
        <ul className="space-y-1 text-xs">
          {issues.map((iss, i) => (
            <li
              key={i}
              className={
                iss.severity === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
              }
            >
              [{iss.severity}] {iss.message}
            </li>
          ))}
        </ul>
      )}

      {result && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded border border-black/[.08] p-2 text-xs dark:border-white/[.12]">
            {result.prose}
          </div>
          <button
            type="button"
            onClick={accept}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white"
          >
            Accept → Draft + Continuity
          </button>
        </>
      )}
    </div>
  );
}