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
    private selectedText: string
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
    try {
        if (!this.instruction.trim()) {
            return;
        }
        if (this.submitButton && this.submitButton.disabled) {
            return;
        }
        
        if (this.submitButton) {
            this.submitButton.disabled = true;
            this.submitButton.innerText = this.plugin.settings.language === "fa" ? "در حال پردازش..." : "Processing...";
        }
        
        let errorEl = this.contentEl.querySelector(".vault-ai-error-text") as HTMLElement;
        if (errorEl) {
            errorEl.innerText = "";
        }
        
        const systemPrompt = this.plugin.settings.systemPrompt || "";
        const userPrompt = `CONVERSATION:\n\n\nQUESTION:\n${this.instruction} (Act as an editor. Output ONLY the final modified text without any explanations)\n\nSELECTED TEXT:\n${this.selectedText.slice(0, 12000) || "None"}\n\n\n\nRETRIEVED LOCAL MEMORY:\nNone`;
        
        this.abortController = new AbortController();
        
        new Notice(this.plugin.settings.language === "fa" ? "در حال ارسال درخواست به سرور..." : "Sending request to server...");
        
        if (this.plugin.settings.enableStreaming) {
            this.editor.replaceSelection("");
            let currentPos = this.editor.getCursor();
            
            await this.plugin.client.chatStream(systemPrompt, userPrompt, (chunk) => {
                this.editor.replaceRange(chunk, currentPos);
                const lines = chunk.split('\n');
                if (lines.length === 1) {
                    currentPos.ch += chunk.length;
                } else {
                    currentPos.line += lines.length - 1;
                    currentPos.ch = lines[lines.length - 1].length;
                }
            }, this.abortController.signal);
        } else {
            const answer = await this.plugin.client.chat(systemPrompt, userPrompt, this.abortController.signal);
            this.editor.replaceSelection(answer);
        }
        
        this.close();
    } catch (error) {
        if (error instanceof Error && error.message.includes("AbortError")) {
            return;
        }
        
        let errorEl = this.contentEl.querySelector(".vault-ai-error-text") as HTMLElement;
        if (!errorEl) {
            errorEl = this.contentEl.createEl("p", { cls: "vault-ai-error-text" });
            errorEl.style.color = "var(--text-error)";
            errorEl.style.marginTop = "12px";
        }
        errorEl.innerText = `خطا: ${error instanceof Error ? error.message : String(error)}`;
        new Notice("خطا در ارتباط با سرور: " + (error instanceof Error ? error.message : String(error)));
        
        if (this.submitButton) {
            this.submitButton.disabled = false;
            this.submitButton.innerText = this.plugin.settings.language === "fa" ? "ارسال مجدد" : "Retry";
        }
    }
  }
}
