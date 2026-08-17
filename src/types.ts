import type { Language } from "./i18n";

export interface VaultAiMemorySettings {
  language: Language;
  apiBaseUrl: string;
  apiKey: string;
  chatModel: string;
  chunkSize: number;
  chunkOverlap: number;
  resultCount: number;
  autoIndex: boolean;
  excludedFolders: string;
  systemPrompt: string;
}

export const DEFAULT_SETTINGS: VaultAiMemorySettings = {
  language: "fa",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  chatModel: "gpt-4o-mini",
  chunkSize: 1000,
  chunkOverlap: 180,
  resultCount: 8,
  autoIndex: true,
  excludedFolders: "Templates,Archive",
  systemPrompt: "You are AI Vault Memory, a precise Obsidian knowledge assistant. Reply in the user's language. Use only provided context when making claims about the vault. Cite vault material as [[path]]. State clearly when context is insufficient."
};

export interface MemoryChunk {
  id: string;
  filePath: string;
  heading: string;
  text: string;
  hash: string;
  updatedAt: number;
  terms: string[];
}

export interface SearchResult extends MemoryChunk {
  score: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface MemoryDatabase {
  version: 4;
  chunks: Record<string, MemoryChunk>;
  sessions: Record<string, ChatSession>;
  activeSessionId: string | null;
}

export interface VaultAiModel {
  id: string;
  name?: string;
}
