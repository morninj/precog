// Holds the payload to pass to the Claude content script once the tab is ready
let pendingPayload = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_TO_CLAUDE') {
    pendingPayload = message.payload;
    chrome.tabs.create({ url: 'https://claude.ai/new' });
  }

  if (message.type === 'CLAUDE_READY') {
    if (pendingPayload) {
      sendResponse({ type: 'INJECT_PROMPT', ...pendingPayload });
      pendingPayload = null;
    }
    return true;
  }
});
