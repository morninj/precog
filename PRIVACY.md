# Privacy Policy

**Last updated:** November 18, 2026

Precog is an open source Chrome extension. This policy explains how it handles your data.

## What Precog accesses

Precog reads content from the current page when you explicitly trigger it via keyboard shortcut or context menu. On supported platforms (Gmail, Asana, Slack), this includes email subjects, message bodies, task descriptions, sender names, timestamps, and links. On any other page, it reads the page title, URL, and selected text or page content.

Content scripts run on all http and https pages to enable the keyboard shortcut and context menu. No page data is read or transmitted until the user triggers the extension.

## Where your data goes

Page content is sent to Claude (claude.ai) when you choose to send a prompt. If you set up the optional quick Asana task feature, then each time you press its shortcut, the current page's content is sent to the Anthropic API (to draft the task) using your own API key, either directly or through the optional local helper described below, and the drafted task (title, a one-line summary, and the page link) is sent to the Asana API using your own access token. Before creating the task, Precog searches your Asana workspace for an existing task that mentions the page (its link, or for a Gmail thread its thread IDs) so it can warn you about duplicates. Unless you turn it off, Precog also runs that search when you open a Gmail thread, to show a bar linking to any existing task. The addresses of other pages are sent to Asana only when you press the shortcut. Precog does not send data anywhere else. There are no analytics, telemetry, or Precog servers.

## What Precog stores

Precog stores user preferences (email data scope, Asana task title length, page content character limit, and custom block templates) using Chrome's built-in sync storage. No page content is stored. If you set up the quick Asana task feature, your Asana access token, Anthropic API key, chosen workspace, and task style guide are stored in Chrome's local storage on this device (not synced) and are sent only to Asana and Anthropic respectively. If you use the optional local helper, the Anthropic API key is kept in your macOS Keychain instead of in the browser.

## Permissions

- **activeTab**: Reads the content of the current page when the user activates the extension.
- **contextMenus**: Adds right-click menu items for opening Precog, for copying the URLs of the tabs in a window, and for opening all links in selected text.
- **scripting**: When the user chooses a link-opening item from the right-click menu or presses its keyboard shortcut, reads the links in the current text selection so they can be opened. Nothing is stored or transmitted.
- **storage**: Saves user preferences in Chrome's sync storage.
- **nativeMessaging** (optional, requested only if you choose the local helper for quick Asana tasks): Lets Precog hand the Claude request to a helper script you install on your own computer, which calls the Anthropic API. Nothing else is exchanged with it.
- **tabs** (optional, requested the first time it is needed): When the user chooses "Copy URLs of all tabs in this window" from a right-click menu or presses its keyboard shortcut, reads the URLs of the tabs in that window and copies them to the clipboard. Nothing is stored or transmitted.

## Host permissions

Content scripts match all http and https URLs so the extension can be activated on any page. On claude.ai, a separate content script delivers the assembled prompt. No data is accessed until the user explicitly triggers the extension, except that once you have set up quick Asana tasks, the page identifiers described above are looked up in Asana to show the existing-task bar (Gmail threads only; this can be turned off). Access to app.asana.com and api.anthropic.com is optional and is requested only when you set up the quick Asana task feature; it is used solely to call those two APIs.

## Open source

Precog's source code is publicly available at https://github.com/morninj/precog. You can inspect exactly what the extension does.

## Contact

For questions or concerns, open an issue at https://github.com/morninj/precog/issues.
