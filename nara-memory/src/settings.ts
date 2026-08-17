import { App, PluginSettingTab, Setting } from "obsidian";
import type NaraMemoryPlugin from "./main";
import type { NaraModel } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export class NaraMemorySettingsTab extends PluginSettingTab {
  private models: NaraModel[] = [];
  private connectionMessage = "برای بررسی اتصال، دکمهٔ زیر را بزنید.";
  constructor(app: App, private readonly plugin: NaraMemoryPlugin) { super(app, plugin); }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Nara Memory" });
    containerEl.createEl("p", { text: "ایندکس و حافظه روی دستگاه باقی می‌ماند. فقط وقتی «Analyze current file» را اجرا می‌کنید، متن فایل و نتایج مرتبط به NaraRouter فرستاده می‌شود." });
    new Setting(containerEl).setName("NaraRouter Base URL").setDesc("پیش‌فرض رسمی NaraRouter: https://router.bynara.id/v1").addText((text) => text.setPlaceholder("https://router.bynara.id/v1").setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => { this.plugin.settings.apiBaseUrl = value.trim(); await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("API key").addText((text) => { text.inputEl.type = "password"; text.setPlaceholder("sk-…").setValue(this.plugin.settings.apiKey).onChange(async (value) => { this.plugin.settings.apiKey = value.trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl)
      .setName("تست اتصال و دریافت مدل‌ها")
      .setDesc(this.connectionMessage)
      .addButton((button) => button.setButtonText("تست اتصال").setCta().onClick(async () => {
        button.setDisabled(true).setButtonText("در حال اتصال…");
        try {
          this.models = await this.plugin.client.listModels();
          this.connectionMessage = `اتصال برقرار است؛ ${this.models.length} مدل در دسترس شماست.`;
          if (this.models.length && !this.models.some((model) => model.id === this.plugin.settings.chatModel)) {
            this.plugin.settings.chatModel = this.models[0].id;
            await this.plugin.saveSettings();
          }
        } catch (error) {
          this.models = [];
          this.connectionMessage = `اتصال ناموفق بود: ${errorMessage(error)}`;
        }
        this.display();
      }));
    new Setting(containerEl).setName("Chat model").setDesc("مدل NaraRouter برای تحلیل و گفتگو.").addDropdown((dropdown) => {
      if (this.models.length) {
        this.models.forEach((model) => dropdown.addOption(model.id, model.name ? `${model.id} — ${model.name}` : model.id));
      } else {
        dropdown.addOption(this.plugin.settings.chatModel, this.plugin.settings.chatModel);
      }
      dropdown.setValue(this.plugin.settings.chatModel).onChange(async (value) => { this.plugin.settings.chatModel = value; await this.plugin.saveSettings(); });
    });
    new Setting(containerEl).setName("Auto-index changes").setDesc("بعد از ذخیره/ساخت یادداشت، embedding آن به‌روزرسانی می‌شود.").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoIndex).onChange(async (value) => { this.plugin.settings.autoIndex = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Excluded folders").setDesc("با کاما جدا کنید؛ مانند Templates, Archive").addText((text) => text.setValue(this.plugin.settings.excludedFolders).onChange(async (value) => { this.plugin.settings.excludedFolders = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Chunk size").setDesc("تعداد تقریبی نویسه در هر قطعه.").addText((text) => text.setValue(String(this.plugin.settings.chunkSize)).onChange(async (value) => { const number = Number(value); if (number >= 300) { this.plugin.settings.chunkSize = number; await this.plugin.saveSettings(); } }));
    new Setting(containerEl).setName("Search result count").addText((text) => text.setValue(String(this.plugin.settings.resultCount)).onChange(async (value) => { const number = Number(value); if (number >= 1 && number <= 30) { this.plugin.settings.resultCount = number; await this.plugin.saveSettings(); } }));
    
    new Setting(containerEl).setName("System Prompt / Skills").setDesc("نقش، مهارت‌ها و دستورالعمل‌های پیش‌فرض هوش مصنوعی را در اینجا وارد کنید.").addTextArea((text) => {
      text.inputEl.rows = 4;
      text.inputEl.cols = 50;
      text.setValue(this.plugin.settings.systemPrompt).onChange(async (value) => {
        this.plugin.settings.systemPrompt = value.trim() || DEFAULT_SETTINGS.systemPrompt;
        await this.plugin.saveSettings();
      });
    });
    
    containerEl.createEl("h3", { text: "مدیریت حافظه" });
    const stats = this.plugin.store.stats();
    containerEl.createEl("p", { text: `وضعیت فعلی: ${stats.files} فایل و ${stats.chunks} قطعه در حافظهٔ محلی` });
    
    new Setting(containerEl)
      .setName("بازسازی کامل ایندکس")
      .setDesc("ایندکس تمام فایل‌ها را از نو می‌سازد.")
      .addButton((button) => button.setButtonText("بازسازی").setCta().onClick(() => {
        button.setDisabled(true).setButtonText("در حال بازسازی…");
        void this.plugin.rebuildIndex().then(() => { button.setDisabled(false).setButtonText("بازسازی"); this.display(); });
      }));

    new Setting(containerEl)
      .setName("پاک‌کردن همهٔ حافظه")
      .setDesc("تمام قطعه‌های ایندکس‌شده پاک می‌شوند. فایل‌های اصلی حذف نمی‌شوند.")
      .addButton((button) => button.setButtonText("پاک کردن").setWarning().onClick(() => {
        if (window.confirm("تمام قطعه‌های ایندکس‌شدهٔ حافظه پاک شوند؟")) {
          this.plugin.store.clearMemory();
          this.display();
        }
      }));
  }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
