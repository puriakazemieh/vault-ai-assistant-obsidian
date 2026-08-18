import { App, Editor, Modal, Notice, Setting } from "obsidian";
import type VaultAiMemoryPlugin from "./main";
import { t } from "./i18n";

export class InlineAiModal extends Modal {
  private instruction = "";
  private submitButton: HTMLButtonElement | null = null;
  private abortController: AbortController | null = null;
  
  constructor(
    app: App, 
    private plugin: VaultAiMemoryPlugin, 
    private editor: Editor,
    private selection: string
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const lang = this.plugin.settings.language;
    
    contentEl.createEl("h2", { text: t("inline.modal.title", lang) });
    
    const inputSetting = new Setting(contentEl)
      .addText((text) => {
        text.setPlaceholder(t("inline.modal.placeholder", lang))
            .onChange((value) => {
               this.instruction = value;
            });
        text.inputEl.style.width = "100%";
        text.inputEl.addEventListener("keydown", (e) => {
           if (e.key === "Enter") {
               e.preventDefault();
               void this.submit();
           }
        });
        setTimeout(() => text.inputEl.focus(), 50);
      });
      
    inputSetting.settingEl.style.borderTop = "none";
      
    new Setting(contentEl)
      .addButton((btn) => {
        this.submitButton = btn.buttonEl;
        btn.setButtonText(t("inline.modal.submit", lang))
           .setCta()
           .onClick(() => {
              void this.submit();
           });
      });
  }

  onClose(): void {
    if (this.abortController) {
        this.abortController.abort();
    }
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    if (!this.instruction.trim()) {
        return;
    }
    
    if (this.submitButton) {
        this.submitButton.disabled = true;
        this.submitButton.innerText = this.plugin.settings.language === "fa" ? "در حال پردازش..." : "Processing...";
    }
    
    const systemPrompt = "You are an AI editor assistant. Modify the following text according to the user's instructions. Output ONLY the modified text, do not wrap it in markdown code blocks unless the text itself is code, and do not add conversational pleasantries.";
    const userPrompt = `Instruction: ${this.instruction}\n\nText to modify:\n${this.selection}`;
    
    const cursorStart = this.editor.getCursor("from");
    let currentPos = cursorStart;
    let hasStartedReplacing = false;
    
    this.abortController = new AbortController();
    
    try {
        if (this.plugin.settings.enableStreaming) {
            await this.plugin.client.chatStream(systemPrompt, userPrompt, (chunk) => {
                if (!hasStartedReplacing) {
                    this.editor.replaceSelection("");
                    hasStartedReplacing = true;
                }
                this.editor.replaceRange(chunk, currentPos);
                const offset = this.editor.posToOffset(currentPos);
                currentPos = this.editor.offsetToPos(offset + chunk.length);
            }, this.abortController.signal);
            
            if (!hasStartedReplacing) {
                this.editor.replaceSelection("");
            }
        } else {
            const answer = await this.plugin.client.chat(systemPrompt, userPrompt, this.abortController.signal);
            this.editor.replaceSelection(answer);
            hasStartedReplacing = true;
        }
        this.close();
    } catch (error) {
        if (error instanceof Error && error.message.includes("AbortError")) {
            if (hasStartedReplacing) {
                this.editor.replaceRange(this.selection, cursorStart, currentPos);
            }
            return;
        }
        
        if (hasStartedReplacing) {
            this.editor.replaceRange(this.selection, cursorStart, currentPos);
        }
        
        let errorEl = this.contentEl.querySelector(".vault-ai-error-text") as HTMLElement;
        if (!errorEl) {
            errorEl = this.contentEl.createEl("p", { cls: "vault-ai-error-text" });
            errorEl.style.color = "var(--text-error)";
            errorEl.style.marginTop = "12px";
        }
        errorEl.innerText = `خطا: ${error instanceof Error ? error.message : String(error)}`;
        
        if (this.submitButton) {
            this.submitButton.disabled = false;
            this.submitButton.innerText = this.plugin.settings.language === "fa" ? "ارسال مجدد" : "Retry";
        }
    }
  }
}
