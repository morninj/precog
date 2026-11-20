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

  // Auto-click "Retry" when Claude's response is interrupted
  function watchForRetryButton() {
    const clicked = new WeakSet();
    const INTERRUPTED = "Claude\u2019s response was interrupted";
    const INTERRUPTED_ASCII = "Claude's response was interrupted";

    const observer = new MutationObserver(() => {
      document.querySelectorAll('button').forEach((btn) => {
        if (btn.textContent.trim() !== 'Retry') return;
        if (clicked.has(btn)) return;
        // Walk up to find an ancestor containing the interrupted-message text
        let node = btn.parentElement;
        let matched = false;
        for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
          const text = node.textContent;
          if (text && (text.includes(INTERRUPTED) || text.includes(INTERRUPTED_ASCII))) {
            matched = true;
            break;
          }
        }
        if (!matched) return;
        clicked.add(btn);
        console.log('[Precog] Auto-clicking Retry button');
        btn.click();
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------------------
  // Model/effort shorthand: at the start of a prompt, type "c" + a model
  // letter (f/o/s/h) + an effort letter (l/m/h/e/x) + space. The model and
  // effort are selected in Claude's picker and the shorthand is removed.
  // ---------------------------------------------------------------------
  const SHORTHAND_MODELS = { f: 'Fable', o: 'Opus', s: 'Sonnet', h: 'Haiku' };
  const SHORTHAND_EFFORTS = {
    l: { name: 'Low', re: /^low/i, words: 'low' },
    m: { name: 'Medium', re: /^med/i, words: 'medium|med' },
    h: { name: 'High', re: /^high/i, words: 'high' },
    e: { name: 'Extra', re: /^(extra|x-?high)/i, words: 'extra|x-?high' },
    x: { name: 'Max', re: /^max/i, words: 'max|maximum' },
  };
  const SHORTHAND_RE = /^c([fosh])([lmhex])$/;
  const MENU_ITEM_SELECTOR =
    '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"]';

  let shorthandBusy = false;
  let shorthandBuffer = '';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 600) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() >= deadline) return null;
      await sleep(40);
    }
  }

  // Dispatch the full pointer/mouse sequence — Claude's menus (Base UI) react
  // to pointerdown/mousedown, not just click.
  function press(el) {
    const r = el.getBoundingClientRect();
    const mouse = {
      bubbles: true, cancelable: true, composed: true, button: 0,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    };
    const pointer = { ...mouse, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...mouse, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', pointer));
    el.dispatchEvent(new MouseEvent('mouseup', mouse));
    el.dispatchEvent(new MouseEvent('click', mouse));
  }

  function hover(el) {
    const r = el.getBoundingClientRect();
    const init = {
      bubbles: true, cancelable: true, composed: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    };
    const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    // A move first: the menu ignores hover until it has seen the mouse move
    el.dispatchEvent(new PointerEvent('pointermove', pointer));
    el.dispatchEvent(new MouseEvent('mousemove', init));
    el.dispatchEvent(new PointerEvent('pointerover', pointer));
    el.dispatchEvent(new MouseEvent('mouseover', init));
    el.dispatchEvent(new PointerEvent('pointermove', pointer));
    el.dispatchEvent(new MouseEvent('mousemove', init));
  }

  const modelTrigger = () => document.querySelector('[data-testid="model-selector-dropdown"]');
  const isExpanded = (el) => !!el && el.getAttribute('aria-expanded') === 'true';
  const visibleMenuItems = () =>
    [...document.querySelectorAll(MENU_ITEM_SELECTOR)].filter((el) => el.getClientRects().length);
  const itemText = (el) => el.textContent.trim();

  // Read the current selection off the trigger, e.g. aria-label "Model: Opus 5.5 Medium"
  function currentSelection() {
    const trigger = modelTrigger();
    if (!trigger) return { model: '', effort: '' };
    const label = (trigger.getAttribute('aria-label') || trigger.textContent || '')
      .replace(/^Model:\s*/i, '').trim();
    const model = (trigger.querySelector('.truncate')?.textContent || '').trim();
    const effort = model && label.startsWith(model) ? label.slice(model.length).trim() : '';
    return { model: model || label, effort };
  }

  async function openModelMenu() {
    const trigger = modelTrigger();
    if (!trigger) return false;
    if (isExpanded(trigger)) return true;
    press(trigger);
    if (await waitFor(() => isExpanded(modelTrigger()))) return true;
    modelTrigger()?.click();
    return !!(await waitFor(() => isExpanded(modelTrigger())));
  }

  async function closeModelMenu() {
    for (let i = 0; i < 3 && isExpanded(modelTrigger()); i++) {
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true,
      }));
      await waitFor(() => !isExpanded(modelTrigger()), 300);
    }
  }

  const EFFORT_OPTION_SELECTOR = `${MENU_ITEM_SELECTOR}, [role="radio"]`;
  const visibleEffortOptions = () =>
    [...document.querySelectorAll(EFFORT_OPTION_SELECTOR)].filter((el) => el.getClientRects().length);

  // Open the "Effort" submenu and return the options it reveals. Submenus open
  // on hover or ArrowRight (a synthetic click is ignored), so try each in turn.
  async function openEffortSubmenu() {
    const trigger = await waitFor(
      () => visibleMenuItems().find((el) => /^effort/i.test(itemText(el))), 500
    );
    if (!trigger) return null;

    const before = new Set(visibleEffortOptions());
    const revealed = () => {
      const added = visibleEffortOptions().filter((el) => !before.has(el));
      return added.length ? added : null;
    };
    const key = (name, keyCode) => trigger.dispatchEvent(new KeyboardEvent('keydown', {
      key: name, code: name, keyCode, bubbles: true, cancelable: true,
    }));
    const attempts = [
      () => hover(trigger),
      () => { trigger.focus(); key('ArrowRight', 39); },
      () => { trigger.focus(); key('Enter', 13); },
      () => press(trigger),
    ];
    for (const attempt of attempts) {
      attempt();
      const options = await waitFor(revealed, 600);
      if (options) {
        await sleep(80); // let the rest of the submenu render
        return revealed();
      }
    }
    return null;
  }

  // Match an effort option by its label: prefer text that starts with the
  // effort name, then fall back to the name appearing as a whole word.
  function pickEffortOption(options, effort) {
    const loose = new RegExp(`\\b(${effort.words})\\b`, 'i');
    const isOtherHigh = (text) => effort.name === 'High' && /extra|x-?high/i.test(text);
    return options.find((el) => effort.re.test(itemText(el)))
      || options.find((el) => loose.test(itemText(el)) && !isOtherHigh(itemText(el)))
      || null;
  }

  function shorthandToast(message) {
    console.warn('[Precog]', message);
    const el = document.createElement('div');
    el.textContent = `Precog: ${message}`;
    el.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;' +
      'background:#262624;color:#fff;border:1px solid #555;border-radius:8px;' +
      'padding:8px 14px;font:13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function selectModelAndEffort(modelName, effort) {
    if (!modelTrigger()) return 'model selector not found';
    const modelRe = new RegExp(`^(claude\\s+)?${modelName}\\b`, 'i');
    const hasModel = () => modelRe.test(currentSelection().model);
    const hasEffort = () => effort.re.test(currentSelection().effort);

    if (!hasModel()) {
      if (!(await openModelMenu())) return 'could not open the model menu';
      // Only the models in the primary menu — never the "More models" submenu
      const item = await waitFor(
        () => visibleMenuItems().find((el) => modelRe.test(itemText(el))), 600
      );
      if (!item) return `${modelName} isn't in the model menu`;
      press(item);
      if (!(await waitFor(hasModel, 2000))) return `could not switch to ${modelName}`;
      await sleep(150); // let the picker settle on the new model's effort options
    }

    if (!hasEffort()) {
      if (!(await openModelMenu())) return 'could not open the model menu';
      const options = await openEffortSubmenu();
      if (!options) return 'could not open the Effort submenu';
      const item = pickEffortOption(options, effort);
      if (!item) {
        console.warn('[Precog] Effort options seen:', options.map(itemText));
        return `${effort.name} effort isn't available for ${modelName}`;
      }
      press(item);
      if (!(await waitFor(hasEffort, 2000))) return `could not set effort to ${effort.name}`;
    }
    return null;
  }

  async function runShorthand(editor, modelKey, effortKey) {
    shorthandBusy = true;
    shorthandBuffer = '';
    try {
      const error = await selectModelAndEffort(
        SHORTHAND_MODELS[modelKey], SHORTHAND_EFFORTS[effortKey]
      );
      if (error) shorthandToast(error);
    } catch (err) {
      shorthandToast(err.message);
    } finally {
      await closeModelMenu();
      // Closing the menu returns focus to its trigger; take it back.
      await sleep(50);
      editor.focus();
      shorthandBusy = false;
      // Replay anything typed while the menu had focus
      if (shorthandBuffer) document.execCommand('insertText', false, shorthandBuffer);
      shorthandBuffer = '';
    }
  }

  function textBeforeCaret(editor) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed || !editor.contains(sel.anchorNode)) return null;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString();
  }

  function onShorthandKeydown(e) {
    if (!e.isTrusted || e.metaKey || e.ctrlKey || e.altKey) return;

    // While the picker is being driven, keep keystrokes away from the open
    // menu and hold on to them so fast typing isn't lost.
    if (shorthandBusy) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key.length === 1) shorthandBuffer += e.key;
      else if (e.key === 'Backspace') shorthandBuffer = shorthandBuffer.slice(0, -1);
      return;
    }

    if (e.key !== ' ' || e.isComposing || e.shiftKey) return;
    const editor = e.target instanceof Element && e.target.closest('[data-testid="chat-input"]');
    if (!editor) return;
    const match = SHORTHAND_RE.exec(textBeforeCaret(editor) || '');
    if (!match) return;

    // Swallow the space and delete the three shorthand characters
    e.preventDefault();
    e.stopImmediatePropagation();
    const sel = window.getSelection();
    for (let i = 0; i < match[0].length; i++) sel.modify('extend', 'backward', 'character');
    document.execCommand('delete');

    runShorthand(editor, match[1], match[2]);
  }

  window.addEventListener('keydown', onShorthandKeydown, true);

  if (document.readyState === 'complete') {
    checkForPendingData();
    watchForContinueButton();
    watchForRetryButton();
  } else {
    window.addEventListener('load', () => {
      checkForPendingData();
      watchForContinueButton();
      watchForRetryButton();
    });
  }
})();
