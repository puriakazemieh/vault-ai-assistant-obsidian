import { Editor, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { VaultAiClient } from "./vault-ai-client";
import { MemoryStore } from "./memory-store";
import { VaultAiMemorySettingsTab } from "./settings";
import { DEFAULT_SETTINGS, type VaultAiMemorySettings } from "./types";
import { VaultAiMemoryView, showAnalysis, VIEW_TYPE_VAULT_AI_MEMORY } from "./view";
import { t } from "./i18n";
import { startComparisonFlow } from "./compare-files";
import { InlineAiModal } from "./inline-ai-modal";

export default class VaultAiMemoryPlugin extends Plugin {
  settings: VaultAiMemorySettings = structuredClone(DEFAULT_SETTINGS);
  client = new VaultAiClient(() => this.settings);
  store = new MemoryStore(this);

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.store.load();
    this.registerView(VIEW_TYPE_VAULT_AI_MEMORY, (leaf) => new VaultAiMemoryView(leaf, this));
    
    // Commands and Ribbons using translation
    this.addRibbonIcon("brain-circuit", "Open AI Vault Memory", () => { void this.activateMemoryView(); });
    this.addCommand({ id: "open-memory", name: "Open memory search", callback: () => { void this.activateMemoryView(); } });
    this.addCommand({ id: "rebuild-memory", name: "Rebuild vault memory index", callback: () => { void this.rebuildIndex(); } });
    this.addCommand({ id: "index-current-file", name: "Index current file", callback: () => { void this.indexActiveFile(); } });
    
    this.addCommand({ 
      id: "analyze-current-file", 
      name: t("main.command.analyze", this.settings.language),
      callback: () => { void this.analyzeActiveFile(); } 
    });
    
    this.addCommand({ 
      id: "send-selection-to-chat", 
      name: t("main.command.sendSelection", this.settings.language),
      editorCallback: (editor: Editor) => { void this.chatWithSelectedText(editor.getSelection()); } 
    });

    this.addCommand({ 
      id: "ai-inline-prompt", 
      name: t("main.command.inlinePrompt", this.settings.language),
      editorCallback: (editor: Editor) => { 
        const selection = editor.getSelection();
        if (!selection.trim()) {
           new Notice(t("main.command.sendSelection.error", this.settings.language));
           return;
        }
        new InlineAiModal(this.app, this, editor, selection).open(); 
      } 
    });
    
    this.addCommand({
      id: "compare-two-files",
      name: t("compare.command", this.settings.language),
      callback: () => { startComparisonFlow(this); }
    });
    
    this.addCommand({ id: "forget-current-file", name: "Forget current file from memory", callback: () => { this.forgetActiveFile(); } });
    
    this.addSettingTab(new VaultAiMemorySettingsTab(this.app, this));
    
    this.registerEvent(this.app.vault.on("modify", (file) => { if (this.settings.autoIndex && file instanceof TFile) void this.indexFileQuietly(file); }));
    this.registerEvent(this.app.vault.on("create", (file) => { if (this.settings.autoIndex && file instanceof TFile) void this.indexFileQuietly(file); }));
    this.registerEvent(this.app.vault.on("delete", (file) => { this.store.removeFile(file.path); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { this.store.removeFile(oldPath); if (this.settings.autoIndex && file instanceof TFile) void this.indexFileQuietly(file); }));
    
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      const selection = editor.getSelection();
      if (!selection.trim()) return;
      
      menu.addItem((item) => item.setTitle(t("main.command.inlinePrompt", this.settings.language)).setIcon("wand-2").onClick(() => {
        new InlineAiModal(this.app, this, editor, selection).open();
      }));
      
      menu.addItem((item) => item.setTitle(t("main.command.sendSelection", this.settings.language)).setIcon("brain-circuit").onClick(() => { void this.chatWithSelectedText(selection); }));
    }));
  }

  onunload(): void { void this.store.persistNow(); }

  async loadSettings(): Promise<void> {
    const data = await this.loadData() as { settings?: Partial<VaultAiMemorySettings> } | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
    if (!this.settings.apiBaseUrl) this.settings.apiBaseUrl = "https://api.openai.com/v1";
    if (!this.settings.language) this.settings.language = "fa";
  }

  async saveSettings(): Promise<void> { await this.savePluginData(); }
  async savePluginData(): Promise<void> { await this.saveData({ settings: this.settings, database: this.store.exportDatabase() }); }

  async activateMemoryView(): Promise<VaultAiMemoryView> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_AI_MEMORY)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) throw new Error("Could not open a workspace leaf.");
    const view = await this.openMemoryView(leaf);
    void this.app.workspace.revealLeaf(leaf);
    return view;
  }

  async openMemoryView(leaf: WorkspaceLeaf): Promise<VaultAiMemoryView> {
    await leaf.setViewState({ type: VIEW_TYPE_VAULT_AI_MEMORY, active: true });
    if (!(leaf.view instanceof VaultAiMemoryView)) throw new Error("Could not open AI Vault Memory view.");
    return leaf.view;
  }

  async rebuildIndex(): Promise<void> {
    const lang = this.settings.language;
    new Notice(t("main.rebuild.start", lang));
    try {
      const result = await this.store.rebuild((done, total) => { if (done === total || done % 10 === 0) new Notice(`AI Vault Memory: ${done}/${total}`); });
      new Notice(lang === "en" ? `Memory ready: ${result.files} files and ${result.chunks} chunks.` : `حافظه آماده است: ${result.files} فایل و ${result.chunks} قطعه.`);
      this.refreshViews();
    } catch (error) { new Notice(lang === "en" ? `Index failed: ${message(error)}` : `ایندکس ناموفق بود: ${message(error)}`); }
  }

  async indexActiveFile(): Promise<void> { const file = this.app.workspace.getActiveFile(); if (file) await this.indexFileWithNotice(file); }
  
  async analyzeActiveFile(): Promise<void> { 
    try { 
      await showAnalysis(this); 
    } catch (error) { 
      new Notice(this.settings.language === "en" ? `Analysis failed: ${message(error)}` : `تحلیل ناموفق بود: ${message(error)}`); 
    } 
  }
  
  async chatWithSelectedText(text: string): Promise<void> {
    if (!text.trim()) { new Notice(t("main.command.sendSelection.error", this.settings.language)); return; }
    const view = await this.activateMemoryView();
    view.setSelectedTextContext(text);
  }
  
  forgetActiveFile(): void {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice(t("main.command.analyze.error", this.settings.language)); return; }
    this.store.removeFile(file.path);
    new Notice(this.settings.language === "en" ? `${file.name} forgotten.` : `${file.name} از حافظه حذف شد.`);
    this.refreshViews();
  }

  private async indexFileWithNotice(file: TFile): Promise<void> { 
    try { 
      await this.store.indexFile(file); 
      new Notice(this.settings.language === "en" ? `${file.name} indexed.` : `${file.name} ایندکس شد.`); 
      this.refreshViews(); 
    } catch (error) { 
      new Notice(this.settings.language === "en" ? `Index failed: ${message(error)}` : `ایندکس ناموفق بود: ${message(error)}`); 
    } 
  }
  
  private async indexFileQuietly(file: TFile): Promise<void> { try { await this.store.indexFile(file); this.refreshViews(); } catch (error) { console.warn("AI Vault Memory auto-index failed", file.path, error); } }
  private refreshViews(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_AI_MEMORY).forEach((leaf) => {
      if (leaf.view instanceof VaultAiMemoryView) leaf.view.reRender();
    });
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
