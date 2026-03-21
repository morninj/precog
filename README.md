# Precog

An open source Chrome extension that extracts page context, assembles a prompt, and runs it in Claude.

**Website:** [precog.cc](https://precog.cc)

## Install

1. Clone this repo.
2. Open `chrome://extensions` and enable Developer mode.
3. Click "Load unpacked" and select the `src/` directory.

For best results, enable connectors in Claude for Gmail, Google Drive, Slack, Asana, and any other services relevant to the context being processed.

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
