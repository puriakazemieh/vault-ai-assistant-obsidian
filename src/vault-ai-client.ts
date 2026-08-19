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
    if (!isRecord(data)) return [];
    const items = data.data;
    if (!isUnknownArray(items)) return [];
    const models: VaultAiModel[] = [];
    for (const item of items) {
      if (!isRecord(item) || typeof item.id !== "string") continue;
      models.push({
        id: item.id,
        name: typeof item.name === "string" ? item.name : undefined
      });
    }
    return models;
  }

  async chat(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));

    try {
      const response = await abortable(requestUrl({
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
      }), signal);

      if (response.status < 200 || response.status >= 300) {
        const detail = responseErrorDetail(response.json as unknown, response.text);
        throw new Error(`API request (${response.status}): ${detail || "request failed"}`);
      }

      const content = chatContent(response.json as unknown);
      if (content === null) {
        throw new Error(t("api.error.invalidResponse", settings.language));
      }
      return content;
    } catch (error) {
      if (error instanceof Error && error.message === "AbortError") throw error;
      throw new Error(`Request failed: ${message(error)}`);
    }
  }

  async chatStream(system: string, user: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey.trim()) throw new Error(t("api.error.apiKey", settings.language));
    return streamChatCompletion({
      url: this.endpoint("/chat/completions"),
      apiKey: settings.apiKey.trim(),
      model: settings.chatModel,
      system,
      user,
      onChunk,
      signal
    });
  }
}

interface StreamOptions {
  url: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
}

async function streamChatCompletion(options: StreamOptions): Promise<string> {
  if (!Platform.isDesktop) {
    throw new Error("Streaming is only supported on desktop. Please disable 'Stream Responses' in settings.");
  }

  /* eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- Obsidian's desktop runtime exposes require() for Node.js built-ins; streaming is desktop-only and guarded by Platform.isDesktop above */
  const http = require("http") as typeof import("http");
  /* eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- Obsidian's desktop runtime exposes require() for Node.js built-ins; streaming is desktop-only and guarded by Platform.isDesktop above */
  const https = require("https") as typeof import("https");

  const requestOptions: import("http").RequestOptions = {
    method: "POST",
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "User-Agent": "Obsidian-Vault-AI",
      "Authorization": `Bearer ${options.apiKey}`
    }
  };

  return new Promise<string>((resolve, reject) => {
    let req: import("http").ClientRequest;
    let idleTimeout = 0;

    const clearIdle = (): void => {
      window.clearTimeout(idleTimeout);
    };

    const resetIdleTimeout = (): void => {
      clearIdle();
      idleTimeout = window.setTimeout(() => {
        req.destroy(new Error("Stream idle timeout: no data received for 30s"));
      }, 30000);
    };

    const handleResponse = (res: import("http").IncomingMessage): void => {
      const statusCode = res.statusCode;
      if (statusCode !== undefined && (statusCode < 200 || statusCode >= 300)) {
        let errorBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          resetIdleTimeout();
          errorBody += String(chunk);
        });
        res.on("end", () => {
          clearIdle();
          reject(new Error(`API request (${statusCode}): ${errorBody || "request failed"}`));
        });
        return;
      }

      let fullContent = "";
      let buffer = "";
      res.setEncoding("utf8");

      res.on("data", (chunk) => {
        resetIdleTimeout();
        buffer += String(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

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
              options.onChunk(textChunk);
            }
          } catch {
            // Ignore incomplete SSE chunks during streaming
          }
        }
      });

      res.on("end", () => {
        clearIdle();
        resolve(fullContent);
      });

      res.on("error", (err: Error) => {
        clearIdle();
        reject(new Error(`Response error: ${err.message}`));
      });

      res.on("aborted", () => {
        clearIdle();
        reject(new Error("Response aborted by server"));
      });
    };

    if (options.url.startsWith("https://")) {
      req = https.request(options.url, requestOptions, handleResponse);
    } else {
      req = http.request(options.url, requestOptions, handleResponse);
    }

    req.on("error", (err: Error) => {
      clearIdle();
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out"));
    });

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        clearIdle();
        req.destroy(new Error("AbortError"));
      });
    }

    resetIdleTimeout();

    req.write(JSON.stringify({
      model: options.model,
      temperature: 0.2,
      stream: true,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user }
      ]
    }));
    req.end();
  });
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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("AbortError"));
      return;
    }
    const onAbort = (): void => reject(new Error("AbortError"));
    signal.addEventListener("abort", onAbort);
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
