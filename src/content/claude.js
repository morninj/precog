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

      // Clear any existing content
      input.innerHTML = '<p><br></p>';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Use execCommand to insert text — this triggers tiptap's input handling
      // so it properly registers the content (unlike innerHTML which bypasses it)
      document.execCommand('insertText', false, prompt);

      if (settings.promptEntry === 'auto-submit') {
        // Wait for tiptap to fully process the text
        await new Promise((r) => setTimeout(r, 1500));

        // Try submitting via Enter key on the input (how users actually submit)
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true,
        }));
        console.log('[Precog] Dispatched Enter key to submit');
      }
    } catch (err) {
      console.error('[Precog]', err.message);
    }
  }

  function watchForAsanaActions() {
    const clicked = new Set();
    const opened = new Set();

    const observer = new MutationObserver(() => {
      // Click "Create task", "View in Asana", and similar action buttons
      document.querySelectorAll('button').forEach((btn) => {
        const text = btn.textContent.trim().toLowerCase();
        if (
          (text.includes('create task') ||
            text.includes('view in asana') ||
            text.includes('open in asana')) &&
          !clicked.has(btn)
        ) {
          clicked.add(btn);
          // Delay to ensure the button is fully rendered and functional
          setTimeout(() => {
            if (btn.isConnected) {
              console.log('[Precog] Clicking button:', btn.textContent.trim());
              btn.click();
            }
          }, 1000);
        }
      });

      // Also open Asana links directly
      document.querySelectorAll('a[href*="app.asana.com"]').forEach((link) => {
        const href = link.href;
        if (href && !opened.has(href)) {
          opened.add(href);
          setTimeout(() => {
            if (link.isConnected) {
              console.log('[Precog] Opening Asana link:', href);
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
            watchForAsanaActions();
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
