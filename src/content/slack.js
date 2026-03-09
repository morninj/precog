console.log('[Precog] Slack content script loaded');
(() => {
  let capturedMessageData = null;
  let precogApi = null;

  // --- DOM Extraction Helpers ---

  function findActiveMessage() {
    // The message actions toolbar is rendered inside the hovered message
    const toolbar = document.querySelector('.c-message_actions__container');
    if (toolbar) {
      const msg = toolbar.closest('.c-message_kit__message')
        || toolbar.closest('.c-virtual_list__item')
        || toolbar.closest('[data-qa="virtual-list-item"]');
      if (msg) return msg;
    }
    // Fallback: look for hovered message background
    const hovered = document.querySelector('.c-message_kit__background--hovered')
      || document.querySelector('.c-message_kit__background--highlighted');
    if (hovered) {
      return hovered.closest('.c-message_kit__message')
        || hovered.closest('[data-qa="virtual-list-item"]')
        || hovered;
    }
    return null;
  }

  function extractMessageText(msgEl) {
    if (!msgEl) return '';
    const textEl = msgEl.querySelector('[data-qa="message-text"]')
      || msgEl.querySelector('.p-rich_text_section');
    return textEl?.innerText?.trim() || '';
  }

  function extractSender(msgEl) {
    if (!msgEl) return '';
    const senderEl = msgEl.querySelector('[data-qa="message_sender_name"]')
      || msgEl.querySelector('.c-message__sender_button');
    return senderEl?.textContent?.trim() || '';
  }

  function extractTimestamp(msgEl) {
    if (!msgEl) return '';
    const tsEl = msgEl.querySelector('.c-timestamp')
      || msgEl.querySelector('[data-qa="message_timestamp"]');
    return tsEl?.getAttribute('aria-label')
      || tsEl?.textContent?.trim()
      || '';
  }

  function extractMessageLink(msgEl) {
    if (!msgEl) return '';
    const tsLink = msgEl.querySelector('a.c-timestamp')
      || msgEl.querySelector('.c-timestamp')
      || msgEl.querySelector('[data-qa="message_timestamp"]');
    if (tsLink) {
      const href = tsLink.getAttribute('href') || '';
      if (href.startsWith('/')) return window.location.origin + href;
      if (href.startsWith('http')) return href;
    }
    return window.location.href;
  }

  function extractChannelName() {
    const header = document.querySelector('[data-qa="channel_name"]')
      || document.querySelector('.p-view_header__channel_title');
    return header?.textContent?.trim() || '';
  }

  function extractFromMessageEl(msgEl) {
    if (!msgEl) return null;
    const text = extractMessageText(msgEl);
    if (!text) return null;
    return {
      text,
      sender: extractSender(msgEl),
      timestamp: extractTimestamp(msgEl),
      link: extractMessageLink(msgEl),
      channel: extractChannelName(),
    };
  }

  // --- Menu Injection ---

  function injectPrecogMenuItem(menu) {
    if (menu.querySelector('[data-qa="precog"]')) return;

    const copyLinkWrapper = menu.querySelector('[data-qa="copy_link-wrapper"]');
    if (!copyLinkWrapper) return;

    // Capture the active message now while the toolbar is still visible
    const msgEl = findActiveMessage();

    const precogWrapper = document.createElement('div');
    precogWrapper.className = 'c-menu_item__li';
    precogWrapper.setAttribute('data-qa', 'precog-wrapper');
    precogWrapper.innerHTML = `
      <button class="c-button-unstyled c-menu_item__button c-menu_item--compact" data-qa="precog" role="menuitem" tabindex="-1" type="button">
        <div class="c-menu_item__icon" data-qa="menu_item_icon" role="presentation">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true">
            <path fill="currentColor" d="M11.5 2 4 11h5l-1 7L16 9h-5z"></path>
          </svg>
        </div>
        <div class="c-menu_item__label">Precog</div>
      </button>
    `;

    // Insert after "Copy link", before "Copy message"
    copyLinkWrapper.after(precogWrapper);

    // Match Slack's hover highlighting behavior
    const btn = precogWrapper.querySelector('button');
    precogWrapper.addEventListener('mouseenter', () => {
      // Remove Slack's highlight from all other items
      menu.querySelectorAll('.c-menu_item__li--highlighted').forEach((el) => {
        if (el !== precogWrapper) {
          el.classList.remove('c-menu_item__li--highlighted');
          const b = el.querySelector('.c-menu_item__button--highlighted');
          if (b) b.classList.remove('c-menu_item__button--highlighted');
        }
      });
      precogWrapper.classList.add('c-menu_item__li--highlighted');
      btn.classList.add('c-menu_item__button--highlighted');
    });
    precogWrapper.addEventListener('mouseleave', () => {
      precogWrapper.classList.remove('c-menu_item__li--highlighted');
      btn.classList.remove('c-menu_item__button--highlighted');
    });
    // Clear our highlight when any sibling is hovered
    menu.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.c-menu_item__li');
      if (item && item !== precogWrapper) {
        precogWrapper.classList.remove('c-menu_item__li--highlighted');
        btn.classList.remove('c-menu_item__button--highlighted');
      }
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Capture message data from the DOM
      capturedMessageData = extractFromMessageEl(msgEl);

      // Close the Slack menu
      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true,
      });
      menu.dispatchEvent(escEvent);

      // If Escape didn't close it, try clicking the overlay/backdrop
      setTimeout(() => {
        const backdrop = document.querySelector('.ReactModal__Overlay');
        if (backdrop) backdrop.click();
      }, 50);

      // Wait for menu to close, then show overlay
      await new Promise((r) => setTimeout(r, 150));

      if (precogApi) precogApi.showOverlay();
    });
  }

  // Watch for Slack message action menus on any DOM mutation.
  // Slack re-renders menus via React so we check broadly rather than
  // only inspecting addedNodes.
  const observer = new MutationObserver(() => {
    document.querySelectorAll('[data-qa="menu_items"]').forEach((menu) => {
      if (!menu.querySelector('[data-qa="precog"]') && menu.querySelector('[data-qa="copy_link-wrapper"]')) {
        injectPrecogMenuItem(menu);
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // --- Context & Blocks ---

  function buildSlackContext(data) {
    const details = [
      'Slack message details:',
      `- Channel: ${data.channel}`,
      `- From: ${data.sender}`,
      `- Time: ${data.timestamp}`,
      `- Link: ${data.link}`,
      '- Message:',
      data.text,
    ];

    return {
      preamble: 'Based on the following Slack message, please complete the requirements listed below.',
      details: details.join('\n'),
    };
  }

  precogApi = initPrecog({
    source: 'slack',
    beforeShow() {
      // Called only for keyboard shortcut (context menu calls showOverlay directly).
      // Capture the hovered message now, before the overlay covers the page.
      capturedMessageData = null;
      const msgEl = findActiveMessage();
      if (msgEl) {
        capturedMessageData = extractFromMessageEl(msgEl);
      }
      if (!capturedMessageData) {
        alert('[Precog] Hover over a message or use the context menu.');
        return false;
      }
      return true;
    },
    extractData: () => capturedMessageData,
    buildContext: buildSlackContext,
    availableBlockIds: ['asana_task', 'summarize', 'identify_todos', 'deep_context', 'draft_reply', 'deep_research'],
    defaultBlockIds: ['asana_task', 'summarize', 'identify_todos'],
    noDataMessage: '[Precog] No Slack message found. Hover over a message or use the context menu first.',
  });
})();
