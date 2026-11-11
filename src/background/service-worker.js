// Holds the payload to pass to the Claude content script once the tab is ready
let pendingPayload = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'toggle-overlay',
    title: 'Open Precog',
    contexts: ['action'],
  });

  for (const [id, title] of [
    ['open-links-tabs', 'Open all links in new tabs'],
    ['open-links-windows', 'Open all links in new windows'],
    ['open-links-tabs-new-window', 'Open all links as tabs in a new window'],
  ]) {
    chrome.contextMenus.create({ id, title, contexts: ['selection'] });
  }
});

// Runs in the page: collect http(s) links from anchors in the selection,
// plus any bare URLs in the selected text.
function getSelectedLinks() {
  const sel = window.getSelection();
  const urls = [];
  if (sel) {
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      const start = range.startContainer;
      const startEl = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
      const enclosing = startEl?.closest('a[href]');
      if (enclosing) urls.push(enclosing.href);
      for (const a of document.querySelectorAll('a[href]')) {
        if (range.intersectsNode(a)) urls.push(a.href);
      }
    }
    const text = sel.toString();
    for (const m of text.matchAll(/https?:\/\/[^\s<>"'()\[\]]+/g)) {
      urls.push(m[0].replace(/[.,;:!?]+$/, ''));
    }
  }
  return [...new Set(urls.filter((u) => /^https?:/i.test(u)))];
}

async function openSelectedLinks(info, tab, mode) {
  let urls = [];
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: getSelectedLinks,
    });
    urls = result?.result || [];
  } catch (e) {
    console.warn('[Precog] Could not read selection:', e);
  }
  // Fall back to bare URLs in the selection text (e.g. on restricted pages)
  if (urls.length === 0 && info.selectionText) {
    urls = [...new Set(info.selectionText.match(/https?:\/\/[^\s<>"'()\[\]]+/g) || [])];
  }
  if (urls.length === 0) return;

  if (mode === 'tabs') {
    urls.forEach((url, i) => {
      chrome.tabs.create({ url, index: tab.index + 1 + i, openerTabId: tab.id, active: false });
    });
  } else if (mode === 'windows') {
    for (const url of urls) chrome.windows.create({ url });
  } else if (mode === 'tabs-new-window') {
    chrome.windows.create({ url: urls });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-links-tabs') return openSelectedLinks(info, tab, 'tabs');
  if (info.menuItemId === 'open-links-windows') return openSelectedLinks(info, tab, 'windows');
  if (info.menuItemId === 'open-links-tabs-new-window') return openSelectedLinks(info, tab, 'tabs-new-window');
  if (info.menuItemId === 'toggle-overlay') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' });
      }
    });
  }
});

// Forward keyboard shortcut command to active tab's content script
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-overlay') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_OVERLAY' });
      }
    });
  } else if (command === 'copy-thread-link') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'COPY_THREAD_LINK' });
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
