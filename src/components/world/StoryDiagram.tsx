"use client";

import "@xyflow/react/dist/style.css";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  SCENE_NODE_SIZE,
  SCENE_OUT_PORT_COUNT,
  SCENE_OUT_PORT_ID,
  SCENE_PORT_COUNT,
  characterCard,
  interactionEdgeStyle,
  isSceneBoundPort,
  orderSceneIds,
  resolveCharacter,
  resolveScene,
  sceneCard,
  sceneMembershipStyle,
  sceneOutPortId,
  sceneOutTargetPortId,
  scenePortId,
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
import { applyContinuity } from "@/lib/world/continuity";
import { copyScene } from "@/lib/world/scenes";
import type { Character, SceneOutput, SceneTemplate, StoryBible } from "@/lib/world/schemas";

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
 * The canvas hands each scene the way to open its chat. Like the copy button,
 * the act reaches the window the card is drawn in — the thread and the request
 * belong to the canvas, not to the circle — so it is carried in beside the card
 * rather than on it.
 */
const SceneChatContext = createContext<(nodeId: string) => void>(() => {});

/**
 * The canvas hands each scene the way to lift itself while its plan is open.
 * A scene's panel hangs outside the circle, so it is drawn over the cards that
 * come after it — the node is raised while the pointer is on it.
 */
const SceneHoverContext = createContext<(nodeId: string, hovered: boolean) => void>(() => {});

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
 * One card on the map — a character or a rule. The kind only changes the
 * accent, so the kinds cannot drift apart in style. A scene is drawn apart from
 * these, as a circle: see `SceneNode`.
 */
function StoryCard({ data, selected }: NodeProps<StoryFlowNode>) {
  const accent = KIND_ACCENT[data.kind];

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
      </div>

      {data.lines.length > 0 && (
        <ul className="border-t border-black/[.06] px-2 py-1 text-[10px] leading-[15px] text-zinc-600 dark:border-white/[.08] dark:text-zinc-400">
          {data.lines.slice(0, 3).map((line, index) => (
            <li key={index} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      )}

      {/* A character is taken into scenes, so a port of its own is kept for
          that: the green one, which reaches a scene and nothing else. Its other
          links — the ties it has to other cards — leave by the grey port at the
          foot, so the two are never confused. A rule has no scene to belong to,
          so its one port stays grey. */}
      {data.kind === "character" ? (
        <>
          <Handle
            id={SCENE_OUT_PORT_ID}
            type="source"
            position={Position.Right}
            className="!h-1.5 !w-1.5 !border-0 !bg-emerald-500"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            className="!h-1.5 !w-1.5 !border-0 !bg-zinc-400"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-1.5 !w-1.5 !border-0 !bg-zinc-400"
        />
      )}
    </div>
  );
}

/**
 * How far from the centre a scene's outgoing ports sit, as a percentage of the
 * circle. Past 50 they fall just outside the rim, clear of the ports that take
 * characters in, so going out is told apart from coming in.
 */
const SCENE_OUT_PORT_RADIUS = 64;

/**
 * A scene on the map: a small green circle carrying its title and the word
 * SCENE. A scene is where characters gather, so it is drawn smaller than they
 * are and marked by colour rather than by a box around them — a character
 * belongs to it through the link that points at it.
 *
 * The plan of the scene — its goal, conflict and the rest — is kept out of the
 * way until it is wanted: hover the circle and it opens beneath.
 */
function SceneNode({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const copySceneNode = useContext(CopySceneContext);
  const openSceneChat = useContext(SceneChatContext);
  const setSceneHover = useContext(SceneHoverContext);
  const title = data.title || "(untitled scene)";

  return (
    <div
      className="group relative"
      style={{ width: SCENE_NODE_SIZE, height: SCENE_NODE_SIZE }}
      onMouseEnter={() => setSceneHover(id, true)}
      onMouseLeave={() => setSceneHover(id, false)}
    >
      <div
        className={`flex h-full w-full flex-col items-center justify-center rounded-full border-2 border-emerald-600 bg-emerald-500 text-center shadow-sm transition-colors group-hover:bg-emerald-600 ${
          selected
            ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950"
            : ""
        }`}
      >
        <span className="line-clamp-2 px-2 text-[11px] font-semibold leading-tight text-white">
          {title}
        </span>
        <span className="mt-0.5 text-[8px] uppercase tracking-widest text-emerald-50">
          {data.badge || "scene"}
        </span>
      </div>

      {/* Where characters are taken in: a port apiece, set around the rim so a
          full cast does not crowd one spot. A drop near the circle snaps to the
          nearest of them. They only take links in — a link is never begun at
          one of them, so a scene is led on from its green ports and nowhere
          else, and a drag started here cannot end up going nowhere. */}
      {Array.from({ length: SCENE_PORT_COUNT }, (_, index) => {
        const angle = Math.PI + (index / SCENE_PORT_COUNT) * Math.PI * 2;
        return (
          <Handle
            key={index}
            id={scenePortId(index)}
            type="target"
            position={Position.Left}
            isConnectableStart={false}
            style={{
              left: `${50 + 50 * Math.cos(angle)}%`,
              top: `${50 + 50 * Math.sin(angle)}%`,
              transform: "translate(-50%, -50%)",
            }}
            className="!h-2 !w-2 !border-0 !bg-emerald-700 opacity-40 transition-opacity group-hover:opacity-100"
          />
        );
      })}

      {/* Where a scene leads on: two green ports set just outside the rim, top
          and bottom, so a scene can be drawn to one or two scenes of its own.
          They are twice the size of the ports around the rim, which tells the
          ones a scene goes out by from the ones it takes characters in by. They
          are lifted above the scene's plan panel, so the lower one can be taken
          hold of even while that panel is open. */}
      {Array.from({ length: SCENE_OUT_PORT_COUNT }, (_, index) => {
        const angle = Math.PI / 2 + index * Math.PI;
        const spot = {
          left: `${50 + SCENE_OUT_PORT_RADIUS * Math.cos(angle)}%`,
          top: `${50 + SCENE_OUT_PORT_RADIUS * Math.sin(angle)}%`,
          transform: "translate(-50%, -50%)",
        };
        return (
          <Fragment key={index}>
            <Handle
              id={sceneOutPortId(index)}
              type="source"
              position={index === 0 ? Position.Bottom : Position.Top}
              style={{ ...spot, zIndex: 60 }}
              className="!h-4 !w-4 !border-0 !bg-emerald-500"
            />
            {/* A scene is led on to at the same spot it leads on from: React
                Flow will not let one port be both left from and arrived at, so
                this second port lies over the green one and takes the link in.
                It cannot begin a link, so at rest the green port is the one
                taken hold of, and only while a link is being drawn does this
                one open up to take it. */}
            <Handle
              id={sceneOutTargetPortId(index)}
              type="target"
              position={index === 0 ? Position.Bottom : Position.Top}
              isConnectableStart={false}
              style={{ ...spot, zIndex: 61 }}
              className="!h-4 !w-4 !border-0 !bg-emerald-500"
            />
          </Fragment>
        );
      })}

      {/* The way to the assistant: the scene and its cast are handed over, and
          the answer — the scene written out — opens in the chat beside the map
          so the draft can be read and then put into the manuscript. It stands
          at the lower left of the circle and is always there: the plan panel
          closes the moment the pointer leaves the circle, so a button inside it
          could not be reached. */}
      <button
        type="button"
        title="Send this scene and its cast to the assistant for a draft"
        aria-label="Generate chat for this scene"
        onClick={(event) => {
          event.stopPropagation();
          openSceneChat(id);
        }}
        className="nodrag absolute bottom-0 left-0 z-[62] -translate-x-1/3 translate-y-1/3 whitespace-nowrap rounded border border-emerald-500/60 bg-white px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 opacity-80 shadow-sm transition-opacity hover:opacity-100 group-hover:opacity-100 dark:border-emerald-500/40 dark:bg-zinc-900 dark:text-emerald-400"
      >
        Generate chat
      </button>

      {/* The plan of the scene, held back until the circle is pointed at. It
          opens clear of the green port below, which is where a scene is led on
          from and so must not be covered while the circle is pointed at. */}
      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-6 w-72 -translate-x-1/2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <div className="rounded-lg border border-black/[.12] bg-white p-2 text-left shadow-xl dark:border-white/[.18] dark:bg-zinc-900">
          <div className="mb-1 flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
              {title}
            </p>
            {/* A scene can be copied: the copy is a node of its own and a scene
                of its own, so the two can be told apart and edited apart. */}
            <button
              type="button"
              title="Copy this scene — a new node here and a new scene in World → Scenes"
              aria-label="Copy this scene"
              onClick={(event) => {
                event.stopPropagation();
                copySceneNode(id);
              }}
              className="nodrag shrink-0 rounded border border-black/[.12] px-1 py-0.5 text-[9px] font-medium text-zinc-600 transition-colors hover:bg-black/[.06] dark:border-white/[.18] dark:text-zinc-300 dark:hover:bg-white/[.08]"
            >
              Copy
            </button>
          </div>
          {data.scene ? (
            <SceneFields scene={data.scene} />
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Not linked to a scene in World.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** React Flow wants this to be stable, so it is built once at module scope. */
const nodeTypes = {
  character: StoryCard,
  scene: SceneNode,
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

/** One turn of a scene's chat: what the writer asked, and what came back. */
type SceneChatTurn = {
  role: "user" | "assistant";
  content: string;
  /** The structured reply, kept on the assistant turn so it can be inserted. */
  output?: SceneOutput;
  /** Set once the reply has been put into the manuscript, so it is not put in twice. */
  inserted?: boolean;
};

/** The chat a scene is being worked in, if one is open. */
type SceneChat = {
  sceneId: string;
  title: string;
  turns: SceneChatTurn[];
  input: string;
  busy: boolean;
  error: string;
};

/**
 * The Story Diagram: a window over the workspace, and a thing of its own. Each
 * project keeps its own diagrams, so opening the window for the first time
 * starts an empty one and every card, word and arrow after that is the
 * writer's, saved as it changes. A project can hold several, chosen by name.
 *
 * The story bible is handed in whole, so a card can be put down for a character
 * or a scene of World and the scene's chat has everything the assistant needs:
 * the rules, the cast, the established facts and the order the map puts the
 * scenes in.
 */
export function StoryDiagram({
  projectId,
  bible,
  onCreateScene,
  onInsertToDraft,
  onApplyContinuity,
  onClose,
}: {
  projectId: string;
  bible: StoryBible;
  onCreateScene: (scene: SceneTemplate) => void;
  onInsertToDraft: (text: string) => void;
  onApplyContinuity: (next: StoryBible) => void;
  onClose: () => void;
}) {
  return (
    <ReactFlowProvider>
      <DiagramWindow
        projectId={projectId}
        bible={bible}
        onCreateScene={onCreateScene}
        onInsertToDraft={onInsertToDraft}
        onApplyContinuity={onApplyContinuity}
        onClose={onClose}
      />
    </ReactFlowProvider>
  );
}

function DiagramWindow({
  projectId,
  bible,
  onCreateScene,
  onInsertToDraft,
  onApplyContinuity,
  onClose,
}: {
  projectId: string;
  bible: StoryBible;
  onCreateScene: (scene: SceneTemplate) => void;
  onInsertToDraft: (text: string) => void;
  onApplyContinuity: (next: StoryBible) => void;
  onClose: () => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const { characters, scenes } = bible;

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
  // Which scene is being pointed at, so the one whose plan is open is drawn
  // above the cards around it rather than under them.
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);
  // The chat a scene is being worked in. It belongs to the canvas rather than
  // to the circle, so the thread stays up while the map is moved under it and a
  // second scene's chat simply replaces the first.
  const [chat, setChat] = useState<SceneChat | null>(null);

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
  // What a scene's chat reads when it sends: the bible as it stands, the order
  // the map puts the scenes in, and the two ways back to the workspace. The
  // handlers are bound once, so they read through a ref rather than closing
  // over the state of an earlier render.
  const chatSource = useRef({
    bible,
    sceneOrder: [] as string[],
    onInsertToDraft,
    onApplyContinuity,
  });

  const key = useMemo(() => snapshot(nodes, edges, interactions), [nodes, edges, interactions]);

  // A linked card is drawn from the current World card, so the diagram follows
  // the World panel: retitle a character or a scene there and every card
  // standing for it is redrawn. A card with no link is drawn as it was saved.
  // A scene whose plan is open is lifted above the cards drawn after it.
  const viewNodes = useMemo(
    () =>
      nodes.map((node) => {
        const data = resolveScene(resolveCharacter(node.data, characters), scenes);
        const lifted = node.data.kind === "scene" && node.id === hoveredSceneId;
        return { ...node, data, ...(lifted ? { zIndex: 1000 } : {}) };
      }),
    [nodes, characters, scenes, hoveredSceneId],
  );

  // Every link is inked afresh from the interaction it names, so renaming an
  // interaction or moving it to another category — green, blue, red — repaints
  // the links that carry it without touching them one by one. A link that ends
  // at a scene is not an interaction but a membership — the card on its other
  // end belongs to that scene — so it is inked in the scene's own green, with
  // the arrow pointing at the scene it was taken into.
  const viewEdges = useMemo(
    () =>
      edges.map((edge) => {
        const target = nodes.find((node) => node.id === edge.target);
        const membership = target?.data.kind === "scene";
        return {
          ...edge,
          ...(membership
            ? sceneMembershipStyle()
            : interactionEdgeStyle(interactions.find((item) => item.id === edge.data?.interactionId))),
        };
      }),
    [edges, nodes, interactions],
  );

  const selected = viewNodes.find((node) => node.selected) ?? null;
  const selectedEdge = edges.find((edge) => edge.selected) ?? null;

  // A link that ends at a scene is a membership, not an interaction: the card
  // on its other end belongs to that scene. Its panel says so rather than
  // offering an interaction, whose colour the scene's green would override.
  const selectedEdgeToScene =
    selectedEdge !== null &&
    viewNodes.find((node) => node.id === selectedEdge.target)?.data.kind === "scene";

  // Held still between renders, so a card only reads it again when World does
  // change — the scene cards look up cast names and parents through it.
  const sceneWorld = useMemo(() => ({ characters, scenes }), [characters, scenes]);

  // The scenes in the order the map's green links place them, so the assistant
  // is told where the scene it is writing sits in the story: what has already
  // happened, and what this scene has to set up. A scene no link reaches keeps
  // its place in World → Scenes.
  const sceneOrder = useMemo(
    () => orderSceneIds(nodes, edges, scenes),
    [nodes, edges, scenes],
  );

  /** Puts a diagram on the canvas and marks it as the state on disk. */
  const loadInto = useCallback((diagram: LoadedDiagram) => {
    // A link that ends at a scene leaves by the character's green port. Links
    // saved before that port had a name of its own carry none, so they are
    // given it here — otherwise they would hang off the grey port instead.
    const flowEdges = diagram.flowEdges.map((edge) => {
      const source = diagram.flowNodes.find((node) => node.id === edge.source);
      const target = diagram.flowNodes.find((node) => node.id === edge.target);
      if (
        target?.data.kind === "scene" &&
        source?.data.kind === "character" &&
        !edge.sourceHandle
      ) {
        return { ...edge, sourceHandle: SCENE_OUT_PORT_ID };
      }
      return edge;
    });
    savedRef.current = {
      key: snapshot(diagram.flowNodes, flowEdges, diagram.interactions),
      name: diagram.name,
    };
    setActiveId(diagram.id);
    setName(diagram.name);
    setNodes(diagram.flowNodes);
    setEdges(flowEdges);
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

  // Keeps a scene's chat reading the bible and the map as they stand now, so a
  // follow-up is written against the latest World and the latest links.
  useEffect(() => {
    chatSource.current = { bible, sceneOrder, onInsertToDraft, onApplyContinuity };
  }, [bible, sceneOrder, onInsertToDraft, onApplyContinuity]);

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

  // Raises the scene whose plan is open, and sets it back down when the pointer
  // leaves — a scene with no plan open is drawn with the rest.
  const setSceneHover = useCallback((nodeId: string, hovered: boolean) => {
    setHoveredSceneId((current) => (hovered ? nodeId : current === nodeId ? null : current));
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

  // The green ports are a scene's way in and out and nothing else: a link begun
  // at a character's green port, or at one of a scene's, must end at a scene,
  // and a scene is reached by those ports alone — so no other port can be drawn
  // to one, and a green port cannot be drawn to anything but a scene. Every
  // other pair of cards is joined as before. A card is never joined to itself:
  // a scene's own ports sit within the reach a drop now has, so without this a
  // link taken hold of at a scene would offer to land back on that same scene.
  const isValidConnection = useCallback(
    (connection: StoryFlowEdge | Connection) => {
      if (connection.source === connection.target) return false;
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      if (!source || !target) return false;
      return isSceneBoundPort(connection.sourceHandle) === (target.data.kind === "scene");
    },
    [nodes],
  );

  /** Drops a card in the middle of what is on screen, nudged off its neighbours. */
  function placeNode(data: StoryNodeData) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: (rect?.left ?? 0) + (rect?.width ?? 900) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
    });
    setNodes((current) => {
      const step = (current.length % 5) * 24;
      // A scene is a small circle, so it is centred on its own size; a card
      // keeps the height the other kinds have always been dropped with.
      const width = data.kind === "scene" ? SCENE_NODE_SIZE : CARD_WIDTH;
      const height = data.kind === "scene" ? SCENE_NODE_SIZE : 60;
      return [
        ...current,
        {
          id: `${data.kind}-${crypto.randomUUID()}`,
          type: data.kind,
          position: { x: center.x - width / 2 + step, y: center.y - height / 2 + step },
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
   * Sends a scene's chat to the assistant and folds the reply into the thread.
   * The whole bible rides along — the rules, the cast and their ties, the facts
   * already established — together with the order the map puts the scenes in,
   * so the scene is written in step with the story around it. On a follow-up
   * the turns already exchanged are replayed, so an instruction reads as a
   * change to the draft rather than as a fresh start.
   */
  const runChat = useCallback(async (sceneId: string, turns: SceneChatTurn[]) => {
    const source = chatSource.current;
    setChat((open) =>
      open && open.sceneId === sceneId ? { ...open, turns, busy: true, error: "" } : open,
    );
    try {
      const response = await fetch("/api/world/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bible: source.bible,
          sceneId,
          previousScenes: source.bible.continuityLog,
          sceneOrder: source.sceneOrder,
          history: turns.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The assistant could not write the scene.");
      const output = data.output as SceneOutput;
      setChat((open) =>
        open && open.sceneId === sceneId
          ? {
              ...open,
              busy: false,
              turns: [...turns, { role: "assistant", content: output.prose, output }],
            }
          : open,
      );
    } catch (error) {
      setChat((open) =>
        open && open.sceneId === sceneId
          ? { ...open, busy: false, error: error instanceof Error ? error.message : String(error) }
          : open,
      );
    }
  }, []);

  /**
   * Opens a scene's chat and asks for the first draft at once. A card with no
   * scene behind it — one dropped blank — has nothing to send, so it does
   * nothing.
   */
  const openSceneChat = useCallback(
    (nodeId: string) => {
      const { nodes: current, scenes: world } = copySource.current;
      const node = current.find((candidate) => candidate.id === nodeId);
      const scene = world.find((candidate) => candidate.id === node?.data.sceneId);
      if (!scene) return;
      setChat({
        sceneId: scene.id,
        title: scene.title.trim() || "(untitled scene)",
        turns: [],
        input: "",
        busy: false,
        error: "",
      });
      void runChat(scene.id, []);
    },
    [runChat],
  );

  /** Sends what the writer typed as the next instruction in the open chat. */
  function sendChat() {
    if (!chat || chat.busy) return;
    const instruction = chat.input.trim();
    if (instruction === "") return;
    setChat((open) => (open ? { ...open, input: "" } : open));
    void runChat(chat.sceneId, [...chat.turns, { role: "user", content: instruction }]);
  }

  /**
   * Puts an answer into the manuscript and records what it established — the
   * same as the Scene panel's own generation: the draft gains the prose, and
   * the bible gains the facts and relationship changes the scene left behind.
   */
  function insertChat(turn: SceneChatTurn) {
    if (!chat || !turn.output || turn.inserted) return;
    const source = chatSource.current;
    source.onInsertToDraft(turn.output.prose);
    source.onApplyContinuity(applyContinuity(source.bible, chat.sceneId, turn.output));
    setChat((open) =>
      open
        ? {
            ...open,
            turns: open.turns.map((candidate) =>
              candidate === turn ? { ...candidate, inserted: true } : candidate,
            ),
          }
        : open,
    );
  }

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
          {selectedEdgeToScene ? (
            // The link points at a scene, so it says who belongs to that scene
            // rather than which interaction it is — the green is the scene's.
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Link
                </span>
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-2.5 w-2.5 rounded-full border border-black/10 bg-emerald-500" />
                  Membership
                </span>
              </div>
              <button type="button" onClick={() => deleteEdge(selectedEdge.id)} className={toolButton}>
                Delete link
              </button>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                The card at this link&apos;s other end belongs to the scene it points at — drawn in
                the scene&apos;s green.
              </span>
            </>
          ) : (
            <>
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
            </>
          )}
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
            <SceneChatContext.Provider value={openSceneChat}>
            <SceneWorldContext.Provider value={sceneWorld}>
            <SceneHoverContext.Provider value={setSceneHover}>
            <ReactFlow
              nodes={viewNodes}
              edges={viewEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              // A scene takes links in at ports set around its rim, so the drop
              // that reaches them has to travel half the circle: with React
              // Flow's own reach a link released on the face of a scene lands on
              // nothing and no edge is made. Half the circle is exactly the
              // reach that carries a drop anywhere on a scene to its nearest
              // port, and no further than the circle's own edge.
              connectionRadius={SCENE_NODE_SIZE / 2}
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
            </SceneHoverContext.Provider>
            </SceneWorldContext.Provider>
            </SceneChatContext.Provider>
          </CopySceneContext.Provider>
        )}

        {/* The chat a scene is being worked in. It hangs over the map rather
            than in a window of its own, so the card it belongs to stays in
            sight while the draft is read and then put into the manuscript. */}
        {chat && (
          <div className="absolute bottom-3 right-3 top-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-black/[.12] bg-white shadow-2xl dark:border-white/[.18] dark:bg-zinc-900">
            <div className="flex items-start gap-2 border-b border-black/[.08] p-2 dark:border-white/[.1]">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                  {chat.title}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Scene draft
                </p>
              </div>
              <button
                type="button"
                title="Close this chat"
                aria-label="Close this chat"
                onClick={() => setChat(null)}
                className="shrink-0 rounded border border-black/[.12] px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors hover:bg-black/[.06] dark:border-white/[.18] dark:text-zinc-400 dark:hover:bg-white/[.08]"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {chat.turns.length === 0 && !chat.busy && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Sending this scene and its cast to the assistant…
                </p>
              )}
              {chat.turns.map((turn, index) =>
                turn.role === "user" ? (
                  <div
                    key={index}
                    className="ml-6 rounded-lg bg-zinc-100 px-2 py-1.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    {turn.content}
                  </div>
                ) : (
                  <div key={index} className="space-y-1">
                    <div className="whitespace-pre-wrap rounded-lg border border-emerald-500/30 bg-emerald-500/[.06] px-2 py-1.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100">
                      {turn.content}
                    </div>
                    <button
                      type="button"
                      disabled={turn.inserted}
                      onClick={() => insertChat(turn)}
                      className="rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                    >
                      {turn.inserted ? "Inserted" : "Insert into draft"}
                    </button>
                  </div>
                ),
              )}
              {chat.busy && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Writing…</p>
              )}
              {chat.error !== "" && (
                <p className="rounded border border-red-500/40 bg-red-500/[.06] px-2 py-1 text-xs text-red-600 dark:text-red-400">
                  {chat.error}
                </p>
              )}
            </div>

            <div className="border-t border-black/[.08] p-2 dark:border-white/[.1]">
              <textarea
                value={chat.input}
                onChange={(event) =>
                  setChat((open) => (open ? { ...open, input: event.target.value } : open))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendChat();
                  }
                }}
                placeholder="Ask for a change — e.g. make the opening quieter"
                rows={2}
                className={`${fieldInput} w-full resize-none`}
              />
              <button
                type="button"
                disabled={chat.busy || chat.input.trim() === ""}
                onClick={sendChat}
                className="mt-1 w-full rounded-md border border-black/[.12] px-2 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.06] disabled:opacity-50 dark:border-white/[.18] dark:text-zinc-200 dark:hover:bg-white/[.08]"
              >
                {chat.busy ? "Writing…" : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
