import { App, FuzzySuggestModal, ItemView, MarkdownRenderer, Menu, Notice, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { ConfirmModal } from "./confirm-modal";
import { t } from "./i18n";
import type VaultAiMemoryPlugin from "./main";

export const VIEW_TYPE_VAULT_AI_MEMORY = "vault-ai-memory-view";

export class VaultAiMemoryView extends ItemView {
  private attachedPaths: string[] = [];
  private selectedText = "";
  private isThinking = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: VaultAiMemoryPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_VAULT_AI_MEMORY; }
  getDisplayText(): string { return "AI Vault Memory"; }
  getIcon(): string { return "brain-circuit"; }
  async onOpen(): Promise<void> { this.render(); }

  setSelectedTextContext(text: string): void {
    this.selectedText = text.trim();
    this.render();
  }

  reRender(): void { this.render(); }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("vault-ai-memory-view");
    const lang = this.plugin.settings.language;
    const header = root.createDiv({ cls: "vault-ai-header" });
    const titleArea = header.createDiv({ cls: "vault-ai-header-title" });
    const headerIcon = titleArea.createSpan({ cls: "vault-ai-header-icon" });
    setIcon(headerIcon, "brain-circuit");
    titleArea.createSpan({ text: t("wiki.ingest", lang) });

    const headerActions = header.createDiv({ cls: "vault-ai-header-actions" });
    const historyButton = this.createIconButton(headerActions, "history", t("history.title", lang));
    historyButton.addEventListener("click", (event) => this.showHistoryMenu(event));
    const deleteChatButton = this.createIconButton(headerActions, "trash", t("chat.deleteCurrent", lang));
    deleteChatButton.addEventListener("click", () => this.deleteCurrentChat());
    const newChatButton = this.createIconButton(headerActions, "plus", t("chat.new", lang));
    newChatButton.addEventListener("click", () => {
      this.plugin.store.clearChat();
      this.attachedPaths = [];
      this.selectedText = "";
      this.render();
    });
    this.renderChat(root);
  }

  private createIconButton(parent: HTMLElement, icon: string, title: string): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "vault-ai-header-action", title });
    setIcon(button, icon);
    return button;
  }

  private showHistoryMenu(event: MouseEvent): void {
    const lang = this.plugin.settings.language;
    const menu = new Menu();
    const sessions = this.plugin.store.getSessions();
    if (sessions.length === 0) {
      menu.addItem((item) => item.setTitle(t("history.empty", lang)).setDisabled(true));
    } else {
      sessions.forEach((session) => {
        menu.addItem((item) => item.setTitle(session.title).onClick(() => {
          this.plugin.store.switchSession(session.id);
          this.attachedPaths = [];
          this.selectedText = "";
          this.render();
        }));
        menu.addItem((item) => item.setTitle(`${t("history.deletePrefix", lang)}${session.title}`).setIcon("trash").onClick(() => {
          this.plugin.store.deleteSession(session.id);
          this.render();
        }));
        menu.addSeparator();
      });
      menu.addItem((item) => item.setTitle(t("history.deleteAll", lang)).setIcon("trash").onClick(() => this.confirmDeleteAllSessions()));
    }
    menu.showAtMouseEvent(event);
  }

  private confirmDeleteAllSessions(): void {
    const lang = this.plugin.settings.language;
    new ConfirmModal(this.app, t("history.confirmDeleteAll", lang), () => {
      this.plugin.store.getSessions().forEach((session) => this.plugin.store.deleteSession(session.id));
      this.render();
    }, t("history.deleteAll", lang)).open();
  }

  private deleteCurrentChat(): void {
    const activeId = this.plugin.store.exportDatabase().activeSessionId;
    if (!activeId) return;
    this.plugin.store.deleteSession(activeId);
    this.attachedPaths = [];
    this.selectedText = "";
    this.render();
  }

  private renderChat(root: HTMLElement): void {
    const lang = this.plugin.settings.language;
    const history = root.createDiv({ cls: "vault-ai-memory-chat-history" });
    const messages = this.plugin.store.getChatMessages();
    if (messages.length === 0) history.createEl("p", { text: t("chat.emptyPlaceholder", lang), cls: "vault-ai-memory-message" });

    messages.forEach((message, index) => {
      const bubble = history.createDiv({ cls: `vault-ai-memory-message vault-ai-memory-message--${message.role}` });
      const body = bubble.createDiv({ cls: "markdown-rendered" });
      void MarkdownRenderer.render(this.plugin.app, message.content, body, "", this)
        .catch((error: unknown) => console.error("Could not render chat message", error));
      const actions = bubble.createDiv({ cls: "vault-ai-message-actions" });
      const copyButton = actions.createEl("button", { cls: "vault-ai-message-action-btn", title: t("chat.copyTooltip", lang) });
      setIcon(copyButton, "copy");
      copyButton.addEventListener("click", () => { void this.copyMessage(message.content); });
      const deleteButton = actions.createEl("button", { cls: "vault-ai-message-action-btn delete", title: t("chat.deleteTooltip", lang) });
      setIcon(deleteButton, "trash");
      deleteButton.addEventListener("click", () => {
        this.plugin.store.deleteMessage(index);
        this.render();
      });
    });

    this.renderSelectedText(history, lang);
    this.renderAttachments(history, lang);
    this.renderComposer(root, lang);
  }

  private async copyMessage(content: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      new Notice(t("chat.copied", this.plugin.settings.language));
    } catch (error) {
      new Notice(`Could not copy text: ${errorMessage(error)}`);
    }
  }

  private renderSelectedText(history: HTMLElement, lang: "en" | "fa"): void {
    if (!this.selectedText) return;
    const selection = history.createDiv({ cls: "vault-ai-system-block" });
    const heading = selection.createDiv({ cls: "vault-ai-system-header" });
    const icon = heading.createSpan();
    setIcon(icon, "file-text");
    heading.createSpan({ text: t("selection.added", lang) });
    selection.createEl("p", { text: this.selectedText.slice(0, 100) + (this.selectedText.length > 100 ? "…" : "") });
    selection.createEl("button", { text: t("selection.remove", lang) }).addEventListener("click", () => {
      this.selectedText = "";
      this.render();
    });
  }

  private renderAttachments(history: HTMLElement, lang: "en" | "fa"): void {
    if (this.attachedPaths.length === 0) return;
    const attachments = history.createDiv({ cls: "vault-ai-system-block" });
    const heading = attachments.createDiv({ cls: "vault-ai-system-header" });
    const icon = heading.createSpan();
    setIcon(icon, "paperclip");
    heading.createSpan({ text: `${this.attachedPaths.length} ${t("attachments.filesAttached", lang)}` });
    this.attachedPaths.forEach((path) => attachments.createEl("p", { text: path }));
    attachments.createEl("button", { text: t("attachments.clear", lang) }).addEventListener("click", () => {
      this.attachedPaths = [];
      this.render();
    });
  }

  private renderComposer(root: HTMLElement, lang: "en" | "fa"): void {
    const inputContainer = root.createDiv({ cls: "vault-ai-input-container" });
    const input = inputContainer.createEl("textarea", { placeholder: t("chat.placeholder", lang) });
    input.rows = 1;
    input.addEventListener("input", () => this.resizeInput(input));
    const toolbar = inputContainer.createDiv({ cls: "vault-ai-input-toolbar" });
    const leftTools = toolbar.createDiv({ cls: "vault-ai-tool-group" });
    const attachButton = leftTools.createEl("button", { cls: "vault-ai-attach-button", title: t("attachments.attachTooltip", lang) });
    setIcon(attachButton, "paperclip");
    attachButton.addEventListener("click", () => {
      new MarkdownFilePicker(this.plugin.app, (file) => {
        if (this.attachedPaths.includes(file.path)) return;
        this.attachedPaths.push(file.path);
        this.render();
      }).open();
    });
    const modelSelector = leftTools.createDiv({ cls: "vault-ai-model-selector", title: t("model.change", lang) });
    modelSelector.createSpan({ text: this.plugin.settings.chatModel || "Model" });
    modelSelector.addEventListener("click", (event) => this.showModelMenu(event));

    const rightTools = toolbar.createDiv({ cls: "vault-ai-tool-group vault-ai-tool-group--right" });
    const send = rightTools.createEl("button", { cls: "vault-ai-send-button", title: "Send" });
    setIcon(send, "arrow-up");
    const loadingIndicator = rightTools.createDiv({ cls: "vault-ai-loading" });
    loadingIndicator.createDiv({ cls: "vault-ai-dot-flashing" });
    send.toggleClass("vault-ai-hidden", this.isThinking);
    loadingIndicator.toggleClass("is-visible", this.isThinking);
    input.disabled = this.isThinking;

    const submit = (): void => { void this.submitQuestion(input.value); };
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });
  }

  private resizeInput(input: HTMLTextAreaElement): void {
    input.setCssStyles({ height: "auto" });
    input.setCssStyles({ height: `${Math.min(input.scrollHeight, 150)}px`, overflowY: input.scrollHeight > 150 ? "auto" : "hidden" });
  }

  private showModelMenu(event: MouseEvent): void {
    const lang = this.plugin.settings.language;
    const loadingMenu = new Menu();
    loadingMenu.addItem((item) => item.setTitle(t("model.loading", lang)));
    loadingMenu.showAtMouseEvent(event);
    void this.plugin.client.listModels().then((models) => {
      loadingMenu.hide();
      const modelMenu = new Menu();
      models.forEach((model) => modelMenu.addItem((item) => item
        .setTitle(model.name ? `${model.id} — ${model.name}` : model.id)
        .setChecked(model.id === this.plugin.settings.chatModel)
        .onClick(() => {
          this.plugin.settings.chatModel = model.id;
          void this.plugin.saveSettings().then(() => this.render()).catch((error: unknown) => new Notice(errorMessage(error)));
        })));
      modelMenu.showAtMouseEvent(event);
    }).catch(() => {
      loadingMenu.hide();
      new Notice(t("model.error", lang));
    });
  }

  private async submitQuestion(questionValue: string): Promise<void> {
    const question = questionValue.trim();
    if (!question || this.isThinking) return;
    const display = this.attachedPaths.length > 0
      ? `${question}\n\nفایل‌های پیوست: ${this.attachedPaths.map((path) => `[[${path}]]`).join(", ")}`
      : question;
    this.plugin.store.addChatMessage({ role: "user", content: display, createdAt: Date.now() });
    this.isThinking = true;
    this.render();
    try {
      const answer = await this.ask(question);
      this.plugin.store.addChatMessage({ role: "assistant", content: answer, createdAt: Date.now() });
      this.attachedPaths = [];
      this.selectedText = "";
    } catch (error) {
      new Notice(`گفتگو ناموفق بود: ${errorMessage(error)}`);
    } finally {
      this.isThinking = false;
      this.render();
    }
  }

  private async ask(question: string): Promise<string> {
    const attached = await Promise.all(this.attachedPaths.map(async (path) => {
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile ? `ATTACHED FILE: ${file.path}\n${(await this.plugin.app.vault.read(file)).slice(0, 12000)}` : "";
    }));
    const retrieved = await this.plugin.store.search(question, this.plugin.settings.resultCount);
    const memory = retrieved.map((item) => `MEMORY [[${item.filePath}]]${item.heading ? ` — ${item.heading}` : ""}\n${item.text}`).join("\n\n");
    const history = this.plugin.store.getChatMessages().slice(-12).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
    return this.plugin.client.chat(this.plugin.settings.systemPrompt,
      `CONVERSATION:\n${history}\n\nQUESTION:\n${question}\n\nSELECTED TEXT:\n${this.selectedText.slice(0, 12000) || "None"}\n\n${attached.filter(Boolean).join("\n\n")}\n\nRETRIEVED LOCAL MEMORY:\n${memory || "None"}`);
  }
}

class MarkdownFilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly onPick: (file: TFile) => void) {
    super(app);
    this.setPlaceholder("یک فایل Markdown انتخاب کنید…");
  }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.onPick(file); }
}

export async function showAnalysis(plugin: VaultAiMemoryPlugin): Promise<void> {
  const file = plugin.app.workspace.getActiveFile();
  if (!file || file.extension !== "md") {
    new Notice("یک فایل Markdown فعال کنید.");
    return;
  }
  const view = await plugin.activateMemoryView();
  view.setSelectedTextContext(await plugin.app.vault.read(file));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
