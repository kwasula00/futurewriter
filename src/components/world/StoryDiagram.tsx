"use client";

import "@xyflow/react/dist/style.css";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";

import {
  createStoryDiagram,
  getStoryDiagram,
  listStoryDiagrams,
  saveStoryDiagram,
  type StoryDiagramSummary,
} from "@/app/actions/diagrams";
import {
  INTERACTION_CATEGORY_LABEL,
  INTERACTION_COLOR,
  characterCard,
  interactionEdgeStyle,
  resolveCharacter,
  resolveScene,
  sceneCard,
  toFlowEdges,
  toFlowNodes,
  toStoredEdges,
  toStoredNodes,
  type Interaction,
  type InteractionCategory,
  type StoryFlowEdge,
  type StoryFlowNode,
  type StoryNodeData,
  type StoryNodeKind,
} from "@/lib/world/diagram";
import { copyScene } from "@/lib/world/scenes";
import type { Character, SceneTemplate } from "@/lib/world/schemas";

/** The colour each kind of card is drawn in, matching the panel it comes from. */
const KIND_ACCENT: Record<StoryNodeKind, { dot: string; border: string; minimap: string }> = {
  character: { dot: "bg-sky-500", border: "border-sky-500/40", minimap: "#0ea5e9" },
  scene: { dot: "bg-emerald-500", border: "border-emerald-500/40", minimap: "#10b981" },
  hardRule: { dot: "bg-red-500", border: "border-red-500/40", minimap: "#ef4444" },
  softRule: { dot: "bg-violet-500", border: "border-violet-500/40", minimap: "#8b5cf6" },
};

/** What the buttons offer, and what a fresh card is called. */
const KIND_LABEL: Record<StoryNodeKind, string> = {
  character: "Character",
  scene: "Scene",
  hardRule: "Hard rule",
  softRule: "Soft rule",
};

const KIND_BADGE: Record<StoryNodeKind, string> = {
  character: "character",
  scene: "scene",
  hardRule: "hard rule",
  softRule: "soft rule",
};

/** The interaction categories, in the order the pickers offer them. */
const INTERACTION_CATEGORIES = Object.keys(INTERACTION_CATEGORY_LABEL) as InteractionCategory[];

/** Every card is the same width, so the canvas draws them in even columns. */
const CARD_WIDTH = 216;

const toolButton =
  "rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.06] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[.18] dark:text-zinc-300 dark:hover:bg-white/[.08]";

const fieldInput =
  "min-w-0 rounded-md border border-black/[.12] bg-white px-2 py-1 text-xs text-zinc-800 outline-none focus:border-zinc-400 dark:border-white/[.18] dark:bg-zinc-900 dark:text-zinc-100";

/**
 * The canvas hands each card the way to copy a scene. A card is drawn from its
 * data alone, so the act of copying — which reaches World and the canvas at
 * once — is carried in beside it rather than on it.
 */
const CopySceneContext = createContext<(nodeId: string) => void>(() => {});

/**
 * The story bible a scene card reads its fuller properties from: the names of
 * the characters the scene holds, and the title of the scene it was copied
 * from. Both live in World, so they are carried in beside the card rather than
 * on it — the card itself only holds the scene it stands for.
 */
const SceneWorldContext = createContext<{ characters: Character[]; scenes: SceneTemplate[] }>({
  characters: [],
  scenes: [],
});

/** The label and value of one field a scene card shows. */
type SceneField = { label: string; value: string };

/**
 * Every field of a scene, read out on the scene card so the writer can see the
 * whole plan of the scene at a glance. A field the writer has not filled in is
 * shown as a dash rather than left out, so the shape is the same for one scene
 * as for the next.
 */
function SceneFields({ scene }: { scene: SceneTemplate }) {
  const { characters, scenes } = useContext(SceneWorldContext);
  const parent = scene.parentId
    ? scenes.find((candidate) => candidate.id === scene.parentId)
    : undefined;

  const fields: SceneField[] = [
    { label: "Goal", value: scene.goal },
    { label: "Conflict", value: scene.conflict },
    { label: "Turning point", value: scene.turningPoint },
    { label: "Consequence", value: scene.consequence },
    { label: "Location", value: scene.location },
    { label: "Time", value: scene.time },
    {
      label: "Characters",
      value: scene.characterIds
        .map((id) => characters.find((candidate) => candidate.id === id)?.name.trim() || "(unknown)")
        .join(", "),
    },
    ...(parent ? [{ label: "Copy of", value: parent.title.trim() || "(untitled scene)" }] : []),
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
      {fields.map((field) => (
        <div key={field.label} className="min-w-0">
          <dt className="text-[9px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {field.label}
          </dt>
          <dd
            className={`whitespace-pre-wrap text-xs ${
              field.value.trim()
                ? "text-zinc-600 dark:text-zinc-300"
                : "text-zinc-300 dark:text-zinc-600"
            }`}
          >
            {field.value.trim() || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One card on the map. A character, a rule and a scene are all drawn by this
 * component — the kind only changes the accent — so the kinds cannot drift
 * apart in style. A scene card carries the whole plan of its scene below the
 * title, where the other kinds carry their detail rows.
 */
function StoryCard({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const accent = KIND_ACCENT[data.kind];
  const copySceneNode = useContext(CopySceneContext);
  const isScene = data.kind === "scene";

  return (
    <div
      className={`w-[216px] overflow-hidden rounded-lg border bg-white text-left shadow-sm dark:bg-zinc-900 ${accent.border} ${
        selected ? "ring-2 ring-zinc-400 dark:ring-zinc-500" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-zinc-400" />

      <div className="flex items-start gap-2 px-2 py-1.5">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
            {data.title || "(untitled)"}
          </p>
          {data.subtitle && (
            <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">{data.subtitle}</p>
          )}
        </div>
        <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {data.badge}
        </span>
        {/* A scene card can be copied: the copy is a card of its own and a scene
            of its own, so the two can be told apart and edited apart. */}
        {isScene && (
          <button
            type="button"
            title="Copy this scene — a new card here and a new scene in World → Scenes"
            aria-label="Copy this scene"
            onClick={(event) => {
              event.stopPropagation();
              copySceneNode(id);
            }}
            className="nodrag shrink-0 rounded border border-black/[.12] px-1 py-0.5 text-[9px] font-medium text-zinc-600 transition-colors hover:bg-black/[.06] dark:border-white/[.18] dark:text-zinc-300 dark:hover:bg-white/[.08]"
          >
            Copy
          </button>
        )}
      </div>

      {isScene && data.scene && (
        <div className="border-t border-black/[.06] px-2 py-1 dark:border-white/[.08]">
          <SceneFields scene={data.scene} />
        </div>
      )}
      {!isScene && data.lines.length > 0 && (
        <ul className="border-t border-black/[.06] px-2 py-1 text-[10px] leading-[15px] text-zinc-600 dark:border-white/[.08] dark:text-zinc-400">
          {data.lines.slice(0, 3).map((line, index) => (
            <li key={index} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      )}

      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-zinc-400" />
    </div>
  );
}

/** React Flow wants this to be stable, so it is built once at module scope. */
const nodeTypes = {
  character: StoryCard,
  scene: StoryCard,
  hardRule: StoryCard,
  softRule: StoryCard,
};

/** A name for a new diagram that none of the project's diagrams already uses. */
function nextName(existing: string[]): string {
  const base = "Story Flow";
  if (!existing.includes(base)) return base;
  let count = 2;
  while (existing.includes(`${base} ${count}`)) count += 1;
  return `${base} ${count}`;
}

/** A diagram as the canvas reads it, both as cards and as the text to store. */
type LoadedDiagram = {
  id: string;
  name: string;
  flowNodes: StoryFlowNode[];
  flowEdges: StoryFlowEdge[];
  interactions: Interaction[];
};

/** Everything worth saving, in one string, so a save only fires on real edits. */
function snapshot(
  flowNodes: StoryFlowNode[],
  flowEdges: StoryFlowEdge[],
  interactions: Interaction[],
): string {
  return JSON.stringify({
    version: 1,
    nodes: toStoredNodes(flowNodes),
    edges: toStoredEdges(flowEdges),
    interactions,
  });
}

/**
 * The Story Diagram: a window over the workspace, and a thing of its own. Each
 * project keeps its own diagrams, so opening the window for the first time
 * starts an empty one and every card, word and arrow after that is the
 * writer's, saved as it changes. A project can hold several, chosen by name.
 *
 * The characters of the story bible are handed in, so a card can be put down for
 * one of them: the card carries that character, and the same character can be
 * put down as many times as the writer needs.
 */
export function StoryDiagram({
  projectId,
  characters,
  scenes,
  onCreateScene,
  onClose,
}: {
  projectId: string;
  characters: Character[];
  scenes: SceneTemplate[];
  onCreateScene: (scene: SceneTemplate) => void;
  onClose: () => void;
}) {
  return (
    <ReactFlowProvider>
      <DiagramWindow
        projectId={projectId}
        characters={characters}
        scenes={scenes}
        onCreateScene={onCreateScene}
        onClose={onClose}
      />
    </ReactFlowProvider>
  );
}

function DiagramWindow({
  projectId,
  characters,
  scenes,
  onCreateScene,
  onClose,
}: {
  projectId: string;
  characters: Character[];
  scenes: SceneTemplate[];
  onCreateScene: (scene: SceneTemplate) => void;
  onClose: () => void;
}) {
  const { screenToFlowPosition } = useReactFlow();

  const [loading, setLoading] = useState(true);
  const [diagrams, setDiagrams] = useState<StoryDiagramSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nodes, setNodes] = useState<StoryFlowNode[]>([]);
  const [edges, setEdges] = useState<StoryFlowEdge[]>([]);
  // The interaction library of this diagram, and which interaction a freshly
  // drawn link is given. The library lives with the diagram, so it is saved
  // and reopened with it.
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [newInteractionName, setNewInteractionName] = useState("");
  const [newInteractionCategory, setNewInteractionCategory] = useState<InteractionCategory>("neutral");

  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // What the database holds, so the first render of a diagram is not written
  // straight back, and a click that only selects a card does not count as an
  // edit — the snapshot ignores what is selected.
  const savedRef = useRef<{ key: string; name: string } | null>(null);
  // What a card's copy button reads: the cards on the canvas, the scenes of
  // World, and the way back to World. The handler is bound once, so it reads
  // through a ref rather than closing over an earlier render.
  const copySource = useRef({ nodes, scenes, onCreateScene });
  // The interaction new links are drawn with, read by the connect handler, which
  // is bound once and so cannot close over the state of an earlier render.
  const activeEdgeInteraction = useRef<string | undefined>(undefined);

  const key = useMemo(() => snapshot(nodes, edges, interactions), [nodes, edges, interactions]);

  // A linked card is drawn from the current World card, so the diagram follows
  // the World panel: retitle a character or a scene there and every card
  // standing for it is redrawn. A card with no link is drawn as it was saved.
  const viewNodes = useMemo(
    () =>
      nodes.map((node) => {
        const data = resolveScene(resolveCharacter(node.data, characters), scenes);
        return { ...node, data };
      }),
    [nodes, characters, scenes],
  );

  // Every link is inked afresh from the interaction it names, so renaming an
  // interaction or moving it to another category — green, blue, red — repaints
  // the links that carry it without touching them one by one.
  const viewEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        ...interactionEdgeStyle(interactions.find((item) => item.id === edge.data?.interactionId)),
      })),
    [edges, interactions],
  );

  const selected = viewNodes.find((node) => node.selected) ?? null;
  const selectedEdge = edges.find((edge) => edge.selected) ?? null;

  // Held still between renders, so a card only reads it again when World does
  // change — the scene cards look up cast names and parents through it.
  const sceneWorld = useMemo(() => ({ characters, scenes }), [characters, scenes]);

  /** Puts a diagram on the canvas and marks it as the state on disk. */
  const loadInto = useCallback((diagram: LoadedDiagram) => {
    savedRef.current = {
      key: snapshot(diagram.flowNodes, diagram.flowEdges, diagram.interactions),
      name: diagram.name,
    };
    setActiveId(diagram.id);
    setName(diagram.name);
    setNodes(diagram.flowNodes);
    setEdges(diagram.flowEdges);
    setInteractions(diagram.interactions);
    setActiveInteractionId(diagram.interactions[0]?.id ?? null);
  }, []);

  // The project's diagrams are read once, and a project with none is given an
  // empty one so the window always opens on something the writer owns.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        let list = await listStoryDiagrams(projectId);
        const first =
          list.length === 0
            ? await createStoryDiagram(projectId, "Story Flow")
            : await getStoryDiagram(list[0].id);
        if (!first) return;
        if (list.length === 0) list = [{ id: first.id, name: first.name }];
        if (cancelled) return;
        setDiagrams(list);
        loadInto({
          id: first.id,
          name: first.name,
          flowNodes: toFlowNodes(first.data.nodes),
          flowEdges: toFlowEdges(first.data.edges),
          interactions: first.data.interactions,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadInto]);

  // Every edit is persisted, but the writer works quickly, so writes wait for a
  // pause. A snapshot that matches what is on disk is left alone.
  useEffect(() => {
    if (!activeId || loading) return;
    const last = savedRef.current;
    if (last && last.key === key && last.name === name) return;
    const timer = setTimeout(() => {
      void saveStoryDiagram({ id: activeId, name, data: JSON.parse(key) });
      savedRef.current = { key, name };
    }, 800);
    return () => clearTimeout(timer);
  }, [key, name, activeId, loading]);

  // The current diagram, read by the flush below, which is bound once and so
  // cannot close over the state of an earlier render.
  const latest = useRef({ activeId, name, key });
  useEffect(() => {
    latest.current = { activeId, name, key };
  }, [activeId, name, key]);

  // Keeps the copy button's view of the canvas and World current.
  useEffect(() => {
    copySource.current = { nodes, scenes, onCreateScene };
  }, [nodes, scenes, onCreateScene]);

  // Keeps the interaction a new link is drawn with in step with the picker.
  useEffect(() => {
    activeEdgeInteraction.current = activeInteractionId ?? undefined;
  }, [activeInteractionId]);

  // Closing the window — or the project changing under it — writes the diagram
  // at once, so an edit made in the last moment before it goes still lands.
  useEffect(
    () => () => {
      const { activeId: id, name: savedName, key: savedKey } = latest.current;
      const last = savedRef.current;
      if (!id || (last && last.key === savedKey && last.name === savedName)) return;
      void saveStoryDiagram({ id, name: savedName, data: JSON.parse(savedKey) });
    },
    [],
  );

  // The window sits above the page, so a press anywhere outside it is one the
  // reader meant for the workspace — that puts the map away. Escape too.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const onNodesChange = useCallback((changes: NodeChange<StoryFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<StoryFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  // A link is added by hand rather than through `addEdge`, so the same two cards
  // can be joined more than once — a pair of characters may talk and then come
  // to blows, and each of those is a link of its own. The link is given the
  // interaction the picker is set to; its ink is worked out while it is drawn.
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    setEdges((current) => [
      ...current,
      {
        id: `edge-${crypto.randomUUID()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        data: { interactionId: activeEdgeInteraction.current },
      },
    ]);
  }, []);

  /** Drops a card in the middle of what is on screen, nudged off its neighbours. */
  function placeNode(data: StoryNodeData) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 900) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
    });
    setNodes((current) => {
      const step = (current.length % 5) * 24;
      return [
        ...current,
        {
          id: `${data.kind}-${crypto.randomUUID()}`,
          type: data.kind,
          position: { x: center.x - CARD_WIDTH / 2 + step, y: center.y - 30 + step },
          data,
        },
      ];
    });
  }

  /** Drops a blank card of the given kind. */
  function addNode(kind: StoryNodeKind) {
    placeNode({ kind, title: KIND_LABEL[kind], subtitle: "", badge: KIND_BADGE[kind], lines: [] });
  }

  /**
   * Drops a card for a character of the story bible. Every call makes its own
   * card, so one character can stand in as many scenes as it appears in.
   */
  function addCharacterNode(characterId: string) {
    const character = characters.find((candidate) => candidate.id === characterId);
    if (!character) return;
    placeNode(characterCard(character));
  }

  /**
   * Drops a card for a scene of the story bible. Every call makes its own card,
   * so a scene can be put down as often as the writer plans it.
   */
  function addSceneNode(sceneId: string) {
    const scene = scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return;
    placeNode(sceneCard(scene));
  }

  /**
   * Copies a scene: the scene is added to World → Scenes under a new id, and a
   * card for it is put down beside the one it was copied from. The two scenes
   * are then separate, so editing one leaves the other alone.
   */
  const copySceneNode = useCallback((nodeId: string) => {
    const { nodes: current, scenes: world, onCreateScene: create } = copySource.current;
    const node = current.find((candidate) => candidate.id === nodeId);
    const scene = world.find((candidate) => candidate.id === node?.data.sceneId);
    if (!node || !scene) return;
    const copy = copyScene(scene, world);
    create(copy);
    const card: StoryFlowNode = {
      id: `scene-${crypto.randomUUID()}`,
      type: "scene",
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: sceneCard(copy),
    };
    setNodes((currentNodes) => [...currentNodes, card]);
  }, []);

  /**
   * Takes the selected card off the canvas, with the arrows that touch it.
   */
  function deleteSelected() {
    if (!selected) return;
    const id = selected.id;
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) =>
      current.filter((edge) => edge.source !== id && edge.target !== id),
    );
  }

  /** Writes an edited word back onto the selected card. */
  function patchSelected(data: Partial<StoryNodeData>) {
    if (!selected) return;
    const id = selected.id;
    setNodes((current) =>
      current.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...data } } : node)),
    );
  }

  /** Adds an interaction of the writer's own to the library. */
  function addInteraction() {
    const name = newInteractionName.trim();
    if (!name) return;
    const interaction: Interaction = {
      id: `interaction-${crypto.randomUUID()}`,
      name,
      category: newInteractionCategory,
      description: "",
    };
    setInteractions((current) => [...current, interaction]);
    setNewInteractionName("");
  }

  /** Changes a library interaction, so every link naming it is redrawn. */
  function updateInteraction(id: string, patch: Partial<Interaction>) {
    setInteractions((current) =>
      current.map((interaction) =>
        interaction.id === id ? { ...interaction, ...patch } : interaction,
      ),
    );
  }

  /**
   * Takes an interaction out of the library. The links that named it stay on the
   * map — only their label and ink go, back to the plain grey arrow — so a
   * deleted interaction never silently erases a link the writer drew.
   */
  function deleteInteraction(id: string) {
    setInteractions((current) => current.filter((interaction) => interaction.id !== id));
    setEdges((current) =>
      current.map((edge) =>
        edge.data?.interactionId === id ? { ...edge, data: { ...edge.data, interactionId: undefined } } : edge,
      ),
    );
  }

  /** Names the interaction of one link, which repaints it in that category's ink. */
  function updateEdgeInteraction(edgeId: string, interactionId: string | undefined) {
    setEdges((current) =>
      current.map((edge) => (edge.id === edgeId ? { ...edge, data: { ...edge.data, interactionId } } : edge)),
    );
  }

  /** Takes one link off the canvas. */
  function deleteEdge(edgeId: string) {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
  }

  /** Opens one of the project's other diagrams. */
  async function openDiagram(id: string) {
    if (id === activeId) return;
    const diagram = await getStoryDiagram(id);
    if (!diagram) return;
    loadInto({
      id: diagram.id,
      name: diagram.name,
      flowNodes: toFlowNodes(diagram.data.nodes),
      flowEdges: toFlowEdges(diagram.data.edges),
      interactions: diagram.data.interactions,
    });
  }

  /** Starts another empty diagram for this project and opens it. */
  async function addDiagram() {
    const created = await createStoryDiagram(projectId, nextName(diagrams.map((d) => d.name)));
    setDiagrams((current) => [...current, { id: created.id, name: created.name }]);
    loadInto({
      id: created.id,
      name: created.name,
      flowNodes: toFlowNodes(created.data.nodes),
      flowEdges: toFlowEdges(created.data.edges),
      interactions: created.data.interactions,
    });
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Story Diagram"
      className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-black/[.12] bg-white shadow-2xl dark:border-white/[.18] dark:bg-zinc-950 lg:inset-x-16"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-black/[.08] px-4 py-3 dark:border-white/[.12]">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
            Story Diagram
          </h2>

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Diagram name"
            className={`${fieldInput} w-40`}
          />

          {diagrams.length > 1 && (
            <select
              value={activeId ?? ""}
              onChange={(event) => void openDiagram(event.target.value)}
              aria-label="Open another diagram"
              className={fieldInput}
            >
              {diagrams.map((diagram) => (
                <option key={diagram.id} value={diagram.id}>
                  {diagram.name}
                </option>
              ))}
            </select>
          )}

          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {nodes.length} nodes · {edges.length} links
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void addDiagram()} className={toolButton}>
            New diagram
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close the diagram"
            className={toolButton}
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-black/[.08] px-4 py-2 dark:border-white/[.12]">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Add
        </span>
        {/* A character card or a scene card is always one from World, so the two
            pickers below stand in for the buttons the other kinds get. */}
        {(Object.keys(KIND_LABEL) as StoryNodeKind[])
          .filter((kind) => kind !== "character" && kind !== "scene")
          .map((kind) => (
            <button key={kind} type="button" onClick={() => addNode(kind)} className={toolButton}>
              + {KIND_LABEL[kind]}
            </button>
          ))}
        <select
          value=""
          onChange={(event) => addSceneNode(event.target.value)}
          disabled={scenes.length === 0}
          title="Add a card for a scene from World → Scenes"
          aria-label="Add a scene from World"
          className={fieldInput}
        >
          <option value="">
            {scenes.length > 0 ? `+ Scene (${scenes.length} in World)…` : "No scenes in World yet"}
          </option>
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.title.trim() || "(untitled scene)"}
            </option>
          ))}
        </select>
        <select
          value=""
          onChange={(event) => addCharacterNode(event.target.value)}
          disabled={characters.length === 0}
          title="Add a card for a character from World → Characters"
          aria-label="Add a character from World"
          className={fieldInput}
        >
          <option value="">
            {characters.length > 0
              ? `+ Character (${characters.length} in World)…`
              : "No characters in World yet"}
          </option>
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name.trim() || character.aliases?.[0] || "(unnamed)"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!selected}
          className={`${toolButton} ml-1`}
        >
          Delete card
        </button>

        {/* Which interaction a link drawn from here is given. The colour the
            link will take is shown beside it, so the mark is chosen in the
            same gesture as the link. */}
        <label className="ml-2 flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Interaction
          </span>
          <select
            value={activeInteractionId ?? ""}
            onChange={(event) => setActiveInteractionId(event.target.value || null)}
            disabled={interactions.length === 0}
            title="The interaction new links are drawn with"
            aria-label="Interaction for new links"
            className={fieldInput}
          >
            {interactions.length === 0 && <option value="">No interactions</option>}
            {interactions.map((interaction) => (
              <option key={interaction.id} value={interaction.id}>
                {interaction.name} · {INTERACTION_CATEGORY_LABEL[interaction.category]}
              </option>
            ))}
          </select>
        </label>
        <span
          title="Friendly · neutral · hostile"
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
          style={{
            backgroundColor: INTERACTION_COLOR[
              interactions.find((item) => item.id === activeInteractionId)?.category ?? "neutral"
            ],
          }}
        />
        <button type="button" onClick={() => setShowLibrary((open) => !open)} className={toolButton}>
          {showLibrary ? "Hide library" : `Library (${interactions.length})`}
        </button>

        <span className="ml-2 text-[10px] text-zinc-400 dark:text-zinc-500">
          Drag cards, drag a card&apos;s edge handle to another to connect, select and press
          Backspace to remove.
        </span>
      </div>

      {showLibrary && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-black/[.08] px-4 py-2 dark:border-white/[.12]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Interaction library
            </span>
            <input
              value={newInteractionName}
              onChange={(event) => setNewInteractionName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addInteraction();
                }
              }}
              placeholder="New interaction name"
              aria-label="New interaction name"
              className={`${fieldInput} w-48`}
            />
            <select
              value={newInteractionCategory}
              onChange={(event) => setNewInteractionCategory(event.target.value as InteractionCategory)}
              aria-label="New interaction category"
              className={fieldInput}
            >
              {INTERACTION_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {INTERACTION_CATEGORY_LABEL[category]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addInteraction}
              disabled={!newInteractionName.trim()}
              className={toolButton}
            >
              + Add interaction
            </button>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Green friendly · blue neutral · red hostile — edit or remove any of them.
            </span>
          </div>

          <ul className="flex max-h-44 flex-col gap-1 overflow-auto">
            {interactions.map((interaction) => (
              <li key={interaction.id} className="flex flex-wrap items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: INTERACTION_COLOR[interaction.category] }}
                />
                <input
                  value={interaction.name}
                  onChange={(event) => updateInteraction(interaction.id, { name: event.target.value })}
                  aria-label="Interaction name"
                  className={`${fieldInput} w-48`}
                />
                <select
                  value={interaction.category}
                  onChange={(event) =>
                    updateInteraction(interaction.id, {
                      category: event.target.value as InteractionCategory,
                    })
                  }
                  aria-label="Interaction category"
                  className={fieldInput}
                >
                  {INTERACTION_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {INTERACTION_CATEGORY_LABEL[category]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => deleteInteraction(interaction.id)}
                  className={toolButton}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedEdge && (
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-black/[.08] px-4 py-2 dark:border-white/[.12]">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Link interaction
            </span>
            <select
              value={selectedEdge.data?.interactionId ?? ""}
              onChange={(event) => updateEdgeInteraction(selectedEdge.id, event.target.value || undefined)}
              aria-label="Interaction of this link"
              className={`${fieldInput} w-56`}
            >
              <option value="">No interaction</option>
              {interactions.map((interaction) => (
                <option key={interaction.id} value={interaction.id}>
                  {interaction.name} · {INTERACTION_CATEGORY_LABEL[interaction.category]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => deleteEdge(selectedEdge.id)} className={toolButton}>
            Delete link
          </button>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {selectedEdge.data?.interactionId
              ? "This link is drawn in its interaction's colour."
              : "Pick an interaction to mark this link — green, blue or red."}
          </span>
        </div>
      )}

      {selected && (
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-black/[.08] px-4 py-2 dark:border-white/[.12]">
          {selected.data.kind === "character" && (
            // Every character card is tied to a character of World → Characters.
            // A card drawn before that link existed can be tied here.
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Character
              </span>
              <select
                value={selected.data.characterId ?? ""}
                onChange={(event) => patchSelected({ characterId: event.target.value || undefined })}
                disabled={characters.length === 0}
                className={`${fieldInput} w-52`}
              >
                <option value="">Not linked</option>
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name.trim() || character.aliases?.[0] || "(unnamed)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected.data.kind === "scene" && (
            // Every scene card is tied to a scene of World → Scenes. A card
            // copied here is a scene of its own, so it is tied on its own.
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Scene
              </span>
              <select
                value={selected.data.sceneId ?? ""}
                onChange={(event) => patchSelected({ sceneId: event.target.value || undefined })}
                disabled={scenes.length === 0}
                className={`${fieldInput} w-52`}
              >
                <option value="">Not linked</option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.title.trim() || "(untitled scene)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected.data.characterId || selected.data.sceneId ? (
            // A linked card reads its words from World — Characters or Scenes —
            // so they are shown as they are rather than offered for editing:
            // editing here would be overwritten the moment World is read again.
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Title
                </span>
                <span className={`${fieldInput} w-52 truncate`}>{selected.data.title}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Subtitle
                </span>
                <span className={`${fieldInput} w-52 truncate`}>{selected.data.subtitle}</span>
              </div>
              {/* A linked card reads its words from World, so what it says is
                  shown here for reading only. */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Details
                </span>
                <span className={`${fieldInput} w-full truncate`}>
                  {selected.data.lines.join(" · ")}
                </span>
              </div>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {selected.data.sceneId ? "Edited in World → Scenes" : "Edited in World → Characters"}
              </span>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Title
                </span>
                <input
                  value={selected.data.title}
                  onChange={(event) => patchSelected({ title: event.target.value })}
                  className={`${fieldInput} w-52`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Subtitle
                </span>
                <input
                  value={selected.data.subtitle}
                  onChange={(event) => patchSelected({ subtitle: event.target.value })}
                  className={`${fieldInput} w-52`}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Details (one per line)
                </span>
                <textarea
                  value={selected.data.lines.join("\n")}
                  onChange={(event) => patchSelected({ lines: event.target.value.split("\n") })}
                  rows={2}
                  className={`${fieldInput} w-full resize-y`}
                />
              </label>
            </>
          )}
        </div>
      )}

      <div ref={canvasRef} className="relative min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Opening the diagram…</p>
          </div>
        ) : (
          // The cards are drawn from the contexts, so both are carried in
          // around the canvas they are drawn on.
          <CopySceneContext.Provider value={copySceneNode}>
            <SceneWorldContext.Provider value={sceneWorld}>
            <ReactFlow
              nodes={viewNodes}
              edges={viewEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              proOptions={{ hideAttribution: false }}
            >
              <Background gap={16} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) => KIND_ACCENT[(node as StoryFlowNode).data.kind].minimap}
              />
            </ReactFlow>

            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10">
                <p className="max-w-md text-center text-sm text-zinc-600 dark:text-zinc-400">
                  This diagram is empty. Add a Character, Scene or rule above, then drag its edge
                  handle onto another card to connect them — pick an interaction first and the link
                  is drawn in its colour: green friendly, blue neutral, red hostile. Everything
                  here is saved as you go.
                </p>
              </div>
            )}
            </SceneWorldContext.Provider>
          </CopySceneContext.Provider>
        )}
      </div>
    </div>
  );
}
