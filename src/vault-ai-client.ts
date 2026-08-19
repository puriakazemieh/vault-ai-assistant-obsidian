import { requestUrl, Platform } from "obsidian";
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
    
    return new Promise(async (resolve, reject) => {
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        reject(new Error("AbortError"));
      };
      
      if (signal) {
        if (signal.aborted) return reject(new Error("AbortError"));
        signal.addEventListener("abort", onAbort);
      }

      try {
        const response = await requestUrl({
          url: this.endpoint("/chat/completions"),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Obsidian-Vault-AI",
            "Authorization": `Bearer ${settings.apiKey.trim()}`
          },
          body: JSON.stringify({
            model: settings.chatModel,
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user }
            ]
          }),
          throw: false
        });

        if (aborted) return;
        
        if (response.status < 200 || response.status >= 300) {
          const detail = responseErrorDetail(response.json as unknown, response.text);
          reject(new Error(`API request (${response.status}): ${detail || "request failed"}`));
          return;
        }

        const data = response.json as unknown;
        const content = chatContent(data);
        if (content === null) {
          reject(new Error(t("api.error.invalidResponse", settings.language)));
          return;
        }
        
        resolve(content);
      } catch (error) {
        if (!aborted) reject(new Error(`Request failed: ${message(error)}`));
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    });
  }

  async chatStream(system: string, user: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    
    return new Promise((resolve, reject) => {
      if (!Platform.isDesktop) {
        reject(new Error("Streaming is only supported on desktop. Please disable 'Stream Responses' in settings."));
        return;
      }
      
      /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Node.js streaming APIs are dynamically imported and inherently untyped; guarded by Platform.isDesktop check above */
      const http = require("http");
      const https = require("https");
      const { URL } = require("url");

      const url = new URL(this.endpoint("/chat/completions"));
      const options = {
        method: "POST",
        timeout: 60000,
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
          "User-Agent": "Obsidian-Vault-AI",
          "Authorization": `Bearer ${settings.apiKey.trim()}`
        }
      };

      let idleTimeout: number;
      const resetIdleTimeout = () => {
          window.clearTimeout(idleTimeout);
          idleTimeout = window.setTimeout(() => {
              req.destroy(new Error("Stream idle timeout: no data received for 30s"));
          }, 30000);
      };
      resetIdleTimeout();

      const requestFn = url.protocol === "http:" ? http.request : https.request;
      const req = requestFn(url, options, (res: any) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errorBody = "";
          res.on("data", (chunk: any) => { 
              resetIdleTimeout();
              errorBody += chunk.toString(); 
          });
          res.on("end", () => {
             window.clearTimeout(idleTimeout);
             reject(new Error(`API request (${res.statusCode}): ${errorBody || "request failed"}`));
          });
          return;
        }

        let fullContent = "";
        let buffer = "";

        res.on("data", (chunk: any) => {
          resetIdleTimeout();
          buffer += chunk.toString("utf-8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") continue;
            
            try {
              const data = JSON.parse(dataStr) as unknown;
              const textChunk = chatContent(data);
              if (textChunk) {
                fullContent += textChunk;
                onChunk(textChunk);
              }
            } catch (_e) {
                // Ignore incomplete SSE chunks during streaming
            }
          }
        });

        res.on("end", () => {
          window.clearTimeout(idleTimeout);
          resolve(fullContent);
        });

        res.on("error", (err: Error) => {
          window.clearTimeout(idleTimeout);
          reject(new Error(`Response error: ${err.message}`));
        });

        res.on("aborted", () => {
          window.clearTimeout(idleTimeout);
          reject(new Error("Response aborted by server"));
        });
      });

      req.on("error", (err: Error) => {
        window.clearTimeout(idleTimeout);
        reject(new Error(`Request failed: ${err.message}`));
      });
      
      req.on("timeout", () => {
        req.destroy(new Error("Request timed out"));
      });
      
      if (signal) {
        signal.addEventListener("abort", () => {
          window.clearTimeout(idleTimeout);
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
      /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
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
