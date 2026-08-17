import { requestUrl } from "obsidian";
import type { VaultAiMemorySettings, VaultAiModel } from "./types";
import { t } from "./i18n";

export class VaultAiClient {
  constructor(private readonly getSettings: () => VaultAiMemorySettings) {}

  private endpoint(path: string): string {
    const settings = this.getSettings();
    const base = settings.apiBaseUrl.trim().replace(/\/$/, "");
    if (!base) throw new Error(t("api.error.baseUrl", settings.language));
    return `${base}${path}`;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    const response = await requestUrl({
      url: this.endpoint(path),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey.trim()}`
      },
      body: JSON.stringify(body),
      throw: false
    });
    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.json === "object" && response.json && "error" in response.json
        ? JSON.stringify(response.json)
        : response.text;
      throw new Error(`API request (${response.status}): ${detail || "request failed"}`);
    }
    return response.json as T;
  }

  private async get<T>(path: string): Promise<T> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    const response = await requestUrl({
      url: this.endpoint(path),
      method: "GET",
      headers: { "Authorization": `Bearer ${settings.apiKey.trim()}` },
      throw: false
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`API request (${response.status}): ${response.text || "request failed"}`);
    return response.json as T;
  }

  async listModels(): Promise<VaultAiModel[]> {
    const data = await this.get<{ data?: Array<{ id?: string; name?: string }> }>("/models");
    return (data.data ?? []).flatMap((model) => model.id ? [{ id: model.id, name: model.name }] : []);
  }

  async chat(system: string, user: string): Promise<string> {
    const data = await this.post<{ choices?: Array<{ message?: { content?: string } }> }>("/chat/completions", {
      model: this.getSettings().chatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(t("api.error.invalidResponse", this.getSettings().language));
    return content;
  }
}
