import { TFile, normalizePath } from "obsidian";
import type NaraMemoryPlugin from "./main";
import type { ChatMessage, ChatSession, MemoryChunk, MemoryDatabase, SearchResult } from "./types";

const EMPTY_DB: MemoryDatabase = { version: 4, chunks: {}, sessions: {}, activeSessionId: null };

export class MemoryStore {
  private database: MemoryDatabase = structuredClone(EMPTY_DB);
  private saveTimer: number | null = null;

  constructor(private readonly plugin: NaraMemoryPlugin) {}

  async load(): Promise<void> {
    const data = await this.plugin.loadData() as { settings?: unknown; database?: any } | null;
    let db = data?.database;
    if (!db) {
      this.database = structuredClone(EMPTY_DB);
      return;
    }

    if (db.version === 4) {
      this.database = db;
      return;
    }

    // Migration from older versions
    this.database = structuredClone(EMPTY_DB);
    this.database.chunks = db.chunks || {};
    
    const legacyMessages = db.chatMessages || [];
    if (legacyMessages.length > 0) {
      const sessionId = Date.now().toString();
      const title = legacyMessages[0].content.split("\n")[0].slice(0, 40) + "...";
      this.database.sessions[sessionId] = {
        id: sessionId,
        title,
        updatedAt: legacyMessages[legacyMessages.length - 1].createdAt || Date.now(),
        messages: legacyMessages
      };
      this.database.activeSessionId = sessionId;
    }
    
    this.queuePersist();
  }

  async persistNow(): Promise<void> {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.plugin.savePluginData();
  }

  queuePersist(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { void this.persistNow(); }, 800);
  }

  exportDatabase(): MemoryDatabase { return this.database; }

  reset(): void {
    this.database = { ...structuredClone(EMPTY_DB), sessions: this.database.sessions, activeSessionId: this.database.activeSessionId };
  }

  isIncluded(file: TFile): boolean {
    if (file.extension !== "md") return false;
    const excluded = this.plugin.settings.excludedFolders.split(",").map((value) => normalizePath(value.trim())).filter(Boolean);
    return !excluded.some((folder) => file.path === folder || file.path.startsWith(`${folder}/`));
  }

  async indexFile(file: TFile): Promise<number> {
    if (!this.isIncluded(file)) return 0;
    const content = await this.plugin.app.vault.read(file);
    const pieces = splitMarkdown(content, this.plugin.settings.chunkSize, this.plugin.settings.chunkOverlap);
    const existing = Object.values(this.database.chunks).filter((chunk) => chunk.filePath === file.path);
    const reusable = new Map(existing.map((chunk) => [chunk.hash, chunk]));
    const fresh = pieces.filter((piece) => !reusable.has(piece.hash));
    for (const chunk of existing) delete this.database.chunks[chunk.id];
    pieces.forEach((piece, index) => {
      const prior = reusable.get(piece.hash);
      const chunk: MemoryChunk = {
        id: `${file.path}#${index}:${piece.hash}`,
        filePath: file.path,
        heading: piece.heading,
        text: piece.text,
        hash: piece.hash,
        updatedAt: Date.now(),
        terms: prior?.terms ?? tokenize(`${file.basename} ${piece.heading} ${piece.text}`)
      };
      this.database.chunks[chunk.id] = chunk;
    });
    this.queuePersist();
    return fresh.length;
  }

  removeFile(path: string): void {
    for (const [id, chunk] of Object.entries(this.database.chunks)) if (chunk.filePath === path) delete this.database.chunks[id];
    this.queuePersist();
  }

  getIndexedFiles(): Array<{ path: string; chunks: number }> {
    const files = new Map<string, number>();
    for (const chunk of Object.values(this.database.chunks)) files.set(chunk.filePath, (files.get(chunk.filePath) ?? 0) + 1);
    return [...files.entries()].map(([path, chunks]) => ({ path, chunks })).sort((a, b) => a.path.localeCompare(b.path));
  }

  getChatMessages(): ChatMessage[] {
    if (!this.database.activeSessionId) return [];
    return [...(this.database.sessions[this.database.activeSessionId]?.messages || [])];
  }

  addChatMessage(message: ChatMessage): void {
    let session = this.database.activeSessionId ? this.database.sessions[this.database.activeSessionId] : null;
    if (!session) {
      const sessionId = Date.now().toString();
      session = {
        id: sessionId,
        title: message.content.split("\n")[0].slice(0, 40) + (message.content.length > 40 ? "..." : ""),
        updatedAt: Date.now(),
        messages: []
      };
      this.database.sessions[sessionId] = session;
      this.database.activeSessionId = sessionId;
    }
    
    session.messages.push(message);
    session.updatedAt = Date.now();
    if (session.messages.length > 100) session.messages = session.messages.slice(-100);
    this.queuePersist();
  }

  clearChat(): void { 
    this.database.activeSessionId = null;
    this.queuePersist(); 
  }
  
  getSessions(): ChatSession[] {
    return Object.values(this.database.sessions).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  
  switchSession(id: string): void {
    if (this.database.sessions[id]) {
      this.database.activeSessionId = id;
      this.queuePersist();
    }
  }
  
  deleteSession(id: string): void {
    delete this.database.sessions[id];
    if (this.database.activeSessionId === id) {
      this.database.activeSessionId = null;
    }
    this.queuePersist();
  }

  clearMemory(): void { this.database.chunks = {}; this.queuePersist(); }

  async rebuild(onProgress?: (done: number, total: number) => void): Promise<{ files: number; chunks: number }> {
    this.reset();
    const files = this.plugin.app.vault.getMarkdownFiles().filter((file) => this.isIncluded(file));
    let chunks = 0;
    for (let index = 0; index < files.length; index++) {
      chunks += await this.indexFile(files[index]);
      onProgress?.(index + 1, files.length);
    }
    await this.persistNow();
    return { files: files.length, chunks: Object.keys(this.database.chunks).length };
  }

  async search(query: string, limit = this.plugin.settings.resultCount): Promise<SearchResult[]> {
    if (!Object.keys(this.database.chunks).length) return [];
    const queryTerms = tokenize(query);
    if (!queryTerms.length) return [];
    const titleTerms = new Set(tokenize(query));
    return Object.values(this.database.chunks)
      .map((chunk) => ({ ...chunk, score: localScore(chunk, queryTerms, titleTerms) }))
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  stats(): { files: number; chunks: number } {
    const files = new Set(Object.values(this.database.chunks).map((chunk) => chunk.filePath));
    return { files: files.size, chunks: Object.keys(this.database.chunks).length };
  }
}

function splitMarkdown(text: string, chunkSize: number, overlap: number): Array<{ heading: string; text: string; hash: string }> {
  const cleaned = text.replace(/^---[\s\S]*?---\s*/m, "").trim();
  if (!cleaned) return [];
  const lines = cleaned.split(/\r?\n/);
  const sections: Array<{ heading: string; text: string }> = [];
  let heading = "";
  let buffer: string[] = [];
  const flush = () => { const value = buffer.join("\n").trim(); if (value) sections.push({ heading, text: value }); buffer = []; };
  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) { flush(); heading = match[2]; } else buffer.push(line);
  }
  flush();
  const chunks: Array<{ heading: string; text: string; hash: string }> = [];
  for (const section of sections) {
    for (let start = 0; start < section.text.length; start += Math.max(1, chunkSize - overlap)) {
      const value = section.text.slice(start, start + chunkSize).trim();
      if (!value) continue;
      chunks.push({ heading: section.heading, text: value, hash: stableHash(`${section.heading}\n${value}`) });
      if (start + chunkSize >= section.text.length) break;
    }
  }
  return chunks;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function tokenize(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((word) => word.length >= 2);
}

function localScore(chunk: MemoryChunk, queryTerms: string[], titleTerms: Set<string>): number {
  const terms = new Set(chunk.terms);
  const text = `${chunk.filePath} ${chunk.heading}`.toLocaleLowerCase();
  let matches = 0;
  let titleMatches = 0;
  for (const term of queryTerms) {
    if (terms.has(term)) matches++;
    if (titleTerms.has(term) && text.includes(term)) titleMatches++;
  }
  return (matches / queryTerms.length) + (titleMatches * 0.25);
}
