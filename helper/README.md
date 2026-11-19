# Precog helper (macOS)

An optional companion for the quick Asana task feature. By default Precog calls the Anthropic API straight from the browser. Some Anthropic organizations don't allow browser requests (for example, those with custom data-retention settings), and you may prefer not to keep an API key in the browser at all. With the helper, Chrome starts a small local script that makes the call instead, and the key lives in your macOS Keychain.

The helper uses Chrome's native messaging: there is no background process and no open network port. Chrome launches the script for each request, and only the extension IDs you allow can talk to it.

## Install

1. Register the helper with Chrome. Add your extension's ID (from `chrome://extensions`) if you're running an unpacked build; the Chrome Web Store build is always allowed.

   ```
   helper/install.sh [extension-id]
   ```

2. Store your Anthropic API key in the Keychain. You'll be prompted for the key; it isn't echoed.

   ```
   security add-generic-password -U -a "$USER" -s precog-anthropic-api-key -w
   ```

3. In Precog's settings, set "Claude connection" to "Local helper" and click Save. Chrome asks once for permission to communicate with native applications.

Requires `/usr/bin/python3`, which ships with Apple's Command Line Tools. No packages are installed.

## Remove

```
rm "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/cc.precog.helper.json"
security delete-generic-password -s precog-anthropic-api-key
```
