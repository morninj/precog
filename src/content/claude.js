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

  async function enableResearchMode() {
    try {
      // Look for the Research toggle — it's a menuitemcheckbox with "Research" text
      // First, we need to open the model/features menu
      // The research toggle is inside a dropdown that may need to be opened
      const researchToggle = await findResearchToggle();
      if (!researchToggle) {
        console.warn('[Precog] Could not find Research toggle');
        return;
      }

      const isChecked = researchToggle.getAttribute('aria-checked') === 'true';
      if (!isChecked) {
        researchToggle.click();
        console.log('[Precog] Enabled Research mode');
        // Wait for the UI to update
        await new Promise((r) => setTimeout(r, 500));
      } else {
        console.log('[Precog] Research mode already enabled');
      }
    } catch (err) {
      console.warn('[Precog] Failed to enable Research mode:', err.message);
    }
  }

  async function findResearchToggle() {
    // The Research toggle is a menuitemcheckbox inside a dropdown.
    // Try to find it directly first (dropdown may already be open).
    let toggle = findResearchCheckbox();
    if (toggle) return toggle;

    // Look for the button that opens the model picker/features menu.
    // It's typically near the chat input area.
    const buttons = document.querySelectorAll('button[aria-haspopup="menu"], button[aria-haspopup="dialog"]');
    for (const btn of buttons) {
      // Click to open the menu
      btn.click();
      await new Promise((r) => setTimeout(r, 300));

      toggle = findResearchCheckbox();
      if (toggle) return toggle;

      // Close if this wasn't the right menu
      btn.click();
      await new Promise((r) => setTimeout(r, 100));
    }

    return null;
  }

  function findResearchCheckbox() {
    // Find menuitemcheckbox elements that contain "Research" text
    const items = document.querySelectorAll('[role="menuitemcheckbox"]');
    for (const item of items) {
      if (item.textContent.trim().includes('Research')) {
        return item;
      }
    }
    return null;
  }

  async function injectPrompt(prompt, settings, options = {}) {
    try {
      if (options.enableResearch) {
        await enableResearchMode();
      }

      const input = await waitForElement('div[data-testid="chat-input"]');

      input.focus();

      // Clear any existing content
      input.innerHTML = '<p><br></p>';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Use execCommand to insert text — this triggers tiptap's input handling
      // so it properly registers the content (unlike innerHTML which bypasses it)
      document.execCommand('insertText', false, prompt);

      if (settings.promptEntry === 'auto-submit') {
        // Wait for the send button to become enabled — this means tiptap
        // has fully registered the inserted text and the UI is ready.
        const sendBtn = await waitForElement('button[aria-label="Send Message"]', 15000)
          .catch(() => null);

        if (sendBtn) {
          let attempts = 0;
          while (sendBtn.disabled && attempts < 20) {
            await new Promise((r) => setTimeout(r, 250));
            attempts++;
          }
        }

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
        const { prompt, enableResearch, promptEntry, source } = response;
        injectPrompt(prompt, { promptEntry: promptEntry || 'auto-submit' }, { enableResearch });
        if (source === 'gmail') watchForAsanaActions();
      }
    });
  }

  if (document.readyState === 'complete') {
    checkForPendingData();
  } else {
    window.addEventListener('load', checkForPendingData);
  }
})();
