"use client";

import { useState } from "react";

import {
  CHILD_KINDS,
  CUSTOM_TEXT_KINDS,
  KIND_META,
  REQUIRED_TEXT_KINDS,
  WORK_TYPES,
  WORK_TYPE_META,
  defaultNodeTitle,
  isPositionLocked,
  newNodeId,
  type MoveDirection,
  type Structure,
  type StructureKind,
  type StructureNode,
  type WorkType,
} from "@/lib/structure/schemas";

type Props = {
  workType: WorkType;
  structure: Structure;
  onWorkTypeChange: (workType: WorkType) => void;
  onAdd: (node: StructureNode) => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: MoveDirection) => void;
  onJump: (id: string) => void;
};

const selectClass =
  "min-w-0 flex-1 rounded-md border border-black/[.15] bg-transparent px-1.5 py-1 text-xs outline-none focus:border-zinc-900 dark:border-white/[.2] dark:focus:border-zinc-50";
const iconButtonClass =
  "rounded px-1.5 py-0.5 text-xs leading-none text-zinc-500 transition-colors hover:bg-black/[.06] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.1] dark:hover:text-zinc-50";

/** The outline as rows, each element before the ones nested inside it. A
 *  collapsed element keeps its row but hides the subtree under it. The ends of
 *  each group of siblings are marked, because an element cannot travel past
 *  the group it belongs to. */
function outlineRows(nodes: StructureNode[], collapsed: Set<string>) {
  const byParent = new Map<string | null, StructureNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }

  const rows: {
    node: StructureNode;
    depth: number;
    childCount: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
  }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const siblings = byParent.get(parentId) ?? [];
    siblings.forEach((node, index) => {
      const children = byParent.get(node.id) ?? [];
      rows.push({
        node,
        depth,
        childCount: children.length,
        canMoveUp: index > 0,
        canMoveDown: index < siblings.length - 1,
      });
      if (!collapsed.has(node.id)) walk(node.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

/**
 * The construction of the work: which parts it is made of and how they nest.
 * Every element is a heading in the draft, so the tree can add, retitle, drop
 * and jump to the matching heading through the editor handle.
 */
export function StructureTree({
  workType,
  structure,
  onWorkTypeChange,
  onAdd,
  onRename,
  onRemove,
  onMove,
  onJump,
}: Props) {
  const allowedKinds = WORK_TYPE_META[workType].kinds;
  const [preferredKind, setPreferredKind] = useState<StructureKind>(allowedKinds[0]);
  // Text of an element the writer names, which is typed because the element
  // shows that text and nothing else.
  const [customText, setCustomText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  // Folders the writer has shut; everything else shows its children.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // A container whose + was pressed and is now asking which kind of child to
  // add. Nothing is nested until that choice is made, so a chapter never grows
  // a subchapter on its own.
  const [pickingChild, setPickingChild] = useState<string | null>(null);

  // A type change can leave the picker on a role the new type does not offer, so
  // the picker reads the first role the current type does offer instead.
  const newKind = allowedKinds.includes(preferredKind) ? preferredKind : allowedKinds[0];

  const wantsCustomText = CUSTOM_TEXT_KINDS.includes(newKind);
  const needsCustomText = REQUIRED_TEXT_KINDS.includes(newKind);

  const rows = outlineRows(structure.nodes, collapsed);

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startRename(node: StructureNode) {
    setEditingId(node.id);
    setDraftTitle(node.title);
  }

  function commitRename() {
    if (!editingId) return;
    const title = draftTitle.trim();
    if (title !== "") onRename(editingId, title);
    setEditingId(null);
  }

  function chooseKind(kind: StructureKind) {
    setPreferredKind(kind);
    setCustomText("");
  }

  function addRoot() {
    const text = customText.trim();
    // A title or subtitle is only the text the writer gives it, so there is
    // nothing to add until that text exists. A chapter keeps its generated
    // name when it is left unnamed.
    if (needsCustomText && text === "") return;

    onAdd({
      id: newNodeId(),
      kind: newKind,
      title: text !== "" ? text : defaultNodeTitle(newKind),
      parentId: null,
    });
    setCustomText("");
  }

  function addChild(parent: StructureNode, kind: StructureKind) {
    onAdd({
      id: newNodeId(),
      kind,
      title: defaultNodeTitle(kind),
      parentId: parent.id,
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-black/[.08] p-2 dark:border-white/[.12]">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Outline
      </h2>

      <label className="sr-only" htmlFor="work-type">
        Work type
      </label>
      <select
        id="work-type"
        value={workType}
        onChange={(event) => onWorkTypeChange(event.target.value as WorkType)}
        className={selectClass}
      >
        {WORK_TYPES.map((type) => (
          <option key={type} value={type}>
            {WORK_TYPE_META[type].label}
          </option>
        ))}
      </select>

      <ul className="flex flex-col gap-0.5">
        {rows.length === 0 && (
          <li className="px-1 py-1 text-xs text-zinc-500 dark:text-zinc-400">No elements yet.</li>
        )}

        {rows.map(({ node, depth, childCount, canMoveUp, canMoveDown }) => {
          const childKinds = CHILD_KINDS[node.kind] ?? [];
          const isCollapsed = collapsed.has(node.id);
          // A prologue or epilogue only belongs at one end of the book, so it
          // does not travel among its siblings.
          const locked = isPositionLocked(node.kind);

          return (
            <li key={node.id} className="flex items-center gap-1" style={{ paddingLeft: depth * 10 }}>
              {childCount > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleCollapsed(node.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.title}`}
                  title={isCollapsed ? "Expand" : "Collapse"}
                  className={`${iconButtonClass} w-4 px-0 text-center`}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
              ) : (
                <span aria-hidden="true" className="w-4 shrink-0" />
              )}

              {editingId === node.id ? (
                <input
                  value={draftTitle}
                  autoFocus
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename();
                    }
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  aria-label={`Rename ${node.title}`}
                  className="min-w-0 flex-1 rounded border border-black/[.15] bg-transparent px-1.5 py-1 text-xs outline-none focus:border-zinc-900 dark:border-white/[.2] dark:focus:border-zinc-50"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onJump(node.id)}
                  onDoubleClick={() => startRename(node)}
                  title={`${KIND_META[node.kind].label} — click to jump, double-click to rename`}
                  className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-xs text-zinc-700 transition-colors hover:bg-black/[.05] dark:text-zinc-300 dark:hover:bg-white/[.08]"
                >
                  {node.title}
                </button>
              )}

              {/* An element travels among its own siblings, so the ends of the
                  group are where the arrows stop. */}
              <button
                type="button"
                onClick={() => onMove(node.id, "up")}
                disabled={locked || !canMoveUp}
                aria-label={`Move ${node.title} up`}
                title={locked ? "This element keeps its place" : "Move up"}
                className={`${iconButtonClass} px-1 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(node.id, "down")}
                disabled={locked || !canMoveDown}
                aria-label={`Move ${node.title} down`}
                title={locked ? "This element keeps its place" : "Move down"}
                className={`${iconButtonClass} px-1 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
              >
                ↓
              </button>
              {/* Nesting is optional: a container only grows a child when the
                  writer asks for one. One kind of child is added straight away;
                  where more than one fits, the + asks which. */}
              {childKinds.length === 1 && (
                <button
                  type="button"
                  onClick={() => addChild(node, childKinds[0])}
                  aria-label={`Add ${KIND_META[childKinds[0]].label} inside ${node.title}`}
                  title={`Add ${KIND_META[childKinds[0]].label}`}
                  className={iconButtonClass}
                >
                  +
                </button>
              )}
              {childKinds.length > 1 &&
                (pickingChild === node.id ? (
                  <select
                    autoFocus
                    value=""
                    onChange={(event) => {
                      addChild(node, event.target.value as StructureKind);
                      setPickingChild(null);
                    }}
                    onBlur={() => window.setTimeout(() => setPickingChild(null), 0)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setPickingChild(null);
                    }}
                    aria-label={`Kind of element to add inside ${node.title}`}
                    title="Kind of element to add"
                    className="rounded border border-black/[.15] bg-transparent px-1 py-0.5 text-[10px] outline-none dark:border-white/[.2]"
                  >
                    <option value="" disabled>
                      Add…
                    </option>
                    {childKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_META[kind].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickingChild(node.id)}
                    aria-label={`Add an element inside ${node.title}`}
                    title="Add an element inside"
                    className={iconButtonClass}
                  >
                    +
                  </button>
                ))}
              <button
                type="button"
                onClick={() => onRemove(node.id)}
                aria-label={`Remove ${node.title}`}
                title="Remove"
                className={iconButtonClass}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1">
        {/* A title or subtitle is written, not labelled, so its text is asked
            for here and that text is all the draft receives. */}
        {wantsCustomText && (
          <>
            <label className="sr-only" htmlFor="new-text">
              Custom text
            </label>
            <input
              id="new-text"
              value={customText}
              autoFocus
              onChange={(event) => setCustomText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addRoot();
                }
              }}
              placeholder={`${KIND_META[newKind].label} text${needsCustomText ? "" : " (optional)"}`}
              className="min-w-0 rounded-md border border-black/[.15] bg-transparent px-1.5 py-1 text-xs outline-none placeholder:text-zinc-400 focus:border-zinc-900 dark:border-white/[.2] dark:focus:border-zinc-50"
            />
          </>
        )}

        <div className="flex gap-1">
          <label className="sr-only" htmlFor="new-kind">
            Element to add
          </label>
          <select
            id="new-kind"
            value={newKind}
            onChange={(event) => chooseKind(event.target.value as StructureKind)}
            className={selectClass}
          >
            {allowedKinds.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_META[kind].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addRoot}
            disabled={needsCustomText && customText.trim() === ""}
            className="rounded-md border border-black/[.15] px-2 py-1 text-xs font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-white/[.06]"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
