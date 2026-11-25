importScripts('quick-task.js');

// Holds the payload to pass to the Claude content script once the tab is ready
let pendingPayload = null;

chrome.runtime.onInstalled.addListener(() => {
  // Menu items survive extension updates, and re-creating an existing ID
  // fails, leaving the old definition in place. Clear them first so changes
  // to an item (such as its contexts) take effect.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'toggle-overlay',
      title: 'Open Precog',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'copy-window-urls',
      title: 'Copy URLs of all tabs in this window',
      contexts: ['action', 'page'],
    });

    for (const [id, title] of [
      ['open-links-tabs', 'Open all links in new tabs'],
      ['open-links-windows', 'Open all links in new windows'],
      ['open-links-tabs-new-window', 'Open all links as tabs in a new window'],
    ]) {
      chrome.contextMenus.create({ id, title, contexts: ['selection'] });
    }
  });
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
  // The context menu says which frame was clicked. The keyboard shortcut
  // doesn't, so read the top frame and then every frame, as separate calls:
  // one frame the extension can't script must not lose the others' results.
  const targets =
    info.frameId != null
      ? [{ tabId: tab.id, frameIds: [info.frameId] }]
      : [{ tabId: tab.id }, { tabId: tab.id, allFrames: true }];
  const found = [];
  for (const target of targets) {
    try {
      const results = await chrome.scripting.executeScript({ target, func: getSelectedLinks });
      for (const r of results) found.push(...(r?.result || []));
    } catch (e) {
      console.warn('[Precog] Could not read selection:', e);
    }
  }
  let urls = [...new Set(found)];
  // Fall back to bare URLs in the selection text (e.g. on restricted pages)
  if (urls.length === 0 && info.selectionText) {
    urls = [...new Set(info.selectionText.match(/https?:\/\/[^\s<>"'()\[\]]+/g) || [])];
  }
  if (urls.length === 0) {
    console.warn('[Precog] No links found in the selection.');
    return;
  }

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

// Runs in the page: put text on the clipboard and confirm with a toast.
// Self-contained (inline styles) because it also runs on pages where the
// Precog stylesheet isn't loaded, such as claude.ai.
async function copyTextInPage(text, message) {
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The async clipboard API refuses when the page isn't focused, which is
    // the usual case right after using the toolbar menu
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ok = document.execCommand('copy');
    ta.remove();
  }
  const toast = document.createElement('div');
  toast.textContent = ok ? message : 'Could not copy to the clipboard';
  toast.style.cssText =
    'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;' +
    'border-radius:8px;background:#1a1a2e;color:#fff;z-index:2147483647;pointer-events:none;' +
    "font:500 14px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    'box-shadow:0 8px 24px rgba(0,0,0,0.3);';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
  return ok;
}

// Ask a Gmail tab's content script for the Claude-friendly link to its open
// thread. Resolves to null if no thread is open or the tab doesn't answer
// (e.g. it was discarded to save memory, so no content script is running).
function getGmailThreadLink(tabId) {
  const ask = chrome.tabs
    .sendMessage(tabId, { type: 'GET_THREAD_LINK' })
    .then((res) => res?.link || null)
    .catch(() => null);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 1000));
  return Promise.race([ask, timeout]);
}

async function copyWindowUrls(tab) {
  // Tab URLs are only visible with the "tabs" permission. It's optional, so
  // Chrome asks on first use; this call has to come before any await to stay
  // inside the click's user gesture.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ permissions: ['tabs'] });
  } catch (e) {
    console.warn('[Precog] Could not request the tabs permission:', e);
  }

  if (!granted) {
    console.warn('[Precog] Tab URLs not copied: the tabs permission was not granted.');
    return;
  }

  // Older Chrome versions don't pass the tab to keyboard-command listeners
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  const urls = await Promise.all(
    tabs.map(async (t) => {
      const url = t.url || t.pendingUrl || '';
      if (url.startsWith('https://mail.google.com/')) {
        return (await getGmailThreadLink(t.id)) || url;
      }
      return url;
    })
  );
  const list = urls.filter(Boolean);
  const message = `Copied ${list.length} tab URL${list.length === 1 ? '' : 's'}`;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: copyTextInPage,
      args: [list.join('\n'), message],
    });
  } catch (e) {
    // Chrome doesn't allow scripts on its own pages (new tab, settings, the
    // Web Store), so there is nowhere to copy from
    console.warn('[Precog] Could not copy tab URLs from this page:', e);
  }
}

// Send a message to the tab's content script, injecting the scripts first if
// none is listening. Chrome doesn't add content scripts to tabs that were
// already open when the extension was installed, updated or reloaded, and the
// old copies in those tabs can no longer receive messages, so without this a
// shortcut silently does nothing until the page is refreshed.
async function sendToContentScript(tab, message) {
  // Older Chrome versions don't pass the tab to keyboard-command listeners
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return;
  } catch (e) {
    if (!String(e?.message).includes('Receiving end does not exist')) return;
  }

  const [scripts] = chrome.runtime.getManifest().content_scripts;
  try {
    const target = { tabId: tab.id };
    if (scripts.css?.length) await chrome.scripting.insertCSS({ target, files: scripts.css });
    await chrome.scripting.executeScript({ target, files: scripts.js });
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    // Chrome's own pages (new tab, settings, the Web Store) don't allow scripts
    console.warn('[Precog] Could not reach the page for this shortcut:', e);
  }
}

async function openSelectedLinksFromShortcut(tab) {
  // Older Chrome versions don't pass the tab to keyboard-command listeners
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) openSelectedLinks({}, tab, 'tabs-new-window');
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'copy-window-urls') return copyWindowUrls(tab);
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
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'create-asana-task') {
    createQuickAsanaTask(tab);
  } else if (command === 'copy-window-urls') {
    copyWindowUrls(tab);
  } else if (command === 'open-links-tabs-new-window') {
    openSelectedLinksFromShortcut(tab);
  } else if (command === 'toggle-overlay') {
    sendToContentScript(tab, { type: 'TOGGLE_OVERLAY' });
  } else if (command === 'copy-thread-link') {
    sendToContentScript(tab, { type: 'COPY_THREAD_LINK' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The in-page bar asking whether this page already has an Asana task
  if (message.type === 'FIND_PAGE_TASKS') {
    findTasksForPage(message).then(sendResponse);
    return true;
  }

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
