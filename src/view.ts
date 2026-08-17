import { FuzzySuggestModal, ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, Menu } from "obsidian";
import type VaultAiMemoryPlugin from "./main";
import { t } from "./i18n";

export const VIEW_TYPE_VAULT_AI_MEMORY = "vault-ai-memory-view";

export class VaultAiMemoryView extends ItemView {
  private attachedPaths: string[] = [];
  private selectedText = "";
  private isThinking = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: VaultAiMemoryPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE_VAULT_AI_MEMORY; }
  getDisplayText(): string { return "AI Vault Memory"; }
  getIcon(): string { return "brain-circuit"; }
  async onOpen(): Promise<void> { this.render(); }

  setSelectedTextContext(text: string): void { this.selectedText = text.trim(); this.render(); }

  reRender(): void { this.render(); }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    const lang = this.plugin.settings.language;

    const header = root.createDiv({ cls: "vault-ai-memory-header" });
    const titleArea = header.createDiv();
    titleArea.style.display = "flex";
    titleArea.style.alignItems = "center";
    titleArea.style.gap = "8px";
    const icon = titleArea.createSpan();
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;
    titleArea.createSpan({ text: t("wiki.ingest", lang) });

    const headerRight = header.createDiv();
    headerRight.style.display = "flex";
    headerRight.style.gap = "4px";

    const historyBtn = headerRight.createEl("button", { cls: "vault-ai-header-action", title: t("history.title", lang) });
    historyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    historyBtn.addEventListener("click", (event) => {
      const menu = new Menu();
      const sessions = this.plugin.store.getSessions();
      if (sessions.length === 0) {
        menu.addItem(item => item.setTitle(t("history.empty", lang)).setDisabled(true));
      } else {
        sessions.forEach(session => {
          menu.addItem(item => {
            item.setTitle(session.title)
                .onClick(() => {
                  this.plugin.store.switchSession(session.id);
                  this.attachedPaths = []; this.selectedText = ""; this.render();
                });
          });
          menu.addItem(item => {
            item.setTitle(`${t("history.deletePrefix", lang)}${session.title}`)
                .setIcon("trash")
                .onClick(() => {
                  this.plugin.store.deleteSession(session.id);
                  this.render();
                });
          });
          menu.addSeparator();
        });
        menu.addSeparator();
        menu.addItem(item => {
          item.setTitle(t("history.deleteAll", lang)).setIcon("trash").onClick(() => {
             if (window.confirm(t("history.confirmDeleteAll", lang))) {
               sessions.forEach(s => this.plugin.store.deleteSession(s.id));
               this.render();
             }
          });
        });
      }
      menu.showAtMouseEvent(event);
    });

    const deleteChatBtn = headerRight.createEl("button", { cls: "vault-ai-header-action", title: t("chat.deleteCurrent", lang) });
    deleteChatBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
    deleteChatBtn.addEventListener("click", () => {
       const activeId = this.plugin.store.exportDatabase().activeSessionId;
       if (activeId) {
          this.plugin.store.deleteSession(activeId);
          this.attachedPaths = []; this.selectedText = ""; this.render();
       }
    });

    const newChatBtn = headerRight.createEl("button", { cls: "vault-ai-header-action", title: t("chat.new", lang) });
    newChatBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    newChatBtn.addEventListener("click", () => { this.plugin.store.clearChat(); this.attachedPaths = []; this.selectedText = ""; this.render(); });
    this.renderChat(root);
  }

  private renderChat(root: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const history = root.createDiv({ cls: "vault-ai-memory-chat-history" });
    const messages = this.plugin.store.getChatMessages();
    if (!messages.length) history.createEl("p", { text: t("chat.emptyPlaceholder", lang), cls: "vault-ai-memory-message" });
    messages.forEach((message, index) => {
      const bubble = history.createDiv({ cls: `vault-ai-memory-message vault-ai-memory-message--${message.role}` });
      const body = bubble.createDiv({ cls: "markdown-rendered" });
      body.style.userSelect = "text";
      body.style.webkitUserSelect = "text";
      void MarkdownRenderer.render(this.plugin.app, message.content, body, "", this.plugin);
      
      const actions = bubble.createDiv({ cls: "vault-ai-message-actions" });
      
      const copyBtn = actions.createEl("button", { cls: "vault-ai-message-action-btn", title: t("chat.copyTooltip", lang) });
      copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(message.content);
        new Notice(t("chat.copied", lang));
      });

      const delBtn = actions.createEl("button", { cls: "vault-ai-message-action-btn delete", title: t("chat.deleteTooltip", lang) });
      delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
      delBtn.addEventListener("click", () => {
        this.plugin.store.deleteMessage(index);
        this.render();
      });
    });
    
    // Selection and attachments (System Blocks)
    if (this.selectedText) {
      const selection = history.createDiv({ cls: "vault-ai-system-block" });
      const selHeader = selection.createDiv({ cls: "vault-ai-system-header" });
      selHeader.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> <span>${t("selection.added", lang)}</span>`;
      selection.createEl("p", { text: this.selectedText.slice(0, 100) + (this.selectedText.length > 100 ? "…" : "") });
      const remove = selection.createEl("button", { text: t("selection.remove", lang) });
      remove.addEventListener("click", () => { this.selectedText = ""; this.render(); });
    }
    if (this.attachedPaths.length) {
      const attachments = history.createDiv({ cls: "vault-ai-system-block" });
      const attHeader = attachments.createDiv({ cls: "vault-ai-system-header" });
      attHeader.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> <span>${this.attachedPaths.length} ${t("attachments.filesAttached", lang)}</span>`;
      for (const path of this.attachedPaths) {
        attachments.createEl("p", { text: path });
      }
      const clearAtt = attachments.createEl("button", { text: t("attachments.clear", lang) });
      clearAtt.addEventListener("click", () => { this.attachedPaths = []; this.render(); });
    }

    // Input Container
    const inputContainer = root.createDiv({ cls: "vault-ai-input-container" });
    const input = inputContainer.createEl("textarea", { placeholder: t("chat.placeholder", lang) });
    input.rows = 1;
    
    input.addEventListener("input", () => {
      input.style.height = 'auto';
      input.style.height = (input.scrollHeight) + 'px';
      if (input.scrollHeight > 150) input.style.overflowY = 'auto';
      else input.style.overflowY = 'hidden';
    });

    const toolbar = inputContainer.createDiv({ cls: "vault-ai-input-toolbar" });
    const leftTools = toolbar.createDiv();
    leftTools.style.display = "flex";
    leftTools.style.gap = "8px";
    const attachBtn = leftTools.createEl("button", { cls: "vault-ai-attach-button", title: t("attachments.attachTooltip", lang) });
    attachBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
    attachBtn.addEventListener("click", () => {
      new MarkdownFilePicker(this.plugin.app, (file) => {
        if (!this.attachedPaths.includes(file.path)) { this.attachedPaths.push(file.path); this.render(); }
      }).open();
    });

    const modelSelector = leftTools.createDiv({ cls: "vault-ai-model-selector", title: t("model.change", lang) });
    modelSelector.innerHTML = `<span>${this.plugin.settings.chatModel || 'Model'}</span>`;
    modelSelector.addEventListener("click", (event) => {
      const menu = new Menu();
      menu.addItem((item) => item.setTitle(t("model.loading", lang)));
      menu.showAtMouseEvent(event);
      this.plugin.client.listModels()
        .then((models) => {
          menu.hide();
          const newMenu = new Menu();
          models.forEach((model) => {
            newMenu.addItem((item) => item.setTitle(model.id).setChecked(model.id === this.plugin.settings.chatModel).onClick(async () => {
              this.plugin.settings.chatModel = model.id;
              await this.plugin.saveSettings();
              this.render();
            }));
          });
          newMenu.showAtMouseEvent(event);
        })
        .catch(() => { menu.hide(); new Notice(t("model.error", lang)); });
    });

    const rightTools = toolbar.createDiv();
    rightTools.style.display = "flex"; rightTools.style.gap = "8px"; rightTools.style.alignItems = "center";

    const send = rightTools.createEl("button", { cls: "vault-ai-send-button" });
    send.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`;

    const loadingIndicator = rightTools.createDiv({ cls: "vault-ai-loading" });
    loadingIndicator.innerHTML = `<div class="vault-ai-dot-flashing"></div>`;
    loadingIndicator.style.display = "none";

    if (this.isThinking) {
      send.style.display = "none";
      loadingIndicator.style.display = "flex";
      input.disabled = true;
    }

    const submit = async () => {
      const question = input.value.trim(); if (!question) return;
      const display = this.attachedPaths.length ? `${question}\n\nفایل‌های پیوست: ${this.attachedPaths.map((path) => `[[${path}]]`).join(", ")}` : question;
      this.plugin.store.addChatMessage({ role: "user", content: display, createdAt: Date.now() });
      
      this.isThinking = true;
      this.render();
      
      try {
        const answer = await this.ask(question);
        this.plugin.store.addChatMessage({ role: "assistant", content: answer, createdAt: Date.now() });
        this.attachedPaths = []; this.selectedText = "";
      } catch (error) { 
        new Notice(`گفتگو ناموفق بود: ${errorMessage(error)}`); 
      } finally {
        this.isThinking = false;
        this.render();
      }
    };
    send.addEventListener("click", () => { void submit(); });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } });
  }

  private async ask(question: string): Promise<string> {
    const attached = await Promise.all(this.attachedPaths.map(async (path) => {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? `ATTACHED FILE: ${file.path}\n${(await this.plugin.app.vault.read(file)).slice(0, 12000)}` : "";
    }));
    const retrieved = await this.plugin.store.search(question, this.plugin.settings.resultCount);
    const memory = retrieved.map((item) => `MEMORY [[${item.filePath}]]${item.heading ? ` — ${item.heading}` : ""}\n${item.text}`).join("\n\n");
    const history = this.plugin.store.getChatMessages().slice(-12).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
    return this.plugin.client.chat(
      this.plugin.settings.systemPrompt,
      `CONVERSATION:\n${history}\n\nQUESTION:\n${question}\n\nSELECTED TEXT:\n${this.selectedText.slice(0, 12000) || "None"}\n\n${attached.filter(Boolean).join("\n\n")}\n\nRETRIEVED LOCAL MEMORY:\n${memory || "None"}`
    );
  }

  // Removed renderManager and renderResults
}

class MarkdownFilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: import("obsidian").App, private readonly onPick: (file: TFile) => void) { super(app); this.setPlaceholder("یک فایل Markdown انتخاب کنید…"); }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.onPick(file); }
}

export async function showAnalysis(plugin: VaultAiMemoryPlugin): Promise<void> {
  const file = plugin.app.workspace.getActiveFile();
  if (!file || file.extension !== "md") { new Notice("یک فایل Markdown فعال کنید."); return; }
  const view = await plugin.activateMemoryView();
  view.setSelectedTextContext(await plugin.app.vault.read(file));
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
