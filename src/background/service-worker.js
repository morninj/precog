// Holds the payload to pass to the Claude content script once the tab is ready
let pendingPayload = null;

// Forward keyboard shortcut command to active tab's content script
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-overlay') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_TO_CLAUDE') {
    pendingPayload = message.payload;
    const sourceTabId = sender.tab?.id;

    if (sourceTabId && message.payload.source === 'gmail') {
      // Duplicate the Gmail tab and group it with the new Claude tab
      chrome.tabs.duplicate(sourceTabId, (dupTab) => {
        chrome.tabs.create({ url: 'https://claude.ai/new' }, (claudeTab) => {
          chrome.tabs.group({ tabIds: [dupTab.id, claudeTab.id] }, (groupId) => {
            chrome.tabGroups.update(groupId, { title: 'Precog', color: 'purple' });
          });
        });
      });
    } else {
      chrome.tabs.create({ url: 'https://claude.ai/new' });
    }
  }

  if (message.type === 'CLAUDE_READY') {
    if (pendingPayload) {
      sendResponse({ type: 'INJECT_PROMPT', ...pendingPayload });
      pendingPayload = null;
    }
    return true;
  }
});
