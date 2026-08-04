// Client-safe personalization constants (no db / server-only imports) so both
// the settings UI and the server helpers can share them.

export const TONES = [
  "default",
  "concise",
  "detailed",
  "friendly",
  "professional",
] as const
export type Tone = (typeof TONES)[number]

export type UserSettings = {
  nickname: string | null
  instructions: string | null
  tone: Tone
}

// How each tone reshapes an answer — shown in the UI and handed to the agent so
// the preset actually changes the writing, not just a label.
export const TONE_META: Record<
  Tone,
  { label: string; hint: string; directive: string }
> = {
  default: {
    label: "Default",
    hint: "Balanced — clear and direct.",
    directive: "",
  },
  concise: {
    label: "Concise",
    hint: "Short and to the point.",
    directive:
      "Keep answers short and to the point. Lead with the answer, cut preamble and filler, and prefer tight bullets over long prose.",
  },
  detailed: {
    label: "Detailed",
    hint: "Thorough, with context and caveats.",
    directive:
      "Be thorough: explain the reasoning, add relevant context, cover edge cases and caveats, and use sections when it helps.",
  },
  friendly: {
    label: "Friendly",
    hint: "Warm and conversational.",
    directive:
      "Use a warm, conversational tone — approachable and encouraging, plain language, while staying accurate.",
  },
  professional: {
    label: "Professional",
    hint: "Formal and precise.",
    directive:
      "Use a formal, professional register: precise wording, no slang or emoji, structured and business-appropriate.",
  },
}

export function normalizeTone(value: string | null | undefined): Tone {
  return (TONES as readonly string[]).includes(value ?? "")
    ? (value as Tone)
    : "default"
}
