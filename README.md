# Nara Memory

Local vault memory and context-aware AI chat for Obsidian.

Nara Memory indexes Markdown notes locally, retrieves relevant passages when you ask a question, and sends only the chat request and selected context to the OpenAI-compatible provider that you configure.

## Features

- Local Markdown indexing and semantic-style retrieval without an external database.
- Context-aware chat grounded in relevant notes from your vault.
- Support for any OpenAI-compatible API, including OpenAI, OpenRouter, Groq, LM Studio, and self-hosted services.
- Attach specific Markdown files or send selected text to a chat.
- Rebuild, update, and clear the local memory index.
- Saved chat sessions and English/Persian interface support.

## Install

### From the Community plugins directory

Once accepted, open **Settings → Community plugins**, search for **Nara Memory**, then install and enable it.

### Manually from GitHub

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release.
2. Create this folder in your vault:

   ```text
   <vault>/.obsidian/plugins/vault-ai-chat/
   ```

3. Copy the three files into that folder.
4. Reload Obsidian and enable **Nara Memory** in **Settings → Community plugins**.

## Setup and use

1. Open **Nara Memory** from the ribbon icon or Command Palette.
2. In the plugin settings, set your API base URL, API key, and chat model.
3. Rebuild the vault memory index.
4. Ask a question in the chat panel, or use **Analyze current file** / **Send selection to chat** from the Command Palette.

## Privacy and network use

- The index, indexed note chunks, settings, and chat history are stored locally in Obsidian plugin data.
- The plugin connects to the API base URL that you configure. It uses that endpoint to list models and process chat or analysis requests.
- When you send a chat or analysis request, the request includes your prompt and the relevant note excerpts, selected text, or explicitly attached files needed as context. Do not configure a provider you do not trust with that content.
- Your API key is stored in the plugin's local data and sent only as a Bearer token to your configured API provider.
- The plugin has no built-in telemetry, advertising, or payment service.

## Development

```powershell
npm install
npm run build
```

Release assets are `main.js`, `manifest.json`, and `styles.css`. Create a GitHub release with a tag exactly matching the version in `manifest.json`, then attach those three files.

## License

Licensed under the [MIT License](./LICENSE).
