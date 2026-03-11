# Precog

Precog is a Chrome extension that automates AI workflows on any webpage, with deep integrations for Gmail, Asana, Slack, and Claude. It extracts context from the page you're on, lets you compose a prompt from modular building blocks, and sends it to Claude for processing.

## What it does

Press **Cmd+Shift+P** (configurable at `chrome://extensions/shortcuts`) on any webpage to open the command palette. Precog extracts context from the current page and lets you select building blocks to construct a prompt. In Slack, you can also right-click a message and select **Precog** from the context menu.

On supported platforms (Gmail, Asana, Slack), Precog uses site-specific extraction to capture structured data like email threads, task descriptions, and message details. On any other page, it captures the page title, URL, and either your selected text or the page content.

### Building blocks

Each building block adds a set of instructions to the prompt. You can toggle them on and off to customize what Claude does.

- **Create Asana task** creates a task with a title, assignee, due date, and custom fields based on the context. Supports **Full** and **Concise** modes — concise mode limits the title to 8 words and only includes a source link in the description. You can also set a custom title via the inline "custom title" link (or press T).
- **Summarize** asks Claude to summarize the key points.
- **Identify TODOs** asks Claude to list all TODOs and next steps. Supports **List** and **Advise** modes — advise mode includes recommended approaches with confidence levels, strategic considerations, and anticipated questions.
- **Search for deep context** asks Claude to search Google Workspace and Slack for related content and include links to sources.
- **Draft a reply** (Gmail/Slack) or **Draft an email** (Asana) asks Claude to compose a message to the appropriate recipients.
- **Do deep research** enables Claude's research mode for thorough investigation.

Some blocks support **modes** that you can toggle with the left/right arrow keys when the block is focused.

### Supported platforms

Precog works on any webpage with generic extraction. It also has deep integrations for specific platforms:

- **Gmail** extracts the subject, sender, date, full thread body, and message IDs from the email you're viewing.
- **Asana** extracts the task title and description, preserving markdown formatting and links.
- **Slack** extracts the message text, sender, timestamp, channel, and permalink from a message via the context menu or keyboard shortcut.
- **Any other page** extracts the page title, URL, and selected text (or page content up to a configurable limit).

## Installation

1. Clone this repo.
2. Open `chrome://extensions` and enable Developer mode.
3. Click "Load unpacked" and select the `src/` directory.

## Usage

1. Navigate to any webpage.
2. Press **Cmd+Shift+P** to open the command palette.
3. Toggle the building blocks you want to include.
4. Click **Quick run** (Cmd+Enter) to send the prompt directly to Claude, or **Generate prompt** (Cmd+Shift+Enter) to review and edit it first.
5. If editing, click **Send to Claude and run** (Cmd+Enter) to auto-submit, or **Send without submitting** (Cmd+Shift+Enter) to paste the prompt without submitting, which is useful if you want to add attachments or make further edits in Claude first.

## Settings

You can access settings by right-clicking the extension icon and selecting Options, or by going to `chrome://extensions`, finding Precog, and clicking Details then Extension options.

- **Email data scope** controls how much of the email body is included in the prompt.
- **Max Asana task title length** sets the word limit for auto-generated Asana task titles (default: 10).
- **Max page content length** sets the character limit for page content on generic webpages (default: 20,000). Does not apply when text is selected.
- **Prompt building blocks** lets you customize the template text for each block.

## Architecture

Precog uses a modular architecture. A universal content script loads on every page, and a loader selects the appropriate module based on the hostname. Site-specific modules provide deep extraction for known platforms, while a generic module handles any other page.

```
src/
  manifest.json
  background/service-worker.js    # Message passing between content scripts
  content/
    shared.js                     # Overlay UI, block definitions, prompt assembly
    loader.js                     # Module dispatcher (selects by hostname)
    generic.js                    # Generic webpage extraction (any page)
    gmail.js                      # Gmail-specific extraction
    asana.js                      # Asana-specific extraction
    slack.js                      # Slack-specific extraction and context menu
    claude.js                     # Prompt injection into Claude.ai
    precog.css                    # Shared overlay styles
  options/                        # Settings page
  icons/                          # Extension icons
build.sh                          # Packages src/ into a .zip for distribution
```

To add a new platform module, create a new file following the module registration pattern, add it to the manifest's JS array, and register it in the loader.

## Build

Running `./build.sh` creates a `.zip` file in `releases/` that can be distributed or uploaded to the Chrome Web Store.
