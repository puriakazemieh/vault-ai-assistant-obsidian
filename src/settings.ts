import { App, ButtonComponent, PluginSettingTab, Setting } from "obsidian";
import { ConfirmModal } from "./confirm-modal";
import { t, type Language } from "./i18n";
import type VaultAiMemoryPlugin from "./main";
import { DEFAULT_SETTINGS, type VaultAiModel } from "./types";

export class VaultAiMemorySettingsTab extends PluginSettingTab {
  private models: VaultAiModel[] = [];
  private connectionMessage = "";

  constructor(app: App, private readonly plugin: VaultAiMemoryPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const lang = this.plugin.settings.language;
    containerEl.empty();

    new Setting(containerEl).setName("AI Vault Memory").setHeading();
    new Setting(containerEl).setDesc(t("settings.connection.help", lang));

    new Setting(containerEl)
      .setName(t("settings.language.name", lang))
      .setDesc(t("settings.language.desc", lang))
      .addDropdown((dropdown) => dropdown
        .addOption("fa", "فارسی")
        .addOption("en", "English")
        .setValue(this.plugin.settings.language)
        .onChange((value) => { void this.changeLanguage(value); }));

    new Setting(containerEl)
      .setName(t("settings.baseUrl.name", lang))
      .setDesc(t("settings.baseUrl.desc", lang))
      .addText((text) => text
        .setPlaceholder("https://api.openai.com/v1")
        .setValue(this.plugin.settings.apiBaseUrl)
        .onChange((value) => { void this.updateSetting("apiBaseUrl", value.trim()); }));

    new Setting(containerEl)
      .setName(t("settings.apiKey.name", lang))
      .setDesc(t("settings.apiKey.desc", lang))
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("sk-…").setValue(this.plugin.settings.apiKey)
          .onChange((value) => { void this.updateSetting("apiKey", value.trim()); });
      });

    new Setting(containerEl)
      .setName(t("settings.testConnection.name", lang))
      .setDesc(this.connectionMessage || t("settings.connection.desc", lang))
      .addButton((button) => button
        .setButtonText(t("settings.testConnection.btn", lang))
        .setCta()
        .onClick(() => { void this.testConnection(button); }));

    new Setting(containerEl)
      .setName(t("settings.chatModel.name", lang))
      .setDesc(t("settings.chatModel.desc", lang))
      .addDropdown((dropdown) => {
        if (this.models.length > 0) {
          this.models.forEach((model) => dropdown.addOption(model.id, model.name ? `${model.id} — ${model.name}` : model.id));
        } else {
          dropdown.addOption(this.plugin.settings.chatModel, this.plugin.settings.chatModel);
        }
        dropdown.setValue(this.plugin.settings.chatModel).onChange((value) => { void this.updateSetting("chatModel", value); });
      });

    new Setting(containerEl)
      .setName(t("settings.autoIndex.name", lang))
      .setDesc(t("settings.autoIndex.desc", lang))
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.autoIndex).onChange((value) => { void this.updateSetting("autoIndex", value); }));

    new Setting(containerEl)
      .setName(t("settings.excluded.name", lang))
      .setDesc(t("settings.excluded.desc", lang))
      .addText((text) => text.setValue(this.plugin.settings.excludedFolders).onChange((value) => { void this.updateSetting("excludedFolders", value); }));

    new Setting(containerEl)
      .setName(t("settings.chunkSize.name", lang))
      .setDesc(t("settings.chunkSize.desc", lang))
      .addText((text) => text.setValue(String(this.plugin.settings.chunkSize)).onChange((value) => {
        const chunkSize = Number(value);
        if (chunkSize >= 300) void this.updateSetting("chunkSize", chunkSize);
      }));

    new Setting(containerEl)
      .setName("Search result count")
      .addText((text) => text.setValue(String(this.plugin.settings.resultCount)).onChange((value) => {
        const resultCount = Number(value);
        if (resultCount >= 1 && resultCount <= 30) void this.updateSetting("resultCount", resultCount);
      }));

    new Setting(containerEl)
      .setName(t("settings.systemPrompt.name", lang))
      .setDesc(t("settings.systemPrompt.desc", lang))
      .addTextArea((text) => {
        text.inputEl.rows = 4;
        text.inputEl.cols = 50;
        text.setValue(this.plugin.settings.systemPrompt).onChange((value) => {
          void this.updateSetting("systemPrompt", value.trim() || DEFAULT_SETTINGS.systemPrompt);
        });
      });

    new Setting(containerEl).setName(t("settings.memory.title", lang)).setHeading();
    const stats = this.plugin.store.stats();
    new Setting(containerEl).setDesc(lang === "en"
      ? `Status: ${stats.files} files, ${stats.chunks} chunks in memory`
      : `وضعیت فعلی: ${stats.files} فایل و ${stats.chunks} قطعه در حافظهٔ محلی`);

    new Setting(containerEl)
      .setName(t("settings.memory.rebuild.name", lang))
      .setDesc(t("settings.memory.rebuild.desc", lang))
      .addButton((button) => button.setButtonText(t("settings.memory.rebuild.btn", lang)).setCta().onClick(() => {
        button.setDisabled(true).setButtonText(t("settings.memory.rebuild.btnRunning", lang));
        void this.plugin.rebuildIndex()
          .catch((error: unknown) => console.error("Could not rebuild vault memory", error))
          .finally(() => this.display());
      }));

    new Setting(containerEl)
      .setName(t("settings.memory.clear.name", lang))
      .setDesc(t("settings.memory.clear.desc", lang))
      .addButton((button) => button.setButtonText(t("settings.memory.clear.btn", lang)).setDestructive().onClick(() => {
        new ConfirmModal(this.app, t("settings.memory.clear.confirm", lang), () => {
          this.plugin.store.clearMemory();
          this.display();
        }, t("settings.memory.clear.btn", lang)).open();
      }));
  }

  private async changeLanguage(value: string): Promise<void> {
    this.plugin.settings.language = value as Language;
    await this.plugin.saveSettings();
    this.display();
  }

  private async updateSetting<Key extends keyof VaultAiMemoryPlugin["settings"]>(
    key: Key,
    value: VaultAiMemoryPlugin["settings"][Key]
  ): Promise<void> {
    this.plugin.settings[key] = value;
    await this.plugin.saveSettings();
  }

  private async testConnection(button: ButtonComponent): Promise<void> {
    const lang = this.plugin.settings.language;
    button.setDisabled(true).setButtonText(t("settings.testConnection.btnConnecting", lang));
    try {
      this.models = await this.plugin.client.listModels();
      this.connectionMessage = `${t("settings.testConnection.success", lang)} ${this.models.length} models available.`;
      if (this.models.length > 0 && !this.models.some((model) => model.id === this.plugin.settings.chatModel)) {
        this.plugin.settings.chatModel = this.models[0].id;
        await this.plugin.saveSettings();
      }
    } catch (error) {
      this.models = [];
      this.connectionMessage = `${t("settings.testConnection.error", lang)} ${errorMessage(error)}`;
    }
    this.display();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
