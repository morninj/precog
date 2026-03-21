# Privacy Policy

**Last updated:** March 21, 2026

Precog is an open source Chrome extension. This policy explains how it handles your data.

## What Precog accesses

Precog reads content from the current page when you explicitly trigger it via keyboard shortcut or context menu. On supported platforms (Gmail, Asana, Slack), this includes email subjects, message bodies, task descriptions, sender names, timestamps, and links. On any other page, it reads the page title, URL, and selected text or page content.

Content scripts run on all http and https pages to enable the keyboard shortcut and context menu. No page data is read or transmitted until the user triggers the extension.

## Where your data goes

Page content is sent only to Claude (claude.ai) when you choose to send a prompt. Precog does not send data anywhere else. There are no analytics, telemetry, or third-party services.

## What Precog stores

Precog stores user preferences (email data scope, Asana task title length, page content character limit, and custom block templates) using Chrome's built-in sync storage. No personal data or page content is stored.

## Permissions

- **activeTab**: Reads the content of the current page when the user activates the extension.
- **storage**: Saves user preferences in Chrome's sync storage.
- **tabs**: Opens a Claude tab to deliver the assembled prompt and detects whether one is already open to avoid duplicates.
- **tabGroups**: Groups the source page tab with the Claude tab for easy navigation.

## Host permissions

Content scripts match all http and https URLs so the extension can be activated on any page. On claude.ai, a separate content script delivers the assembled prompt. No data is accessed until the user explicitly triggers the extension.

## Open source

Precog's source code is publicly available at https://github.com/morninj/precog. You can inspect exactly what the extension does.

## Contact

For questions or concerns, open an issue at https://github.com/morninj/precog/issues.
