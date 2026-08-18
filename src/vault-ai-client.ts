import { requestUrl } from "obsidian";
import * as https from "https";
import { URL } from "url";
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

  async chat(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint("/chat/completions"));
      const options = {
        method: "POST",
        timeout: 60000,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.apiKey.trim()}`
        }
      };

      const req = https.request(url, options, (res) => {
        let body = "";
        res.on("data", (chunk) => body += chunk);
        res.on("end", () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`API request (${res.statusCode}): ${body || "request failed"}`));
            return;
          }
          try {
            const data = JSON.parse(body);
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
              reject(new Error(t("api.error.invalidResponse", settings.language)));
              return;
            }
            let content = data.choices[0].message.content;
            if (typeof content === "object" && content !== null) {
              content = content.text || content.content || JSON.stringify(content);
            }
            resolve(typeof content === "string" ? content : String(content || ""));
          } catch (error) {
            reject(new Error(`Failed to parse response: ${message(error)}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(new Error(`Request failed: ${err.message}`));
      });
      
      req.on("timeout", () => {
        req.destroy(new Error("Request timed out"));
      });
      
      if (signal) {
        signal.addEventListener("abort", () => {
          req.destroy(new Error("AbortError"));
        });
      }

      req.write(JSON.stringify({
        model: settings.chatModel,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }));
      req.end();
    });
  }

  async chatStream(system: string, user: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint("/chat/completions"));
      const options = {
        method: "POST",
        timeout: 60000,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.apiKey.trim()}`
        }
      };

      const req = https.request(url, options, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errorBody = "";
          res.on("data", (chunk) => { errorBody += chunk.toString(); });
          res.on("end", () => {
             reject(new Error(`API request (${res.statusCode}): ${errorBody || "request failed"}`));
          });
          return;
        }

        let fullContent = "";
        let buffer = "";

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf-8");
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
                let textChunk = data.choices[0].delta.content;
                if (typeof textChunk === "object" && textChunk !== null) {
                   textChunk = textChunk.text || textChunk.content || JSON.stringify(textChunk);
                }
                textChunk = typeof textChunk === "string" ? textChunk : String(textChunk || "");
                
                fullContent += textChunk;
                onChunk(textChunk);
              }
            } catch (e) {
                // Ignore incomplete chunks
            }
          }
        });

        res.on("end", () => {
          resolve(fullContent);
        });
      });

      req.on("error", (err) => {
        reject(new Error(`Request failed: ${err.message}`));
      });
      
      req.on("timeout", () => {
        req.destroy(new Error("Request timed out"));
      });
      
      if (signal) {
        signal.addEventListener("abort", () => {
          req.destroy(new Error("AbortError"));
        });
      }

      req.write(JSON.stringify({
        model: settings.chatModel,
        temperature: 0.2,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }));
      req.end();
    });
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

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
