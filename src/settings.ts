import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultAiMemoryPlugin from "./main";
import type { VaultAiModel } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { t, Language } from "./i18n";

export class VaultAiMemorySettingsTab extends PluginSettingTab {
  private models: VaultAiModel[] = [];
  private connectionMessage = "";
  
  constructor(app: App, private readonly plugin: VaultAiMemoryPlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    const lang = this.plugin.settings.language;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Vault Memory" });
    
    new Setting(containerEl)
      .setName(t("settings.language.name", lang))
      .setDesc(t("settings.language.desc", lang))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("fa", "فارسی")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value: string) => {
            this.plugin.settings.language = value as Language;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    containerEl.createEl("p", { text: t("settings.connection.help", lang) });
    
    new Setting(containerEl)
      .setName(t("settings.baseUrl.name", lang))
      .setDesc(t("settings.baseUrl.desc", lang))
      .addText((text) => text.setPlaceholder("https://api.openai.com/v1").setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => { this.plugin.settings.apiBaseUrl = value.trim(); await this.plugin.saveSettings(); }));
      
    new Setting(containerEl)
      .setName(t("settings.apiKey.name", lang))
      .setDesc(t("settings.apiKey.desc", lang))
      .addText((text) => { text.inputEl.type = "password"; text.setPlaceholder("sk-…").setValue(this.plugin.settings.apiKey).onChange(async (value) => { this.plugin.settings.apiKey = value.trim(); await this.plugin.saveSettings(); }); });
      
    new Setting(containerEl)
      .setName(t("settings.testConnection.name", lang))
      .setDesc(this.connectionMessage || t("settings.connection.desc", lang))
      .addButton((button) => button.setButtonText(t("settings.testConnection.btn", lang)).setCta().onClick(async () => {
        button.setDisabled(true).setButtonText(t("settings.testConnection.btnConnecting", lang));
        try {
          this.models = await this.plugin.client.listModels();
          this.connectionMessage = `${t("settings.testConnection.success", lang)} ${this.models.length} models available.`;
          if (this.models.length && !this.models.some((model) => model.id === this.plugin.settings.chatModel)) {
            this.plugin.settings.chatModel = this.models[0].id;
            await this.plugin.saveSettings();
          }
        } catch (error) {
          this.models = [];
          this.connectionMessage = `${t("settings.testConnection.error", lang)} ${errorMessage(error)}`;
        }
        this.display();
      }));
      
    new Setting(containerEl)
      .setName(t("settings.chatModel.name", lang))
      .setDesc(t("settings.chatModel.desc", lang))
      .addDropdown((dropdown) => {
      if (this.models.length) {
        this.models.forEach((model) => dropdown.addOption(model.id, model.name ? `${model.id} — ${model.name}` : model.id));
      } else {
        dropdown.addOption(this.plugin.settings.chatModel, this.plugin.settings.chatModel);
      }
      dropdown.setValue(this.plugin.settings.chatModel).onChange(async (value) => { this.plugin.settings.chatModel = value; await this.plugin.saveSettings(); });
    });
    
    new Setting(containerEl)
      .setName(t("settings.autoIndex.name", lang))
      .setDesc(t("settings.autoIndex.desc", lang))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.autoIndex).onChange(async (value) => { this.plugin.settings.autoIndex = value; await this.plugin.saveSettings(); }));
      
    new Setting(containerEl)
      .setName(t("settings.excluded.name", lang))
      .setDesc(t("settings.excluded.desc", lang))
      .addText((text) => text.setValue(this.plugin.settings.excludedFolders).onChange(async (value) => { this.plugin.settings.excludedFolders = value; await this.plugin.saveSettings(); }));
      
    new Setting(containerEl)
      .setName(t("settings.chunkSize.name", lang))
      .setDesc(t("settings.chunkSize.desc", lang))
      .addText((text) => text.setValue(String(this.plugin.settings.chunkSize)).onChange(async (value) => { const number = Number(value); if (number >= 300) { this.plugin.settings.chunkSize = number; await this.plugin.saveSettings(); } }));
      
    new Setting(containerEl)
      .setName("Search result count")
      .addText((text) => text.setValue(String(this.plugin.settings.resultCount)).onChange(async (value) => { const number = Number(value); if (number >= 1 && number <= 30) { this.plugin.settings.resultCount = number; await this.plugin.saveSettings(); } }));
    
    new Setting(containerEl)
      .setName(t("settings.systemPrompt.name", lang))
      .setDesc(t("settings.systemPrompt.desc", lang))
      .addTextArea((text) => {
      text.inputEl.rows = 4;
      text.inputEl.cols = 50;
      text.setValue(this.plugin.settings.systemPrompt).onChange(async (value) => {
        this.plugin.settings.systemPrompt = value.trim() || DEFAULT_SETTINGS.systemPrompt;
        await this.plugin.saveSettings();
      });
    });
    
    containerEl.createEl("h3", { text: t("settings.memory.title", lang) });
    const stats = this.plugin.store.stats();
    containerEl.createEl("p", { text: lang === "en" ? `Status: ${stats.files} files, ${stats.chunks} chunks in memory` : `وضعیت فعلی: ${stats.files} فایل و ${stats.chunks} قطعه در حافظهٔ محلی` });
    
    new Setting(containerEl)
      .setName(t("settings.memory.rebuild.name", lang))
      .setDesc(t("settings.memory.rebuild.desc", lang))
      .addButton((button) => button.setButtonText(t("settings.memory.rebuild.btn", lang)).setCta().onClick(() => {
        button.setDisabled(true).setButtonText(t("settings.memory.rebuild.btnRunning", lang));
        void this.plugin.rebuildIndex().then(() => { button.setDisabled(false).setButtonText(t("settings.memory.rebuild.btn", lang)); this.display(); });
      }));

    new Setting(containerEl)
      .setName(t("settings.memory.clear.name", lang))
      .setDesc(t("settings.memory.clear.desc", lang))
      .addButton((button) => button.setButtonText(t("settings.memory.clear.btn", lang)).setWarning().onClick(() => {
        if (window.confirm(t("settings.memory.clear.confirm", lang))) {
          this.plugin.store.clearMemory();
          this.display();
        }
      }));
  }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
