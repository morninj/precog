# Precog

Precog is a Chrome extension that automates AI workflows across Google Workspace, Asana, Slack, and Claude. It extracts context from the app you're working in, lets you compose a prompt from modular building blocks, and sends it to Claude for processing.

## What it does

When you're viewing an email in Gmail, a task in Asana, or a message in Slack, press **Cmd+Shift+P** (configurable at `chrome://extensions/shortcuts`) to open a command palette. In Slack, you can also right-click a message and select **Precog** from the context menu. You can select from composable building blocks to construct a prompt, review and edit it, and send it to Claude. Claude then carries out the requested actions, like creating an Asana task, drafting a reply, or researching a topic.

### Building blocks

Each building block adds a set of instructions to the prompt. You can toggle them on and off to customize what Claude does.

- **Create Asana task** creates a task with a title, assignee, due date, and custom fields based on the context. Supports **Full** and **Concise** modes — concise mode limits the title to 8 words and only includes a source link in the description. You can also set a custom title via the inline "custom title" link (or press T).
- **Summarize** asks Claude to summarize the key points.
- **Identify TODOs** asks Claude to list all TODOs and next steps. Supports **List** and **Advise** modes — advise mode includes recommended approaches with confidence levels, strategic considerations, and anticipated questions.
- **Search for deep context** asks Claude to search Google Workspace and Slack for related content and include links to sources.
- **Draft a reply** (Gmail/Slack) or **Draft an email** (Asana) asks Claude to compose a message to the appropriate recipients.
- **Do deep research** enables Claude's research mode for thorough investigation.

Some blocks support **modes** that you can toggle with the left/right arrow keys when the block is focused.

### Supported contexts

Precog currently supports three contexts. In **Gmail**, it extracts the subject, sender, date, full thread body, and message IDs from the email you're viewing. In **Asana**, it extracts the task title and description, preserving markdown formatting and links. In **Slack**, it extracts the message text, sender, timestamp, channel, and permalink from a message via the context menu or keyboard shortcut.

## Installation

1. Clone this repo.
2. Open `chrome://extensions` and enable Developer mode.
3. Click "Load unpacked" and select the `src/` directory.

## Usage

1. Open an email in Gmail, a task in Asana, or a channel in Slack.
2. Press **Cmd+Shift+P** to open the command palette.
3. Toggle the building blocks you want to include.
4. Click **Quick run** (Cmd+Enter) to send the prompt directly to Claude, or **Generate prompt** (Cmd+Shift+Enter) to review and edit it first.
5. If editing, click **Send to Claude and run** (Cmd+Enter) to auto-submit, or **Send without submitting** (Cmd+Shift+Enter) to paste the prompt without submitting, which is useful if you want to add attachments or make further edits in Claude first.

## Settings

You can access settings by right-clicking the extension icon and selecting Options, or by going to `chrome://extensions`, finding Precog, and clicking Details then Extension options.

- **Email data scope** controls how much of the email body is included in the prompt.
- **Max Asana task title length** sets the word limit for auto-generated Asana task titles (default: 10).
- **Prompt building blocks** lets you customize the template text for each block.

## Project structure

```
src/
  manifest.json
  background/service-worker.js    # Message passing between content scripts
  content/
    shared.js                     # Overlay UI, block definitions, prompt assembly
    gmail.js                      # Gmail data extraction and context building
    asana.js                      # Asana data extraction and context building
    slack.js                      # Slack data extraction and context menu injection
    claude.js                     # Prompt injection into Claude.ai
    gmail.css                     # Shared overlay styles
  options/                        # Settings page
  icons/                          # Extension icons
build.sh                          # Packages src/ into a .zip for distribution
```

## Build

Running `./build.sh` creates a `.zip` file in `releases/` that can be distributed or uploaded to the Chrome Web Store.
