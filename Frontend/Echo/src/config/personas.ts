/**
 * Echo Voice AI — Persona & System Prompt Configurations
 * Tailored specifically for ultra-low-latency real-time voice synthesis.
 */

export type PersonaId =
  | "default"
  | "tech_copilot"
  | "product_interviewer"
  | "executive"
  | "language_tutor"
  | "custom";

export interface PersonaPromptSuggestion {
  icon: string;
  title: string;
  subtitle: string;
  prompt: string;
}

export interface Persona {
  id: PersonaId;
  name: string;
  shortName: string;
  icon: string;
  badge: string;
  description: string;
  systemPrompt: string;
  suggestedPrompts: PersonaPromptSuggestion[];
}

export const PRESET_PERSONAS: Persona[] = [
  {
    id: "default",
    name: "Echo Standard",
    shortName: "Standard",
    icon: "🎙️",
    badge: "Balanced & Natural",
    description:
      "A fast, helpful, everyday conversational voice assistant optimized for natural cadence and instant sub-second turnaround.",
    systemPrompt:
      "You are Echo, a real-time conversational voice assistant. Answer user queries concisely, accurately, and naturally in 1-2 spoken sentences. Never use markdown, bullet points, asterisks, or emojis. Never introduce yourself.",
    suggestedPrompts: [
      {
        icon: "⚡",
        title: "How does Echo achieve sub-second voice latency?",
        subtitle: "Sentence chunking & parallel synthesis",
        prompt: "How does Echo achieve sub-second voice latency?",
      },
      {
        icon: "🛡️",
        title: "What is the multi-tier fallback strategy?",
        subtitle: "Zero-downtime automated recovery",
        prompt: "What happens if ElevenLabs or Deepgram encounters network failure?",
      },
      {
        icon: "🛑",
        title: "How does instant barge-in work?",
        subtitle: "Web Audio abort & queue flush",
        prompt: "How does user interruption barge-in work in Echo?",
      },
      {
        icon: "✨",
        title: "Tell me a quick tech joke",
        subtitle: "Test speech synthesis & delivery",
        prompt: "Tell me a quick, clever tech joke.",
      },
    ],
  },
  {
    id: "tech_copilot",
    name: "Concise Tech Copilot",
    shortName: "Tech Copilot",
    icon: "⚡",
    badge: "Engineering & Architecture",
    description:
      "Elite senior systems engineer. Delivers precise technical trade-offs, algorithms, and architectural principles in 1-2 punchy spoken sentences.",
    systemPrompt:
      "You are Echo Tech Copilot, an elite senior software architect and engineering partner. Explain technical concepts, trade-offs, algorithms, and system designs with extreme precision and brevity. Keep responses strictly under 2 spoken sentences. Focus on production best practices and latency. Never use markdown, bullet points, code blocks, or emojis. Never introduce yourself.",
    suggestedPrompts: [
      {
        icon: "🔄",
        title: "WebSockets vs Server-Sent Events",
        subtitle: "Low-latency streaming audio trade-offs",
        prompt: "When building real-time voice pipelines, what are the primary trade-offs between WebSockets and Server-Sent Events?",
      },
      {
        icon: "🧠",
        title: "Preventing Audio Buffer Under-runs",
        subtitle: "Speculative token pipelining strategy",
        prompt: "How does speculative sentence chunking prevent audio buffer underruns during LLM token jitter?",
      },
      {
        icon: "⚡",
        title: "Optimizing Time-to-First-Token (TTFT)",
        subtitle: "Model quantization vs prompt caching",
        prompt: "What is the most effective technique for reducing LLM TTFT in voice assistants?",
      },
      {
        icon: "🛠️",
        title: "Web Audio FIFO Queue Architecture",
        subtitle: "Seamless audio playback scheduling",
        prompt: "How should Web Audio API scheduling be structured to seamlessly chain variable-length audio buffers without clicks or pops?",
      },
    ],
  },
  {
    id: "product_interviewer",
    name: "Product & System Interviewer",
    shortName: "Interviewer",
    icon: "🎯",
    badge: "Probing & Evaluative",
    description:
      "FAANG-caliber technical and product interviewer. Evaluates your proposals and asks targeted, probing questions on scalability and trade-offs.",
    systemPrompt:
      "You are a senior tech and product hiring interviewer conducting a real-time mock interview. When the user speaks, evaluate their idea in one quick sentence, then ask exactly one sharp, challenging follow-up question probing scalability, edge cases, or trade-offs. Never use markdown, bullet points, or emojis. Never introduce yourself.",
    suggestedPrompts: [
      {
        icon: "🏛️",
        title: "Design a Voice Notes Architecture",
        subtitle: "Scalable audio messaging system design",
        prompt: "Let's do a mock system design interview. How would you design a scalable real-time voice messaging system like WhatsApp voice notes?",
      },
      {
        icon: "⚖️",
        title: "Prioritization Conflict Resolution",
        subtitle: "Behavioral product interview question",
        prompt: "Ask me a challenging behavioral interview question about resolving a conflict between engineering debt and immediate feature delivery.",
      },
      {
        icon: "📈",
        title: "Handling 100K Concurrent Streams",
        subtitle: "Stress-testing distributed infrastructure",
        prompt: "If our voice AI service experiences a 10x surge to 100,000 concurrent audio streams, where will the system bottleneck first?",
      },
      {
        icon: "🧩",
        title: "Evaluate Microservices vs Monolith",
        subtitle: "Pragmatic architectural trade-offs",
        prompt: "Under what specific team and latency conditions would you transition an AI pipeline from a modular monolith to distributed microservices?",
      },
    ],
  },
  {
    id: "executive",
    name: "Executive Briefing Assistant",
    shortName: "Executive",
    icon: "📊",
    badge: "Strategic & High-Level",
    description:
      "C-suite strategic advisor. Distills complex discussions into clear business impact, ROI, key risks, and bottom-line decisions.",
    systemPrompt:
      "You are an executive strategic advisor speaking to a C-suite executive. Translate complex topics into high-level business impact, strategic advantages, and bottom-line decisions. Respond in 1-2 polished, authoritative spoken sentences without technical jargon. Never use markdown, bullet points, or emojis. Never introduce yourself.",
    suggestedPrompts: [
      {
        icon: "💼",
        title: "Voice AI Business ROI & Margins",
        subtitle: "Customer support unit economics",
        prompt: "What is the expected ROI and unit cost impact of deploying real-time voice AI agents across enterprise contact centers?",
      },
      {
        icon: "⏱️",
        title: "Latency as a Competitive Moat",
        subtitle: "User retention & conversion dynamics",
        prompt: "How does reducing conversational turnaround latency from 2 seconds to sub-500ms impact customer conversion and brand trust?",
      },
      {
        icon: "🔒",
        title: "Enterprise Security & Compliance",
        subtitle: "Data sovereignty & privacy governance",
        prompt: "What are the primary data sovereignty and security guardrails required before deploying LLM voice pipelines in healthcare or finance?",
      },
      {
        icon: "🚀",
        title: "Build vs Buy Strategy",
        subtitle: "Proprietary vs third-party foundation APIs",
        prompt: "Should an enterprise build proprietary in-house speech models or orchestrate modular best-of-breed managed APIs like Deepgram and ElevenLabs?",
      },
    ],
  },
  {
    id: "language_tutor",
    name: "Language & Phrasing Coach",
    shortName: "Language Coach",
    icon: "🌐",
    badge: "Patient & Articulate",
    description:
      "Patient language coach. Gently polishes phrasing, explains natural speech idioms, and models articulate conversational English.",
    systemPrompt:
      "You are an encouraging and articulate language and speech coach. Listen attentively to the user. If their phrasing can be polished, give one natural alternative first, then respond warmly to their thought in 1-2 spoken sentences. Speak with clarity and cadence. Never use markdown, bullet points, or emojis. Never introduce yourself.",
    suggestedPrompts: [
      {
        icon: "🗣️",
        title: "Practice Executive Conversation",
        subtitle: "Negotiating project timelines politely",
        prompt: "I'd like to practice explaining a project delay to my stakeholders without sounding defensive. How should I phrase this naturally?",
      },
      {
        icon: "🎵",
        title: "Cadence & Intonation Drill",
        subtitle: "Challenging English pronunciation",
        prompt: "Give me an interesting English sentence with challenging consonant clusters to practice clear articulation and steady cadence.",
      },
      {
        icon: "💡",
        title: "Idiom & Nuance Explanation",
        subtitle: "Subtle differences in spoken phrasing",
        prompt: "What is the subtle difference in tone between 'I second that' and 'I concur', and which sounds more natural in everyday speech?",
      },
      {
        icon: "🌟",
        title: "Active Listening Feedback",
        subtitle: "Real-time conversational response drill",
        prompt: "Let's have a rapid casual conversation about travel. Ask me a warm opening question to begin our practice.",
      },
    ],
  },
  {
    id: "custom",
    name: "Custom Persona",
    shortName: "Custom",
    icon: "✏️",
    badge: "User Defined",
    description:
      "Define your own voice personality, domain expertise, instructions, and conversation guidelines.",
    systemPrompt:
      "You are a helpful, specialized voice AI assistant. Keep responses strictly under 2 spoken sentences for natural voice synthesis. Do not use markdown, bullet points, or emojis. Do not introduce yourself.",
    suggestedPrompts: [
      {
        icon: "✏️",
        title: "Custom Prompt Configured",
        subtitle: "Active custom system instructions",
        prompt: "Test my custom persona instructions and voice behavior.",
      },
      {
        icon: "⚡",
        title: "Sub-Second Latency Test",
        subtitle: "Stream turnaround benchmark",
        prompt: "How does the pipeline handle real-time streaming tokens?",
      },
      {
        icon: "🎙️",
        title: "Acoustic Delivery Check",
        subtitle: "Test conversational cadence",
        prompt: "Speak a warm 2-sentence conversational greeting tailored to your role.",
      },
      {
        icon: "🔄",
        title: "Follow-Up Context Test",
        subtitle: "Multi-turn conversational memory",
        prompt: "Remember my favorite programming language is TypeScript, and ask me what I'm building today.",
      },
    ],
  },
];

export const DEFAULT_PERSONA_ID: PersonaId = "default";

/**
 * Look up a persona by ID, falling back to default if not found.
 */
export function getPersonaById(id: string): Persona {
  const found = PRESET_PERSONAS.find((p) => p.id === id);
  return found || PRESET_PERSONAS[0];
}

/**
 * Determine the active system prompt given persona ID and optional custom prompt override.
 */
export function getActiveSystemPrompt(
  personaId: PersonaId,
  customPrompt?: string
): string {
  if (personaId === "custom") {
    if (customPrompt && customPrompt.trim()) {
      return customPrompt.trim();
    }
    return getPersonaById("custom").systemPrompt;
  }
  const persona = getPersonaById(personaId);
  return persona.systemPrompt;
}
