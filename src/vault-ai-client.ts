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

  private async post(path: string, body: unknown): Promise<unknown> {
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
      const detail = responseErrorDetail(response.json as unknown, response.text);
      throw new Error(`API request (${response.status}): ${detail || "request failed"}`);
    }
    return response.json as unknown;
  }

  private async get(path: string): Promise<unknown> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    const response = await requestUrl({
      url: this.endpoint(path),
      method: "GET",
      headers: { "Authorization": `Bearer ${settings.apiKey.trim()}` },
      throw: false
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`API request (${response.status}): ${response.text || "request failed"}`);
    return response.json as unknown;
  }

  async listModels(): Promise<VaultAiModel[]> {
    const data = await this.get("/models");
    if (!isRecord(data) || !isUnknownArray(data.data)) return [];
    return data.data.flatMap((model): VaultAiModel[] => {
      if (!isRecord(model) || typeof model.id !== "string") return [];
      return [{ id: model.id, name: typeof model.name === "string" ? model.name : undefined }];
    });
  }

  async chat(system: string, user: string): Promise<string> {
    const data = await this.post("/chat/completions", {
      model: this.getSettings().chatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    const content = chatContent(data);
    if (!content) throw new Error(t("api.error.invalidResponse", this.getSettings().language));
    return content;
  }

  async chatStream(system: string, user: string, onChunk: (chunk: string) => void): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    
    const response = await fetch(this.endpoint("/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: settings.chatModel,
        temperature: 0.2,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API request (${response.status}): ${text || "request failed"}`);
    }

    if (!response.body) {
        throw new Error("No response body returned from stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullContent = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") continue;
        
        try {
          const data = JSON.parse(dataStr);
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            const chunk = data.choices[0].delta.content;
            fullContent += chunk;
            onChunk(chunk);
          }
        } catch (e) {
            // Ignore incomplete chunks
        }
      }
    }
    
    return fullContent;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function responseErrorDetail(json: unknown, fallback: string): string {
  return isRecord(json) && "error" in json ? JSON.stringify(json) : fallback;
}

function chatContent(value: unknown): string | null {
  if (!isRecord(value) || !isUnknownArray(value.choices)) return null;
  const firstChoice = value.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return null;
  return typeof firstChoice.message.content === "string" ? firstChoice.message.content : null;
}
