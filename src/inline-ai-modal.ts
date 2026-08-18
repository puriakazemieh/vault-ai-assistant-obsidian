import { App, Editor, Modal, Notice, Setting } from "obsidian";
import type VaultAiMemoryPlugin from "./main";
import { t } from "./i18n";

export class InlineAiModal extends Modal {
  private instruction = "";
  
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
        btn.setButtonText(t("inline.modal.submit", lang))
           .setCta()
           .onClick(() => {
              void this.submit();
           });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    if (!this.instruction.trim()) {
        return;
    }
    this.close();
    
    const systemPrompt = "You are an AI editor assistant. Modify the following text according to the user's instructions. Output ONLY the modified text, do not wrap it in markdown code blocks unless the text itself is code, and do not add conversational pleasantries.";
    const userPrompt = `Instruction: ${this.instruction}\n\nText to modify:\n${this.selection}`;
    
    const cursorStart = this.editor.getCursor("from");
    this.editor.replaceSelection("");
    let currentPos = cursorStart;
    
    try {
        if (this.plugin.settings.enableStreaming) {
            await this.plugin.client.chatStream(systemPrompt, userPrompt, (chunk) => {
                this.editor.replaceRange(chunk, currentPos);
                const offset = this.editor.posToOffset(currentPos);
                currentPos = this.editor.offsetToPos(offset + chunk.length);
            });
        } else {
            const answer = await this.plugin.client.chat(systemPrompt, userPrompt);
            this.editor.replaceRange(answer, currentPos);
        }
    } catch (error) {
        new Notice(`AI Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
