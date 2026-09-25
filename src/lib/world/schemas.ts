import { z } from "zod";

export const HardRuleSchema = z.object({
  id: z.string(),
  category: z.enum(["physics", "magic", "social", "timeline", "geography"]),
  rule: z.string().min(1),
  violationConsequence: z.string().min(1),
});

export const SoftRuleSchema = z.object({
  id: z.string(),
  rule: z.string().min(1),
  conditions: z.array(z.string()).optional(),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  age: z.number().optional(),
  appearance: z.string(),
  traits: z.array(z.string()).min(1),
  motivation: z.string().min(1),
  fear: z.string().min(1),
  secret: z.string().optional(),
  speechStyle: z.string().min(1),
  arc: z.object({ from: z.string(), to: z.string() }).optional(),
});

export const RelationshipSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  type: z.enum([
    "love", "hate", "friend", "rival",
    "family", "mentor", "betrayal", "debt",
  ]),
  intensity: z.number().min(1).max(10),
  history: z.string(),
  currentState: z.string(),
});

export const NarrativeRulesSchema = z.object({
  pov: z.enum(["first", "third_limited", "third_omniscient"]),
  tense: z.enum(["past", "present"]),
  tone: z.string().min(1),
  pacing: z.enum(["slow", "medium", "fast"]),
  sceneLengthWords: z.object({ min: z.number(), max: z.number() }),
  dialogueRatio: z.number().min(0).max(1),
  showDontTell: z.boolean().default(true),
  forbiddenTropes: z.array(z.string()),
});

export const SceneTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  location: z.string(),
  time: z.string(),
  characterIds: z.array(z.string()),
  conflict: z.string(),
  turningPoint: z.string(),
  consequence: z.string(),
  status: z.enum(["planned", "drafted", "revised", "done"]),
  /** Set when the scene is a copy: the scene it was copied from. */
  parentId: z.string().optional(),
});

export const ContinuityEntrySchema = z.object({
  sceneId: z.string(),
  summary: z.string(),
  facts: z.array(z.string()),
  relationshipChanges: z.array(z.object({
    from: z.string(), to: z.string(),
    newState: z.string(), reason: z.string(),
  })),
  newElements: z.array(z.string()),
  timestamp: z.number(),
});

/** Grammar, punctuation, output-language and form rules the assistant must follow. */
export const LanguagePolicySchema = z.object({
  enabled: z.boolean().default(true),
  /** Name of the language the text is written in, e.g. "Polish". */
  language: z.string().default(""),
  /** Form of the text, e.g. "horror", "poetry", "essay". */
  genre: z.string().default(""),
  /** Narrower form inside the genre, e.g. "gothic", "sonnet". */
  subgenre: z.string().default(""),
  /** Free-form rules pasted by the writer: grammar, punctuation, spelling. */
  rules: z.string().default(""),
});

export const emptyLanguagePolicy: LanguagePolicy = {
  enabled: true,
  language: "",
  genre: "",
  subgenre: "",
  rules: "",
};

/**
 * A named language policy the writer has kept for reuse. Templates are owned by
 * the writer rather than by a project, so one kept here can be loaded into any
 * of their documents.
 */
export const LanguageTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  policy: LanguagePolicySchema,
});
export type LanguageTemplate = z.infer<typeof LanguageTemplateSchema>;

/**
 * One turn of the assistant conversation. It lives with the story bible so the
 * transcript survives a reload; `reasoningDetails` is echoed back to the
 * provider so its reasoning carries on across turns.
 */
export const AssistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  reasoningDetails: z.unknown().optional(),
});

export const AssistantStateSchema = z.object({
  messages: z.array(AssistantMessageSchema).default([]),
});

export const StoryBibleSchema = z.object({
  version: z.number().default(1),
  worldHardRules: z.array(HardRuleSchema),
  worldSoftRules: z.array(SoftRuleSchema),
  characters: z.array(CharacterSchema),
  relationships: z.array(RelationshipSchema),
  narrativeRules: NarrativeRulesSchema,
  // Defaulted so bibles saved before the language policy existed still parse.
  languagePolicy: LanguagePolicySchema.default(emptyLanguagePolicy),
  // Defaulted so bibles saved before the transcript was kept still parse.
  assistant: AssistantStateSchema.default({ messages: [] }),
  scenes: z.array(SceneTemplateSchema),
  continuityLog: z.array(ContinuityEntrySchema),
});

export type HardRule = z.infer<typeof HardRuleSchema>;
export type SoftRule = z.infer<typeof SoftRuleSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type NarrativeRules = z.infer<typeof NarrativeRulesSchema>;
export type LanguagePolicy = z.infer<typeof LanguagePolicySchema>;
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;
export type AssistantState = z.infer<typeof AssistantStateSchema>;
export type SceneTemplate = z.infer<typeof SceneTemplateSchema>;
export type ContinuityEntry = z.infer<typeof ContinuityEntrySchema>;
export type StoryBible = z.infer<typeof StoryBibleSchema>;

export const SceneOutputSchema = z.object({
  prose: z.string().min(1),
  factsEstablished: z.array(z.string()),
  relationshipChanges: z.array(z.object({
    from: z.string(), to: z.string(),
    newState: z.string(), reason: z.string(),
  })),
  newElementsIntroduced: z.array(z.string()),
});
export type SceneOutput = z.infer<typeof SceneOutputSchema>;

export const emptyBible: StoryBible = {
  version: 1,
  worldHardRules: [],
  worldSoftRules: [],
  characters: [],
  relationships: [],
  narrativeRules: {
    pov: "third_limited",
    tense: "past",
    tone: "neutral",
    pacing: "medium",
    sceneLengthWords: { min: 800, max: 1200 },
    dialogueRatio: 0.4,
    showDontTell: true,
    forbiddenTropes: ["deus_ex_machina"],
  },
  languagePolicy: emptyLanguagePolicy,
  assistant: { messages: [] },
  scenes: [],
  continuityLog: [],
};