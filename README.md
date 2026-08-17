# Vault AI Assistant (Obsidian Plugin)

Vault AI Assistant (formerly Nara Memory) is a powerful Obsidian plugin that integrates local vector memory and advanced AI chat directly into your vault. It works with **any OpenAI-compatible API** (such as OpenAI, local LM Studio, Groq, OpenRouter, etc.).

## Features
- **OpenAI Compatible**: Connect to any AI provider that supports the standard OpenAI `/v1` endpoints.
- **Local Semantic Memory**: The plugin locally indexes your Obsidian vault in chunks and stores them in a memory database. No external databases are required.
- **Context-Aware AI Chat**: Ask questions, and the plugin will retrieve relevant notes from your memory index and feed them into the chat context.
- **Attachments**: Manually attach specific Markdown files from your vault to any conversation.
- **Multi-language UI**: Switch the plugin UI between English (`en`) and Persian (`fa`) seamlessly from the settings.
- **Session Management**: Automatically saves your chat histories and allows you to switch between previous sessions.

## Installation

### Manual Installation
1. Go to the [Releases](#) page of this repository.
2. Download the latest `main.js`, `manifest.json`, and `styles.css`.
3. Create a folder named `vault-ai-chat` inside your `.obsidian/plugins/` directory.
4. Place the downloaded files into that folder.
5. Reload Obsidian and enable the plugin from `Settings -> Community Plugins`.

### Using BRAT (Obsidian42-BRAT)
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat).
2. Open the command palette and run `BRAT: Add a beta plugin for testing`.
3. Enter the URL of this GitHub repository.
4. Enable the plugin in the Community Plugins tab.

## Configuration

Go to the Vault AI Assistant settings page to configure the plugin:
1. **Language / زبان**: Choose your preferred UI language.
2. **API Base URL**: Enter the URL of your provider (e.g. `https://api.openai.com/v1`, or `http://localhost:1234/v1` for LM Studio).
3. **API Key**: Your API key (if required by your provider).
4. **Chat Model**: Click `Test Connection` to automatically fetch available models, then select the one you wish to use from the dropdown.

## Publishing to Obsidian Community Plugins
If you wish to publish this plugin to the official community directory:
1. Fork the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository.
2. Clone your fork locally.
3. Open `community-plugins.json` and add your plugin's information in alphabetical order:
   ```json
   {
     "id": "vault-ai-chat",
     "name": "Vault AI Assistant",
     "author": "Your Name",
     "description": "Private vault memory, semantic search, and AI chat using any OpenAI-compatible API.",
     "repo": "puriakazemieh/vault-ai-assistant-obsidian"
   }
   ```
4. Commit your changes and push to your fork.
5. Open a Pull Request on the official `obsidian-releases` repository. The Obsidian team will review it. Ensure that your GitHub repository has a valid release containing the `main.js`, `manifest.json`, and `styles.css` files.
