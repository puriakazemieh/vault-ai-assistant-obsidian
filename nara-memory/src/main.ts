import { Editor, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { NaraClient } from "./nara-client";
import { MemoryStore } from "./memory-store";
import { NaraMemorySettingsTab } from "./settings";
import { DEFAULT_SETTINGS, type NaraMemorySettings } from "./types";
import { NaraMemoryView, showAnalysis, VIEW_TYPE_NARA_MEMORY } from "./view";

export default class NaraMemoryPlugin extends Plugin {
  settings: NaraMemorySettings = structuredClone(DEFAULT_SETTINGS);
  client = new NaraClient(() => this.settings);
  store = new MemoryStore(this);

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.store.load();
    this.registerView(VIEW_TYPE_NARA_MEMORY, (leaf) => new NaraMemoryView(leaf, this));
    this.addRibbonIcon("brain-circuit", "Open Nara Memory", () => { void this.activateMemoryView(); });
    this.addCommand({ id: "open-memory", name: "Open memory search", callback: () => { void this.activateMemoryView(); } });
    this.addCommand({ id: "rebuild-memory", name: "Rebuild vault memory index", callback: () => { void this.rebuildIndex(); } });
    this.addCommand({ id: "index-current-file", name: "Index current file", callback: () => { void this.indexActiveFile(); } });
    this.addCommand({ id: "analyze-current-file", name: "Analyze current file with vault memory", callback: () => { void this.analyzeActiveFile(); } });
    this.addCommand({ id: "chat-with-selected-text", name: "Ask Nara about selected text", editorCallback: (editor: Editor) => { void this.chatWithSelectedText(editor.getSelection()); } });
    this.addCommand({ id: "forget-current-file", name: "Forget current file from memory", callback: () => { this.forgetActiveFile(); } });
    this.addSettingTab(new NaraMemorySettingsTab(this.app, this));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (this.settings.autoIndex && file instanceof TFile) void this.indexFileQuietly(file); }));
    this.registerEvent(this.app.vault.on("create", (file) => { if (this.settings.autoIndex && file instanceof TFile) void this.indexFileQuietly(file); }));
    this.registerEvent(this.app.vault.on("delete", (file) => { this.store.removeFile(file.path); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { this.store.removeFile(oldPath); if (this.settings.autoIndex && file instanceof TFile) void this.indexFileQuietly(file); }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      if (!editor.getSelection().trim()) return;
      menu.addItem((item) => item.setTitle("Ask Nara about selected text").setIcon("brain-circuit").onClick(() => { void this.chatWithSelectedText(editor.getSelection()); }));
    }));
  }

  async onunload(): Promise<void> { await this.store.persistNow(); }

  async loadSettings(): Promise<void> {
    const data = await this.loadData() as { settings?: Partial<NaraMemorySettings> } | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
    if (!this.settings.apiBaseUrl) this.settings.apiBaseUrl = "https://router.bynara.id/v1";
  }

  async saveSettings(): Promise<void> { await this.savePluginData(); }
  async savePluginData(): Promise<void> { await this.saveData({ settings: this.settings, database: this.store.exportDatabase() }); }

  async activateMemoryView(): Promise<NaraMemoryView> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_NARA_MEMORY)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error("Could not open a workspace leaf.");
    const view = await this.openMemoryView(leaf);
    this.app.workspace.revealLeaf(leaf);
    return view;
  }

  async openMemoryView(leaf: WorkspaceLeaf): Promise<NaraMemoryView> {
    await leaf.setViewState({ type: VIEW_TYPE_NARA_MEMORY, active: true });
    return leaf.view as NaraMemoryView;
  }

  async rebuildIndex(): Promise<void> {
    new Notice("Nara Memory: بازسازی ایندکس شروع شد…");
    try {
      const result = await this.store.rebuild((done, total) => { if (done === total || done % 10 === 0) new Notice(`Nara Memory: ${done}/${total}`); });
      new Notice(`حافظه آماده است: ${result.files} فایل و ${result.chunks} قطعه.`);
      this.refreshViews();
    } catch (error) { new Notice(`ایندکس ناموفق بود: ${message(error)}`); }
  }

  async indexActiveFile(): Promise<void> { const file = this.app.workspace.getActiveFile(); if (file) await this.indexFileWithNotice(file); }
  async analyzeActiveFile(): Promise<void> { try { await showAnalysis(this); } catch (error) { new Notice(`تحلیل ناموفق بود: ${message(error)}`); } }
  async chatWithSelectedText(text: string): Promise<void> {
    if (!text.trim()) { new Notice("ابتدا بخشی از متن را انتخاب کنید."); return; }
    const view = await this.activateMemoryView();
    view.setSelectedTextContext(text);
  }
  forgetActiveFile(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice("فایل فعالی وجود ندارد."); return; }
    this.store.removeFile(file.path);
    new Notice(`${file.name} از حافظه حذف شد.`);
    this.refreshViews();
  }

  private async indexFileWithNotice(file: TFile): Promise<void> { try { await this.store.indexFile(file); new Notice(`${file.name} ایندکس شد.`); this.refreshViews(); } catch (error) { new Notice(`ایندکس ناموفق بود: ${message(error)}`); } }
  private async indexFileQuietly(file: TFile): Promise<void> { try { await this.store.indexFile(file); this.refreshViews(); } catch (error) { console.warn("Nara Memory auto-index failed", file.path, error); } }
  private refreshViews(): void { this.app.workspace.getLeavesOfType(VIEW_TYPE_NARA_MEMORY).forEach((leaf) => (leaf.view as NaraMemoryView).render()); }
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
