// Holds the prompt to pass to the Claude content script once the tab is ready
let pendingPrompt = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_TO_CLAUDE') {
    pendingPrompt = message.payload.prompt;
    chrome.tabs.create({ url: 'https://claude.ai/new' });
  }

  if (message.type === 'CLAUDE_READY') {
    if (pendingPrompt) {
      sendResponse({ type: 'INJECT_PROMPT', prompt: pendingPrompt });
      pendingPrompt = null;
    }
    return true;
  }
});
