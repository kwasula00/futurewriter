import dagre from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { z } from "zod";

import type { Character, Relationship, SceneTemplate, StoryBible } from "./schemas";

/**
 * The four kinds of thing the diagram draws — one per type the World and Scene
 * panels define. A node carries its kind so the canvas can colour it the way
 * the panel it came from does, and so both surfaces keep naming it the same.
 */
export type StoryNodeKind = "character" | "scene" | "hardRule" | "softRule";

/**
 * What a drawn node shows. Flat, because React Flow passes it straight through
 * — apart from the character a node can stand for, which is carried whole so a
 * linked card holds the writer's data and not only the words the card draws.
 */
export type StoryNodeData = {
  kind: StoryNodeKind;
  title: string;
  subtitle: string;
  badge: string;
  lines: string[];
  /** Set when the card stands for a character in World → Characters. */
  characterId?: string;
  /** The character card the node is linked to, read while the node is drawn. */
  character?: Character;
  /** Set when the card stands for a scene in World → Scenes. */
  sceneId?: string;
  /** The scene card the node is linked to, read while the node is drawn. */
  scene?: SceneTemplate;
};

/** What an interaction link carries besides its ends: which interaction it is. */
export type StoryEdgeData = { interactionId?: string };

export type StoryFlowNode = Node<StoryNodeData, StoryNodeKind>;
export type StoryFlowEdge = Edge<StoryEdgeData>;

/**
 * A diagram as it is kept in the database. Only what the writer made is stored —
 * where each card sits and what it says, and which cards are joined — so a
 * stored diagram reopens exactly as it was left, with nothing derived.
 */
export const StoryNodeKindSchema = z.enum(["character", "scene", "hardRule", "softRule"]);

export const StoredDiagramNodeSchema = z.object({
  id: z.string(),
  kind: StoryNodeKindSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    title: z.string().default(""),
    subtitle: z.string().default(""),
    badge: z.string().default(""),
    lines: z.array(z.string()).default([]),
    // Set when the card stands for a character in World → Characters. The id is
    // kept so the same character can be put down again and again — each card its
    // own, every one of them showing that character.
    characterId: z.string().optional(),
    // Set when the card stands for a scene in World → Scenes, on the same terms:
    // the id is kept, the words are read from the scene.
    sceneId: z.string().optional(),
  }),
});

/**
 * How an interaction sits with the people in it: friendly, neutral or hostile.
 * The category is also the link's colour, so the three words are the whole
 * palette of a map.
 */
export const InteractionCategorySchema = z.enum(["friendly", "neutral", "hostile"]);
export type InteractionCategory = z.infer<typeof InteractionCategorySchema>;

/**
 * One kind of interaction between two characters — a word the writer can draw a
 * link with: a conversation, a fight, a shared meal. The library holds the
 * common ones and the writer adds their own to it.
 */
export const InteractionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: InteractionCategorySchema,
  description: z.string().default(""),
});
export type Interaction = z.infer<typeof InteractionSchema>;

/**
 * The interactions a fresh library opens with: the common human ones, sorted by
 * category. The writer edits, deletes and adds to these as their story needs.
 */
const DEFAULT_INTERACTION_SEEDS: {
  id: string;
  name: string;
  category: InteractionCategory;
  description: string;
}[] = [
  // Friendly — green.
  { id: "interaction:walk", name: "Spacer", category: "friendly", description: "Wspólne przejście, rozmowa w ruchu." },
  { id: "interaction:meal", name: "Wspólny posiłek", category: "friendly", description: "Jedzenie przy jednym stole." },
  { id: "interaction:support", name: "Wspieranie", category: "friendly", description: "Pomoc i trwanie przy kimś." },
  { id: "interaction:reassurance", name: "Dawanie otuchy", category: "friendly", description: "Pocieszanie w strapieniu." },
  { id: "interaction:care", name: "Troska o chorego", category: "friendly", description: "Opieka nad słabym lub rannym." },
  { id: "interaction:friendship", name: "Przyjaźń", category: "friendly", description: "Bliskość i zaufanie." },
  { id: "interaction:gift", name: "Prezent", category: "friendly", description: "Dar z rąk do rąk." },
  { id: "interaction:ridicule", name: "Żart", category: "friendly", description: "Wspólny śmiech." },
  // Neutral — blue.
  { id: "interaction:conversation", name: "Rozmowa", category: "neutral", description: "Zwykła wymiana słów." },
  { id: "interaction:work", name: "Wspólna praca", category: "neutral", description: "Zadanie wykonywane razem." },
  { id: "interaction:journey", name: "Wspólna podróż", category: "neutral", description: "Droga przebyta razem." },
  { id: "interaction:negotiation", name: "Negocjacje", category: "neutral", description: "Ustalanie warunków." },
  { id: "interaction:trade", name: "Handel", category: "neutral", description: "Wymiana dóbr." },
  { id: "interaction:training", name: "Trening", category: "neutral", description: "Nauka i ćwiczenie." },
  { id: "interaction:information", name: "Wymiana informacji", category: "neutral", description: "Przekazanie wieści." },
  // Hostile — red.
  { id: "interaction:fight", name: "Walka", category: "hostile", description: "Bezpośrednie starcie." },
  { id: "interaction:war", name: "Wojna", category: "hostile", description: "Otwarty konflikt na wielką skalę." },
  { id: "interaction:quarrel", name: "Kłótnia", category: "hostile", description: "Spór i podniesione głosy." },
  { id: "interaction:threat", name: "Groźba", category: "hostile", description: "Zapowiedź krzywdy." },
  { id: "interaction:betrayal", name: "Zdrada", category: "hostile", description: "Złamanie zaufania." },
  { id: "interaction:duel", name: "Pojedynek", category: "hostile", description: "Starcie na warunkach." },
  { id: "interaction:deceit", name: "Oszustwo", category: "hostile", description: "Wprowadzenie w błąd." },
];

/** A fresh copy of the common interactions, so callers never share one array. */
export function defaultInteractions(): Interaction[] {
  return DEFAULT_INTERACTION_SEEDS.map((seed) => ({ ...seed }));
}

export const StoredDiagramEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  // Which port each end was joined to. A scene offers several around its rim,
  // so a character keeps the one it was taken in by; absent on a link drawn to
  // a single-port card, which has nothing to tell apart.
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  // Which interaction of the library this link is. Absent on a link drawn
  // before interactions existed, and on one drawn with none chosen.
  interactionId: z.string().optional(),
});

export const StoryDiagramDataSchema = z.object({
  version: z.number().default(1),
  nodes: z.array(StoredDiagramNodeSchema).default([]),
  edges: z.array(StoredDiagramEdgeSchema).default([]),
  // The interaction library of this diagram, carried with it so the map holds
  // its own set of interactions. Defaulted, so a diagram saved before the
  // library existed opens with the common interactions ready to use.
  interactions: z.array(InteractionSchema).default(() => defaultInteractions()),
});

export type StoredDiagramNode = z.infer<typeof StoredDiagramNodeSchema>;
export type StoredDiagramEdge = z.infer<typeof StoredDiagramEdgeSchema>;
export type StoryDiagramData = z.infer<typeof StoryDiagramDataSchema>;

/** A diagram with nothing on it — the canvas a project starts from. */
export const emptyDiagram: StoryDiagramData = {
  version: 1,
  nodes: [],
  edges: [],
  interactions: defaultInteractions(),
};

/** Every connection the writer draws is inked the same way: a plain arrow. */
const USER_EDGE_COLOR = "#71717a";

/**
 * How a connection is drawn when it stands for no interaction: a plain grey
 * arrow. A link that does name an interaction is drawn from that interaction's
 * category instead — see `interactionEdgeStyle`.
 */
export const USER_EDGE_STYLE = {
  type: "smoothstep",
  style: { stroke: USER_EDGE_COLOR, strokeWidth: 1.5 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: USER_EDGE_COLOR,
    width: 14,
    height: 14,
  },
} as const;

/**
 * The colour each interaction category is inked: green for friendly, blue for
 * neutral, red for hostile. The three are the whole vocabulary, so a map is
 * read at a glance — warm ties, cold ties, and blows.
 */
export const INTERACTION_COLOR: Record<InteractionCategory, string> = {
  friendly: "#22c55e",
  neutral: "#3b82f6",
  hostile: "#ef4444",
};

/** What each category is called on screen. */
export const INTERACTION_CATEGORY_LABEL: Record<InteractionCategory, string> = {
  friendly: "Friendly",
  neutral: "Neutral",
  hostile: "Hostile",
};

/**
 * How a link is drawn: the ink of the interaction's category, and the
 * interaction's name written along it. A link with no interaction falls back to
 * the plain grey arrow.
 */
export function interactionEdgeStyle(interaction?: Interaction): Partial<StoryFlowEdge> {
  if (!interaction) return USER_EDGE_STYLE;
  const color = INTERACTION_COLOR[interaction.category];
  return {
    type: "smoothstep",
    label: interaction.name,
    labelStyle: { fontSize: 9, fill: color, fontWeight: 600 },
    labelBgStyle: { fill: "transparent" },
    style: { stroke: color, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
  };
}

/**
 * The green a membership link is drawn in — the colour of the scene it points
 * at, so a glance tells which scenes have taken whom in.
 */
export const SCENE_MEMBERSHIP_COLOR = "#10b981";

/**
 * How a link that ends at a scene is drawn: the scene's green, with the arrow
 * pointing at the scene. Such a link is not an interaction but a membership —
 * the character on its other end belongs to that scene — so it is inked apart
 * from the interaction colours, whatever interaction it may also name.
 */
export function sceneMembershipStyle(): Partial<StoryFlowEdge> {
  return {
    type: "smoothstep",
    style: { stroke: SCENE_MEMBERSHIP_COLOR, strokeWidth: 1.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: SCENE_MEMBERSHIP_COLOR,
      width: 14,
      height: 14,
    },
  };
}

/** A stored diagram turned into the cards and arrows the canvas draws. */
export function toFlowNodes(stored: StoredDiagramNode[]): StoryFlowNode[] {
  return stored.map((node) => ({
    id: node.id,
    type: node.kind,
    position: node.position,
    data: { kind: node.kind, ...node.data },
  }));
}

/**
 * A stored link turned into the arrow the canvas draws. The ink is left off
 * here: it is worked out afresh while the map is drawn (`interactionEdgeStyle`),
 * so editing an interaction in the library — renaming it, changing its
 * category — repaints every link that names it.
 */
export function toFlowEdges(stored: StoredDiagramEdge[]): StoryFlowEdge[] {
  return stored.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    data: { interactionId: edge.interactionId },
  }));
}

/** What the canvas holds, narrowed to what is worth keeping. */
export function toStoredNodes(nodes: StoryFlowNode[]): StoredDiagramNode[] {
  return nodes.map((node) => ({
    id: node.id,
    kind: node.data.kind,
    position: { x: node.position.x, y: node.position.y },
    data: {
      title: node.data.title,
      subtitle: node.data.subtitle,
      badge: node.data.badge,
      lines: node.data.lines,
      characterId: node.data.characterId,
      sceneId: node.data.sceneId,
    },
  }));
}

export function toStoredEdges(edges: StoryFlowEdge[]): StoredDiagramEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    interactionId: edge.data?.interactionId,
  }));
}

/** Every card is the same width, so the columns of the layout line up. */
const NODE_WIDTH = 216;

/**
 * The circle a scene is drawn as. A scene is smaller than a card, so the map
 * reads as the things the characters gather around rather than as one more
 * rectangle — the layout is told its size apart from a card's.
 */
export const SCENE_NODE_SIZE = 96;

/**
 * The ports a scene offers around its rim. A scene is where a cast gathers, so
 * it is joined at more than one place — each character taken in has a port of
 * its own rather than every link crowding the single spot a card has. The
 * count is shared by the canvas, which draws them, and the layout, which hands
 * each member a different one.
 */
export const SCENE_PORT_COUNT = 8;

/** The port a scene offers, by its place around the rim. */
export function scenePortId(index: number): string {
  return `scene-in-${index}`;
}

/**
 * The green port a character leaves from when it is taken into a scene. It is
 * the card's only way into a scene, kept apart from the port its other links —
 * the ties it has to other cards — leave by. A link that ends at a scene is
 * begun here and nowhere else.
 */
export const SCENE_OUT_PORT_ID = "scene-out";

/**
 * The green ports a scene leaves from when it leads on to another scene. There
 * are two, so a scene can be drawn to one or two scenes of its own.
 */
export const SCENE_OUT_PORT_COUNT = 2;

/** A scene's outgoing port, by its place around the rim. */
export function sceneOutPortId(index: number): string {
  return `scene-out-${index}`;
}

/**
 * The port that lies over a scene's outgoing port and takes a link in there.
 * React Flow will not let one port be both left from and arrived at, so each
 * green port is drawn twice: the green one is left from, this one is arrived
 * at. A scene can therefore be led on to at the very spot it leads on from.
 */
export function sceneOutTargetPortId(index: number): string {
  return `scene-out-in-${index}`;
}

/**
 * Whether a source port is one that leads into a scene — the green port a
 * character is taken in by, or one of the green ports a scene leads on by. Such
 * a port is joined to a scene and to nothing else.
 */
export function isSceneBoundPort(handleId: string | null | undefined): boolean {
  return handleId === SCENE_OUT_PORT_ID || (handleId?.startsWith("scene-out-") ?? false);
}

/** Detail rows a card shows before it is cut off — the panel holds the rest. */
const MAX_DETAIL_LINES = 3;

/** The ink each relationship type is drawn in, one per type the World panel offers. */
const RELATIONSHIP_COLOR: Record<Relationship["type"], string> = {
  love: "#ec4899",
  hate: "#ef4444",
  friend: "#22c55e",
  rival: "#f97316",
  family: "#8b5cf6",
  mentor: "#06b6d4",
  betrayal: "#a16207",
  debt: "#64748b",
};

const CITES_LINK_COLOR = "#d97706";

/**
 * How tall a card will be drawn. The layout needs a number before anything is
 * rendered, so it is worked out from the same rows the card shows.
 */
function cardHeight(data: StoryNodeData): number {
  const rows = Math.min(data.lines.length, MAX_DETAIL_LINES);
  let height = 34;
  if (data.subtitle) height += 14;
  if (rows > 0) height += 10 + rows * 15;
  return height;
}

/**
 * How wide and tall a node will be drawn. A scene is a small circle and every
 * other kind a card, so the layout is given a box per kind rather than one size
 * for the whole map.
 */
function nodeBox(node: StoryFlowNode): { width: number; height: number } {
  if (node.data.kind === "scene") {
    return { width: SCENE_NODE_SIZE, height: SCENE_NODE_SIZE };
  }
  return { width: NODE_WIDTH, height: cardHeight(node.data) };
}

/** Rows of small print, keeping only the ones the writer actually filled in. */
function details(candidates: (string | false | undefined)[]): string[] {
  return candidates.filter((value): value is string => Boolean(value));
}

/**
 * The card a character is drawn as. The derived map and the cards the writer
 * places by hand both read their words from here, so a character looks the same
 * on either surface. The card itself is carried along, so a linked node holds
 * the writer's data rather than only the words drawn on it.
 */
export function characterCard(character: Character): StoryNodeData {
  const name = character.name.trim();
  const aliases = (character.aliases ?? []).filter((alias) => alias.trim() !== "");
  return {
    kind: "character",
    characterId: character.id,
    character,
    // A character is recognised by name or, when none is written, by its first
    // alias — the two things the World panel asks of a character.
    title: name || aliases[0] || "(unnamed)",
    subtitle: character.speechStyle,
    badge: "character",
    lines: details([
      aliases.length > 0 && `Aliases: ${aliases.join(", ")}`,
      character.traits.length > 0 && `Traits: ${character.traits.join(", ")}`,
      character.motivation && `Wants: ${character.motivation}`,
      character.fear && `Fears: ${character.fear}`,
      character.arc && `Arc: ${character.arc.from} → ${character.arc.to}`,
    ]),
  };
}

/**
 * Reads a linked card's character afresh, so a card put down in the diagram
 * follows the character card in World → Characters: retitle it there and every
 * copy on every diagram changes with it. A card whose character is gone keeps
 * the words it was saved with.
 */
export function resolveCharacter(data: StoryNodeData, characters: Character[]): StoryNodeData {
  if (!data.characterId) return data;
  const character = characters.find((candidate) => candidate.id === data.characterId);
  return character ? { ...data, ...characterCard(character) } : data;
}

/**
 * The card a scene is drawn as. The words are the same ones the derived map
 * writes, so a scene looks the same however it was put on the canvas, and the
 * scene itself is carried along.
 */
export function sceneCard(scene: SceneTemplate): StoryNodeData {
  return {
    kind: "scene",
    sceneId: scene.id,
    scene,
    title: scene.title || "(untitled scene)",
    subtitle: [scene.location, scene.time].filter(Boolean).join(" · "),
    // The kind of card, not the scene's status: a card on the map says what it
    // is — a scene, as a character card says a character.
    badge: "scene",
    lines: details([
      scene.goal && `Goal: ${scene.goal}`,
      scene.conflict && `Conflict: ${scene.conflict}`,
      scene.turningPoint && `Turn: ${scene.turningPoint}`,
      scene.consequence && `Result: ${scene.consequence}`,
    ]),
  };
}

/**
 * Reads a linked scene's words afresh, so a card put down for a scene follows
 * the scene in World → Scenes. A card whose scene is gone keeps what it was
 * saved with.
 */
export function resolveScene(data: StoryNodeData, scenes: SceneTemplate[]): StoryNodeData {
  if (!data.sceneId) return data;
  const scene = scenes.find((candidate) => candidate.id === data.sceneId);
  return scene ? { ...data, ...sceneCard(scene) } : data;
}

/**
 * The scenes of the story in the order the map puts them in. A scene is led on
 * from its green ports to the scene that follows it, so those links are read as
 * the order of the story: the scene nothing leads to opens it, then whatever
 * that scene leads on to, and so on. A scene no link reaches — one never put on
 * the map, or one whose link was taken away — keeps its place in World →
 * Scenes, so the list always holds every scene: the map orders what it can and
 * the panel carries the rest.
 */
export function orderSceneIds(
  flowNodes: StoryFlowNode[],
  flowEdges: StoryFlowEdge[],
  scenes: SceneTemplate[],
): string[] {
  const known = new Set(scenes.map((scene) => scene.id));
  // A scene can be put down more than once, so the cards are gathered back to
  // the one scene they all stand for.
  const sceneOfNode = new Map<string, string>();
  for (const node of flowNodes) {
    if (node.data.kind === "scene" && node.data.sceneId && known.has(node.data.sceneId)) {
      sceneOfNode.set(node.id, node.data.sceneId);
    }
  }

  // What follows what, read from the green links drawn between scenes.
  const next = new Map<string, string[]>();
  const reached = new Set<string>();
  for (const edge of flowEdges) {
    if (!isSceneBoundPort(edge.sourceHandle)) continue;
    const from = sceneOfNode.get(edge.source);
    const to = sceneOfNode.get(edge.target);
    if (!from || !to || from === to) continue;
    const list = next.get(from);
    if (list) {
      if (!list.includes(to)) list.push(to);
    } else {
      next.set(from, [to]);
    }
    reached.add(to);
  }

  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    for (const child of next.get(id) ?? []) visit(child);
  };

  for (const scene of scenes) if (!reached.has(scene.id)) visit(scene.id);
  for (const scene of scenes) visit(scene.id);

  return order;
}

/** The words a character can be recognised by inside a rule: name and aliases. */
function callNames(character: Character): string[] {
  return [character.name, ...(character.aliases ?? [])].filter((word) => word.trim() !== "");
}

/**
 * Whether a rule names a character. The bible has no field saying which rule
 * constrains whom, so the name written in the rule is the only link there is.
 * Words under three letters are ignored so a common short word cannot pull an
 * edge to the wrong character.
 */
function cites(text: string, character: Character): boolean {
  if (text.trim() === "") return false;
  return callNames(character).some((word) => {
    if (word.trim().length < 3) return false;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

/**
 * Turns the story bible into nodes and edges, then lays them out. Every node
 * comes from a type the World and Scene panels define, and the whole graph is
 * derived: edit a panel and the diagram follows, with nothing kept behind.
 */
export function buildStoryGraph(bible: StoryBible): {
  nodes: StoryFlowNode[];
  edges: StoryFlowEdge[];
} {
  const nodes: StoryFlowNode[] = [];
  const edges: StoryFlowEdge[] = [];

  const knownCharacters = new Set(bible.characters.map((character) => character.id));

  for (const character of bible.characters) {
    nodes.push({
      id: `character:${character.id}`,
      type: "character",
      position: { x: 0, y: 0 },
      data: characterCard(character),
    });
  }

  for (const scene of bible.scenes) {
    nodes.push({
      id: `scene:${scene.id}`,
      type: "scene",
      position: { x: 0, y: 0 },
      data: sceneCard(scene),
    });

    // A scene holds as many characters as the writer put in it, and a character
    // sits in as many scenes as they appear in, so these links cross freely.
    // Each is a membership link: the character belongs to the scene, so the
    // arrow runs from the character to the scene it was taken into, and each
    // member joins at a port of its own so a full cast does not pile onto one
    // spot of the rim.
    scene.characterIds.forEach((characterId, index) => {
      if (!knownCharacters.has(characterId)) return;
      edges.push({
        id: `character:${characterId}->scene:${scene.id}`,
        source: `character:${characterId}`,
        target: `scene:${scene.id}`,
        targetHandle: scenePortId(index % SCENE_PORT_COUNT),
        ...sceneMembershipStyle(),
      });
    });
  }

  for (const rule of bible.worldHardRules) {
    nodes.push({
      id: `hardRule:${rule.id}`,
      type: "hardRule",
      position: { x: 0, y: 0 },
      data: {
        kind: "hardRule",
        title: rule.rule || "(empty rule)",
        subtitle: rule.violationConsequence ? `If broken: ${rule.violationConsequence}` : "",
        badge: rule.category,
        lines: [],
      },
    });
    linkCited(edges, `hardRule:${rule.id}`, `${rule.rule} ${rule.violationConsequence}`, bible, knownCharacters);
  }

  for (const rule of bible.worldSoftRules) {
    nodes.push({
      id: `softRule:${rule.id}`,
      type: "softRule",
      position: { x: 0, y: 0 },
      data: {
        kind: "softRule",
        title: rule.rule || "(empty rule)",
        subtitle: "",
        badge: "soft",
        lines: details([rule.conditions?.length ? `When: ${rule.conditions.join(", ")}` : undefined]),
      },
    });
    linkCited(edges, `softRule:${rule.id}`, `${rule.rule} ${(rule.conditions ?? []).join(" ")}`, bible, knownCharacters);
  }

  // Relationships run between characters, so they are the edges of the map
  // rather than nodes on it. Thickness is the intensity the World panel holds.
  bible.relationships.forEach((relationship, index) => {
    if (!knownCharacters.has(relationship.fromId) || !knownCharacters.has(relationship.toId)) return;
    const color = RELATIONSHIP_COLOR[relationship.type];
    edges.push({
      id: `relationship:${index}`,
      source: `character:${relationship.fromId}`,
      target: `character:${relationship.toId}`,
      type: "default",
      label: relationship.type,
      labelStyle: { fontSize: 9, fill: color, fontWeight: 600 },
      labelBgStyle: { fill: "transparent" },
      style: { stroke: color, strokeWidth: 1 + relationship.intensity / 3 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    });
  });

  return layout(nodes, edges);
}

/** Draws a rule's name-match links to the characters it talks about. */
function linkCited(
  edges: StoryFlowEdge[],
  source: string,
  text: string,
  bible: StoryBible,
  knownCharacters: Set<string>,
) {
  for (const character of bible.characters) {
    if (!knownCharacters.has(character.id) || !cites(text, character)) continue;
    edges.push({
      id: `${source}->${character.id}`,
      source,
      target: `character:${character.id}`,
      type: "smoothstep",
      label: "cites",
      labelStyle: { fontSize: 9, fill: CITES_LINK_COLOR, fontWeight: 600 },
      labelBgStyle: { fill: "transparent" },
      style: { stroke: CITES_LINK_COLOR, strokeWidth: 1, strokeDasharray: "2 3" },
      markerEnd: { type: MarkerType.ArrowClosed, color: CITES_LINK_COLOR, width: 12, height: 12 },
    });
  }
}

/**
 * Places the cards. A rule cites the characters it names and a character is
 * taken into the scene it belongs to, so the map reads left to right the way
 * the story is built: what must be obeyed → who it binds → where they gather.
 */
function layout(nodes: StoryFlowNode[], edges: StoryFlowEdge[]): {
  nodes: StoryFlowNode[];
  edges: StoryFlowEdge[];
} {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 96, marginx: 16, marginy: 16 });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const box = nodeBox(node);
    graph.setNode(node.id, { width: box.width, height: box.height });
  }
  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  return {
    nodes: nodes.map((node) => {
      const box = nodeBox(node);
      const center = graph.node(node.id);
      return {
        ...node,
        width: box.width,
        height: box.height,
        position: { x: center.x - box.width / 2, y: center.y - box.height / 2 },
      };
    }),
    edges,
  };
}
