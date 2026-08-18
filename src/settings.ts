import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import { ConfirmModal } from "./confirm-modal";
import { t } from "./i18n";
import type VaultAiMemoryPlugin from "./main";
import { DEFAULT_SETTINGS, type VaultAiMemorySettings, type VaultAiModel } from "./types";

type SettingKey = keyof VaultAiMemorySettings;

export class VaultAiMemorySettingsTab extends PluginSettingTab {
  private models: VaultAiModel[] = [];
  private connectionMessage = "";
  private isTestingConnection = false;
  private isRebuilding = false;

  constructor(app: App, private readonly plugin: VaultAiMemoryPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const lang = this.plugin.settings.language;
    const stats = this.plugin.store.stats();

    return [
      {
        type: "group",
        heading: lang === "en" ? "Connection" : "اتصال",
        items: [
          { name: t("settings.connection.help", lang), searchable: false },
          {
            name: t("settings.language.name", lang),
            desc: t("settings.language.desc", lang),
            control: { type: "dropdown", key: "language", options: { fa: "فارسی", en: "English" } }
          },
          {
            name: t("settings.baseUrl.name", lang),
            desc: t("settings.baseUrl.desc", lang),
            control: { type: "text", key: "apiBaseUrl", placeholder: "https://api.openai.com/v1" }
          },
          {
            name: t("settings.apiKey.name", lang),
            desc: t("settings.apiKey.desc", lang),
            render: (setting) => {
              setting.addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder("sk-…")
                  .setValue(this.plugin.settings.apiKey)
                  .onChange((value) => { void this.updateSetting("apiKey", value.trim()); });
              });
            }
          },
          {
            name: t("settings.testConnection.name", lang),
            desc: this.connectionMessage || t("settings.connection.desc", lang),
            action: () => { void this.testConnection(); },
            disabled: () => this.isTestingConnection
          },
          {
            name: t("settings.chatModel.name", lang),
            desc: t("settings.chatModel.desc", lang),
            control: { type: "dropdown", key: "chatModel", options: this.modelOptions() }
          },
          {
            name: lang === "fa" ? "پاسخ زنده (استریم)" : "Stream Responses",
            desc: lang === "fa" ? "نمایش قطعه‌به‌قطعه‌ی جواب‌ها در هنگام تولید" : "Stream AI responses word by word",
            control: { type: "toggle", key: "enableStreaming" }
          }
        ]
      },
      {
        type: "group",
        heading: lang === "en" ? "Indexing" : "ایندکس‌گذاری",
        items: [
          {
            name: t("settings.autoIndex.name", lang),
            desc: t("settings.autoIndex.desc", lang),
            control: { type: "toggle", key: "autoIndex" }
          },
          {
            name: t("settings.excluded.name", lang),
            desc: t("settings.excluded.desc", lang),
            control: { type: "text", key: "excludedFolders" }
          },
          {
            name: t("settings.chunkSize.name", lang),
            desc: t("settings.chunkSize.desc", lang),
            control: { type: "number", key: "chunkSize", min: 300, step: 1 }
          },
          {
            name: "Search result count",
            control: { type: "number", key: "resultCount", min: 1, max: 30, step: 1 }
          },
          {
            name: t("settings.systemPrompt.name", lang),
            desc: t("settings.systemPrompt.desc", lang),
            control: { type: "textarea", key: "systemPrompt", rows: 4 }
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.memory.title", lang),
        items: [
          {
            name: lang === "en"
              ? `Status: ${stats.files} files, ${stats.chunks} chunks in memory`
              : `وضعیت فعلی: ${stats.files} فایل و ${stats.chunks} قطعه در حافظهٔ محلی`,
            searchable: false
          },
          {
            name: t("settings.memory.rebuild.name", lang),
            desc: t("settings.memory.rebuild.desc", lang),
            action: () => { void this.rebuildIndex(); },
            disabled: () => this.isRebuilding
          },
          {
            name: t("settings.memory.clear.name", lang),
            desc: t("settings.memory.clear.desc", lang),
            action: () => this.confirmClearMemory()
          }
        ]
      }
    ];
  }

  getControlValue(key: string): unknown {
    return isSettingKey(key) ? this.plugin.settings[key] : undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (!isSettingKey(key)) return;
    await this.updateSetting(key, value);
    if (key === "language") this.update();
  }

  private modelOptions(): Record<string, string> {
    if (this.models.length === 0) return { [this.plugin.settings.chatModel]: this.plugin.settings.chatModel };
    return Object.fromEntries(this.models.map((model) => [
      model.id,
      model.name ? `${model.id} — ${model.name}` : model.id
    ]));
  }

  private async updateSetting<Key extends SettingKey>(key: Key, value: unknown): Promise<void> {
    this.plugin.settings[key] = value as VaultAiMemorySettings[Key];
    if (key === "systemPrompt" && !this.plugin.settings.systemPrompt.trim()) {
      this.plugin.settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
    }
    await this.plugin.saveSettings();
  }

  private async testConnection(): Promise<void> {
    const lang = this.plugin.settings.language;
    this.isTestingConnection = true;
    this.update();
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
    } finally {
      this.isTestingConnection = false;
      this.update();
    }
  }

  private async rebuildIndex(): Promise<void> {
    this.isRebuilding = true;
    this.update();
    try {
      await this.plugin.rebuildIndex();
    } finally {
      this.isRebuilding = false;
      this.update();
    }
  }

  private confirmClearMemory(): void {
    const lang = this.plugin.settings.language;
    new ConfirmModal(this.app, t("settings.memory.clear.confirm", lang), () => {
      this.plugin.store.clearMemory();
      this.update();
    }, t("settings.memory.clear.btn", lang)).open();
  }
}

function isSettingKey(key: string): key is SettingKey {
  return key in DEFAULT_SETTINGS;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
