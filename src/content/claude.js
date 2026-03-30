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
      if (isChecked) {
        console.log('[Precog] Research mode already enabled');
      } else {
        researchToggle.click();
        console.log('[Precog] Enabled Research mode');
        await new Promise((r) => setTimeout(r, 500));
      }
      // Close the menu if still open
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.warn('[Precog] Failed to enable Research mode:', err.message);
    }
  }

  function findResearchItem() {
    // Look for any menu item containing "Research" text
    const selectors = '[role="menuitemcheckbox"], [role="menuitem"], [data-testid*="research"]';
    for (const item of document.querySelectorAll(selectors)) {
      const text = item.textContent.trim();
      if (text === 'Research' || text.startsWith('Research')) {
        return item;
      }
    }
    return null;
  }

  async function findResearchToggle() {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Check if already visible
      let toggle = findResearchItem();
      if (toggle) return toggle;

      // Find and click the "+" / "Toggle menu" button near the chat input
      const menuBtn = document.querySelector('button[aria-label="Toggle menu"]')
        || document.querySelector('button[aria-haspopup="menu"]');
      if (menuBtn) {
        menuBtn.click();
        await new Promise((r) => setTimeout(r, 500));

        toggle = findResearchItem();
        if (toggle) return toggle;

        // Close if Research wasn't found
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise((r) => setTimeout(r, 200));
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    return null;
  }

  async function injectPrompt(prompt, settings, options = {}) {
    try {
      const input = await waitForElement('div[data-testid="chat-input"]');

      // Enable research mode before injecting text (so button clicks don't disrupt input)
      if (options.enableResearch) {
        await enableResearchMode();
        // Re-focus input after research mode toggling may have shifted focus
        input.focus();
        await new Promise((r) => setTimeout(r, 300));
      }

      input.focus();

      // Clear any existing content
      input.innerHTML = '<p><br></p>';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Use execCommand to insert text — this triggers tiptap's input handling
      // so it properly registers the content (unlike innerHTML which bypasses it)
      document.execCommand('insertText', false, prompt);

      if (settings.promptEntry === 'auto-submit') {
        // Give tiptap time to process the inserted text
        await new Promise((r) => setTimeout(r, 2000));

        // Then wait for the send button to be enabled (in case UI is still loading)
        let attempts = 0;
        while (attempts < 20) {
          const sendBtn = document.querySelector('button[aria-label="Send message"]');
          if (sendBtn && !sendBtn.disabled) break;
          await new Promise((r) => setTimeout(r, 500));
          attempts++;
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

  // Auto-click "Continue" when Claude reaches its tool-use limit
  function watchForContinueButton() {
    const clicked = new WeakSet();

    const observer = new MutationObserver(() => {
      document.querySelectorAll('[data-testid="message-warning"]').forEach((warning) => {
        if (!warning.textContent.includes('tool-use limit')) return;
        const btn = warning.querySelector('button');
        if (btn && !clicked.has(btn)) {
          clicked.add(btn);
          console.log('[Precog] Auto-clicking Continue button');
          btn.click();
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete') {
    checkForPendingData();
    watchForContinueButton();
  } else {
    window.addEventListener('load', () => {
      checkForPendingData();
      watchForContinueButton();
    });
  }
})();
