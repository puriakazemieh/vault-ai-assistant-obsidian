import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly message: string,
    private readonly onConfirm: () => void,
    private readonly confirmLabel: string
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.message });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button
        .setButtonText(this.confirmLabel)
        .setDestructive()
        .setCta()
        .onClick(() => {
          this.onConfirm();
          this.close();
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
