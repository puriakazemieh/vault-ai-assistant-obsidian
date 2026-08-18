import { Notice } from "obsidian";
import { MarkdownFilePicker } from "./file-picker";
import { t } from "./i18n";
import type VaultAiMemoryPlugin from "./main";

export function startComparisonFlow(plugin: VaultAiMemoryPlugin): void {
  const lang = plugin.settings.language;
  
  new MarkdownFilePicker(plugin.app, t("compare.pickFirst", lang), (file1) => {
    new MarkdownFilePicker(plugin.app, t("compare.pickSecond", lang), async (file2) => {
      new Notice(t("compare.processing", lang));
      
      try {
        const text1 = await plugin.app.vault.read(file1);
        const text2 = await plugin.app.vault.read(file2);
        
        const systemPrompt = plugin.settings.systemPrompt;
        const defaultPrompt = t("compare.defaultPrompt", lang);
        
        const prompt = `${defaultPrompt}\n\nDocument A (${file1.name}):\n${text1}\n\nDocument B (${file2.name}):\n${text2}`;
        
        const response = await plugin.client.chat(systemPrompt, prompt);
        
        // Ensure a unique filename
        let newFileName = `Comparison_${file1.basename}_vs_${file2.basename}.md`;
        let counter = 1;
        while (plugin.app.vault.getAbstractFileByPath(newFileName)) {
          newFileName = `Comparison_${file1.basename}_vs_${file2.basename}_${counter}.md`;
          counter++;
        }
        
        const newFile = await plugin.app.vault.create(newFileName, response);
        
        new Notice(t("compare.success", lang));
        
        const leaf = plugin.app.workspace.getLeaf('tab');
        await leaf.openFile(newFile);
        
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`${t("compare.error", lang)} ${message}`);
        console.error("Comparison Error:", error);
      }
    }).open();
  }).open();
}
