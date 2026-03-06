(() => {
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`[Precog] Timed out waiting for ${selector}`));
      }, timeout);
    });
  }

  async function injectPrompt(prompt, settings) {
    try {
      const input = await waitForElement('div[data-testid="chat-input"]');

      input.focus();

      // Set content as paragraphs (tiptap expects <p> elements)
      input.innerHTML = prompt
        .split('\n')
        .map((line) => `<p>${line || '<br>'}</p>`)
        .join('');

      input.dispatchEvent(new Event('input', { bubbles: true }));

      if (settings.promptEntry === 'auto-submit') {
        setTimeout(() => {
          const sendButton = document.querySelector('button[aria-label="Send message"]');
          if (sendButton) {
            sendButton.click();
          }
        }, 500);
      }
    } catch (err) {
      console.error('[Precog]', err.message);
    }
  }

  function watchForAsanaLinks() {
    const opened = new Set();

    const observer = new MutationObserver(() => {
      const links = document.querySelectorAll('a[href*="app.asana.com"]');
      links.forEach((link) => {
        const href = link.href;
        if (href && !opened.has(href)) {
          opened.add(href);
          // Wait a moment to avoid opening mid-stream — check again to confirm it's stable
          setTimeout(() => {
            if (document.querySelector(`a[href="${CSS.escape(href)}"]`)) {
              window.open(href, '_blank');
            }
          }, 2000);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function checkForPendingData() {
    chrome.runtime.sendMessage({ type: 'CLAUDE_READY' }, (response) => {
      if (chrome.runtime.lastError) {
        setTimeout(checkForPendingData, 500);
        return;
      }

      if (response && response.type === 'INJECT_PROMPT') {
        chrome.storage.sync.get(
          { promptEntry: 'auto-submit' },
          (settings) => {
            injectPrompt(response.prompt, settings);
            watchForAsanaLinks();
          }
        );
      }
    });
  }

  if (document.readyState === 'complete') {
    checkForPendingData();
  } else {
    window.addEventListener('load', checkForPendingData);
  }
})();
