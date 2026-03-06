(() => {
  const BASE_REQUIREMENTS = `- Title should be in the imperative mood, like a good git commit message (e.g. "Review contract from Acme Corp", "Schedule follow-up with Sarah")
- Assign the task to me
- Set the due date to today ({today})
- Include the link to the original email at the very top of the description`;

  const EMAIL_DETAILS = `Email details:
- Subject: {subject}
- From: {sender}
- Date: {date}
- Link: {url}
- Body:
{body}`;

  const DEFAULT_PROMPT_TEMPLATE = `Based on the following email, create an Asana task.

Requirements:
${BASE_REQUIREMENTS}
- Description should summarize the key points and list any TODO items

${EMAIL_DETAILS}`;

  const DEFAULT_DEEP_CONTEXT_TEMPLATE = `Based on the following email, create an Asana task with full context.

Requirements:
${BASE_REQUIREMENTS}
- Search Gmail for all related email threads with this sender and on this topic. Include links to relevant threads.
- Search Google Drive for any related documents, spreadsheets, or files. Include links to relevant files.
- Search Slack for any related conversations or messages. Include links to relevant threads.
- Write a comprehensive summary that synthesizes all the context you found
- List all TODO items and next steps
- Include a "Sources" section at the bottom with links to all relevant emails, Drive files, and Slack messages

${EMAIL_DETAILS}`;

  let overlayEl = null;
  let overlayMode = 'actions'; // 'actions' or 'editor'
  let selectedIndex = 0;

  const ACTIONS = [
    {
      key: '1',
      label: 'Create Asana task',
      desc: 'Create a task from this email',
      handler: handleCreateAsanaTask,
    },
    {
      key: '2',
      label: 'Create Asana task with deep context',
      desc: 'Gather context from Gmail, Drive, and Slack, then create a task',
      handler: handleDeepContextTask,
    },
  ];

  function showOverlay() {
    if (overlayEl) return;
    overlayMode = 'actions';
    selectedIndex = 0;
    renderOverlay();
  }

  function renderOverlay() {
    // Remove existing overlay if any
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'precog-overlay';
    overlayEl.setAttribute('tabindex', '-1');

    const modal = document.createElement('div');
    modal.id = 'precog-modal';

    if (overlayMode === 'actions') {
      modal.innerHTML = `
        <ul class="precog-actions">
          ${ACTIONS.map(
            (a, i) => `
            <li class="precog-action${i === selectedIndex ? ' precog-selected' : ''}" data-key="${a.key}" data-index="${i}">
              <span class="precog-key">${a.key}</span>
              <div>
                <div class="precog-action-label">${a.label}</div>
                <div class="precog-action-desc">${a.desc}</div>
              </div>
            </li>`
          ).join('')}
        </ul>
      `;

      // Click handlers for actions
      modal.querySelectorAll('.precog-action').forEach((el) => {
        el.addEventListener('click', () => {
          const action = ACTIONS.find((a) => a.key === el.dataset.key);
          if (action) action.handler();
        });
      });
    }

    overlayEl.appendChild(modal);
    document.body.appendChild(overlayEl);
    attachOverlayKeyHandler(overlayEl);
    overlayEl.focus();

    // Close on backdrop click
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) hideOverlay();
    });
  }

  function showPromptEditor(prompt) {
    overlayMode = 'editor';

    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'precog-overlay';
    overlayEl.setAttribute('tabindex', '-1');

    const modal = document.createElement('div');
    modal.id = 'precog-modal';
    modal.classList.add('precog-editor-mode');

    modal.innerHTML = `
      <h1>Edit Prompt</h1>
      <p class="precog-hint">Edit the prompt below &middot; ⌘+Enter to send &middot; Esc to cancel</p>
      <textarea id="precog-prompt-editor">${escapeHtml(prompt)}</textarea>
      <div class="precog-editor-actions">
        <button id="precog-send-btn" class="precog-btn-primary">Send to Claude ⌘↵</button>
        <button id="precog-cancel-btn" class="precog-btn-secondary">Cancel</button>
      </div>
    `;

    overlayEl.appendChild(modal);
    document.body.appendChild(overlayEl);
    attachOverlayKeyHandler(overlayEl);

    const textarea = modal.querySelector('#precog-prompt-editor');
    textarea.focus();
    // Move cursor to beginning
    textarea.selectionStart = textarea.selectionEnd = 0;

    modal.querySelector('#precog-send-btn').addEventListener('click', () => {
      sendPrompt(textarea.value);
    });

    modal.querySelector('#precog-cancel-btn').addEventListener('click', () => {
      hideOverlay();
    });

    // Close on backdrop click
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) hideOverlay();
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function updateSelection() {
    if (!overlayEl) return;
    overlayEl.querySelectorAll('.precog-action').forEach((el, i) => {
      el.classList.toggle('precog-selected', i === selectedIndex);
    });
  }

  function hideOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
      overlayMode = 'actions';
    }
  }

  // --- Email Data Extraction ---

  function extractEmailData() {
    const subject =
      document.querySelector('h2[data-thread-perm-id]')?.textContent?.trim() ||
      document.querySelector('.hP')?.textContent?.trim() ||
      '';

    const senderEl =
      document.querySelector('.gD') ||
      document.querySelector('[email]');
    const sender = senderEl
      ? (senderEl.getAttribute('name') || senderEl.textContent || '').trim() +
        ' <' +
        (senderEl.getAttribute('email') || '') +
        '>'
      : '';

    const dateEl = document.querySelector('.g3');
    const date = dateEl
      ? dateEl.getAttribute('title') || dateEl.textContent?.trim() || ''
      : '';

    // Grab all visible/expanded message bodies
    const messageBodies = document.querySelectorAll('.a3s.aiL');
    const body = Array.from(messageBodies)
      .map((el, i) => {
        const msg = el.closest('.gs');
        const msgSender = msg?.querySelector('.gD');
        const msgDate = msg?.querySelector('.g3');
        const from = msgSender
          ? (msgSender.getAttribute('name') || msgSender.textContent || '').trim()
          : `Message ${i + 1}`;
        const on = msgDate
          ? msgDate.getAttribute('title') || msgDate.textContent?.trim() || ''
          : '';
        const header = on ? `--- ${from} (${on}) ---` : `--- ${from} ---`;
        return `${header}\n${el.innerText.trim()}`;
      })
      .join('\n\n');

    // Check for collapsed messages
    const collapsed = document.querySelectorAll('.adx[aria-expanded="false"], .kv[aria-expanded="false"]');
    const warning = collapsed.length > 0
      ? `\n\n⚠️ ${collapsed.length} collapsed message(s) not included. Press ; in Gmail to expand all, then try again.`
      : '';

    const url = window.location.href;

    return { subject, sender, date, body, url, warning };
  }

  function fillTemplate(template, emailData) {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return template
      .replace(/\{subject\}/g, emailData.subject)
      .replace(/\{sender\}/g, emailData.sender)
      .replace(/\{date\}/g, emailData.date)
      .replace(/\{url\}/g, emailData.url)
      .replace(/\{body\}/g, emailData.body)
      .replace(/\{today\}/g, today);
  }

  // --- Action Handlers ---

  function handleCreateAsanaTask() {
    hideOverlay();
    const emailData = extractEmailData();

    if (!emailData.subject && !emailData.body) {
      alert('[Precog] Open an email first — no email data found on this page.');
      return;
    }

    if (emailData.warning) {
      alert(emailData.warning);
      return;
    }

    chrome.storage.sync.get(
      { promptTemplate: DEFAULT_PROMPT_TEMPLATE, emailDataScope: 'full' },
      (settings) => {
        const data = { ...emailData };
        if (settings.emailDataScope === 'snippet' && data.body.length > 200) {
          data.body = data.body.substring(0, 200) + '...';
        }
        const filledPrompt = fillTemplate(settings.promptTemplate, data);
        showPromptEditor(filledPrompt);
      }
    );
  }

  function handleDeepContextTask() {
    hideOverlay();
    const emailData = extractEmailData();

    if (!emailData.subject && !emailData.body) {
      alert('[Precog] Open an email first — no email data found on this page.');
      return;
    }

    if (emailData.warning) {
      alert(emailData.warning);
      return;
    }

    chrome.storage.sync.get(
      { deepContextTemplate: DEFAULT_DEEP_CONTEXT_TEMPLATE, emailDataScope: 'full' },
      (settings) => {
        const data = { ...emailData };
        if (settings.emailDataScope === 'snippet' && data.body.length > 200) {
          data.body = data.body.substring(0, 200) + '...';
        }
        const filledPrompt = fillTemplate(settings.deepContextTemplate, data);
        showPromptEditor(filledPrompt);
      }
    );
  }

  function sendPrompt(prompt) {
    hideOverlay();
    chrome.runtime.sendMessage({
      type: 'SEND_TO_CLAUDE',
      payload: { prompt },
    });
  }

  // --- Keyboard Listeners ---

  // Ctrl+Opt+P — only thing on the document. No preventDefault, no stopPropagation.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'π')) {
      e.preventDefault();
      if (overlayEl) {
        hideOverlay();
      } else {
        showOverlay();
      }
    }
  });

  // Overlay key handler — attached to the overlay element itself, not the document.
  // Since the overlay has focus, it receives keys without interfering with Gmail.
  function attachOverlayKeyHandler(el) {
    el.addEventListener('keydown', (e) => {
      if (overlayMode === 'editor') {
        if (e.key === 'Escape') {
          e.preventDefault();
          hideOverlay();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          const textarea = document.querySelector('#precog-prompt-editor');
          if (textarea) sendPrompt(textarea.value);
          return;
        }
        // Let textarea handle all other keys
        return;
      }

      // Actions mode — stop event from reaching Gmail
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        hideOverlay();
        return;
      }

      if (e.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % ACTIONS.length;
        updateSelection();
        return;
      }

      if (e.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + ACTIONS.length) % ACTIONS.length;
        updateSelection();
        return;
      }

      if (e.key === 'Enter') {
        ACTIONS[selectedIndex].handler();
        return;
      }

      const action = ACTIONS.find((a) => a.key === e.key);
      if (action) {
        action.handler();
      }
    });
  }

})();
