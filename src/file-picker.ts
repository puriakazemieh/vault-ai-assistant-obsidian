import { App, FuzzySuggestModal, TFile } from "obsidian";

export class MarkdownFilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly placeholderText: string, private readonly onPick: (file: TFile) => void) {
    super(app);
    this.setPlaceholder(placeholderText);
  }
  
  getItems(): TFile[] { 
    return this.app.vault.getMarkdownFiles(); 
  }
  
  getItemText(file: TFile): string { 
    return file.path; 
  }
  
  onChooseItem(file: TFile): void { 
    this.onPick(file); 
  }
}
