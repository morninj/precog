(() => {
  // --- Block Definitions ---
  // Each block is a composable prompt building block.
  // Templates are generic (not email-specific) so they work across contexts.

  const BLOCKS = [
    {
      id: 'asana_task',
      label: 'Create Asana task',
      desc: 'Create a task with title, assignee, and due date',
      defaultTemplate: [
        'Create an Asana task based on the above context.',
        'Title should be in the imperative mood, like a good git commit message (e.g. "Review contract from Acme Corp", "Schedule follow-up with Sarah").',
        'Assign the task to me.',
        'Set the due date to today ({today}).',
        'Include a link to the source at the very top of the description.',
      ].join('\n- '),
    },
    {
      id: 'summarize',
      label: 'Summarize',
      desc: 'Summarize the key points',
      defaultTemplate: 'Summarize the key points.',
    },
    {
      id: 'identify_todos',
      label: 'Identify TODOs',
      desc: 'List TODOs and next steps',
      defaultTemplate: 'List all TODOs and next steps.',
    },
    {
      id: 'recommend',
      label: 'Recommend approaches',
      desc: 'Suggest how to handle each TODO',
      defaultTemplate: 'For each TODO, include a brief recommended approach with a confidence level (high/medium/low), any strategic considerations, and anticipated questions or blockers.',
      requires: ['identify_todos'],
    },
    {
      id: 'deep_context',
      label: 'Search for deep context',
      desc: 'Search Gmail, Drive, and Slack for related content',
      defaultTemplate: [
        'Search Gmail for all related email threads with this sender and on this topic. Include links to relevant threads.',
        'Search Google Drive for any related documents, spreadsheets, or files. Include links to relevant files.',
        'Search Slack for any related conversations or messages. Include links to relevant threads.',
        'Write a comprehensive summary that synthesizes all the context you found.',
        'Include a "Sources" section at the bottom with links to all relevant emails, Drive files, and Slack messages.',
      ].join('\n- '),
    },
    {
      id: 'draft_reply',
      label: 'Draft a reply',
      desc: 'Write a draft response',
      defaultTemplate: 'Draft a reply that addresses the key points and any open questions. Match the tone and formality of the original message.',
    },
    {
      id: 'deep_research',
      label: 'Deep research',
      desc: 'Use Claude\'s research mode for thorough investigation',
      defaultTemplate: 'Use your research capabilities to thoroughly investigate this topic before responding.',
    },
  ];


  // --- State ---

  let overlayEl = null;
  let overlayMode = 'blocks'; // 'blocks' or 'editor'
  let selectedIndex = 0;
  let checkedBlockIds = new Set(['asana_task', 'summarize', 'identify_todos', 'recommend']);
  let editorOptions = {};

  // --- Context Builders ---
  // Each context type provides a preamble and a details section.
  // Only email for now; others (Drive, Slack, etc.) can be added later.

  function buildEmailContext(emailData) {
    const details = [
      'Email details:',
      `- Subject: ${emailData.subject}`,
      `- From: ${emailData.sender}`,
      `- Date: ${emailData.date}`,
      `- Link: ${emailData.url}`,
    ];

    if (emailData.threadId) {
      details.push(`- Gmail thread ID: ${emailData.threadId}`);
    }
    if (emailData.messageIds.length > 0) {
      details.push(`- Gmail message IDs: ${emailData.messageIds.join(', ')}`);
    }
    if (emailData.legacyMessageIds.length > 0) {
      details.push(`- Gmail RFC message IDs: ${emailData.legacyMessageIds.join(', ')}`);
    }

    details.push('- Body:', emailData.body);

    return {
      preamble: 'Based on the following email, please complete the requirements listed below.',
      details: details.join('\n'),
    };
  }

  // --- Prompt Assembly ---

  function buildPrompt(blockIds, context, blockTemplates) {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const requirements = blockIds
      .map((id) => {
        const template = blockTemplates[id] || BLOCKS.find((b) => b.id === id)?.defaultTemplate || '';
        return `- ${template}`;
      })
      .join('\n');

    const prompt = [
      context.preamble,
      '',
      'Requirements:',
      requirements,
      '',
      context.details,
    ].join('\n');

    return prompt.replace(/\{today\}/g, today);
  }

  // --- Overlay UI ---

  function showOverlay() {
    if (overlayEl) return;
    overlayMode = 'blocks';
    selectedIndex = 0;
    renderOverlay();
  }

  function renderOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'precog-overlay';
    overlayEl.setAttribute('tabindex', '-1');

    const modal = document.createElement('div');
    modal.id = 'precog-modal';

    if (overlayMode === 'blocks') {
      modal.innerHTML = `
        <ul class="precog-blocks">
          ${BLOCKS.map((b, i) => `
            <li class="precog-block${i === selectedIndex ? ' precog-focused' : ''}${checkedBlockIds.has(b.id) ? ' precog-checked' : ''}" data-id="${b.id}" data-index="${i}">
              <span class="precog-checkbox">${checkedBlockIds.has(b.id) ? '&#10003;' : ''}</span>
              <div>
                <div class="precog-block-label">${b.label}</div>
                <div class="precog-block-desc">${b.desc}</div>
              </div>
            </li>
          `).join('')}
        </ul>
        <button id="precog-generate-btn" class="precog-btn-primary precog-generate-btn"${checkedBlockIds.size === 0 ? ' disabled' : ''}>Generate prompt &#8984;&#8629;</button>
      `;

      // Block click handlers
      modal.querySelectorAll('.precog-block').forEach((el) => {
        el.addEventListener('click', () => {
          toggleBlock(el.dataset.id);
          renderOverlay();
        });
      });

      // Generate button
      modal.querySelector('#precog-generate-btn').addEventListener('click', () => {
        if (checkedBlockIds.size > 0) handleGenerate();
      });
    }

    overlayEl.appendChild(modal);
    document.body.appendChild(overlayEl);
    attachOverlayKeyHandler(overlayEl);
    overlayEl.focus();

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) hideOverlay();
    });
  }

  function toggleBlock(id) {
    const block = BLOCKS.find((b) => b.id === id);
    if (checkedBlockIds.has(id)) {
      checkedBlockIds.delete(id);
      // Uncheck blocks that require this one
      BLOCKS.forEach((b) => {
        if (b.requires?.includes(id)) checkedBlockIds.delete(b.id);
      });
    } else {
      checkedBlockIds.add(id);
      // Auto-enable dependencies
      if (block?.requires) {
        block.requires.forEach((dep) => checkedBlockIds.add(dep));
      }
    }
  }

  function showPromptEditor(prompt, options = {}) {
    overlayMode = 'editor';
    editorOptions = options;

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
      <textarea id="precog-prompt-editor">${escapeHtml(prompt)}</textarea>
      <div class="precog-editor-actions">
        <button id="precog-send-auto-btn" class="precog-btn-primary">Send to Claude &#8984;&#8629;</button>
        <button id="precog-send-paste-btn" class="precog-btn-secondary">Send without submitting &#8984;&#8679;&#8629;</button>
      </div>
    `;

    overlayEl.appendChild(modal);
    document.body.appendChild(overlayEl);
    attachOverlayKeyHandler(overlayEl);

    const textarea = modal.querySelector('#precog-prompt-editor');
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = 0;

    modal.querySelector('#precog-send-auto-btn').addEventListener('click', () => {
      sendPrompt(textarea.value, { ...options, promptEntry: 'auto-submit' });
    });

    modal.querySelector('#precog-send-paste-btn').addEventListener('click', () => {
      sendPrompt(textarea.value, { ...options, promptEntry: 'paste' });
    });

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) hideOverlay();
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function hideOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
      overlayMode = 'blocks';
    }
  }

  // --- Email Data Extraction ---

  function extractEmailData() {
    const threadEl = document.querySelector('h2[data-thread-perm-id]');
    const threadId = threadEl?.getAttribute('data-thread-perm-id') || '';

    const subject =
      threadEl?.textContent?.trim() ||
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

    const collapsed = document.querySelectorAll('.adx[aria-expanded="false"], .kv[aria-expanded="false"]');
    const warning = collapsed.length > 0
      ? `\n\n${collapsed.length} collapsed message(s) not included. Press ; in Gmail to expand all, then try again.`
      : '';

    // Extract message IDs for Gmail API access
    const messageIds = Array.from(document.querySelectorAll('[data-message-id]'))
      .map((el) => el.getAttribute('data-message-id'))
      .filter(Boolean);
    const legacyMessageIds = Array.from(document.querySelectorAll('[data-legacy-message-id]'))
      .map((el) => el.getAttribute('data-legacy-message-id'))
      .filter(Boolean);

    const url = window.location.href;

    return { subject, sender, date, body, url, warning, threadId, messageIds, legacyMessageIds };
  }

  // --- Action Handlers ---

  function handleGenerate() {
    const emailData = extractEmailData();

    if (!emailData.subject && !emailData.body) {
      alert('[Precog] Open an email first — no email data found on this page.');
      return;
    }

    if (emailData.warning) {
      if (!confirm(emailData.warning + '\n\nContinue anyway?')) return;
    }

    // Resolve block order (respect BLOCKS ordering, only include checked)
    const orderedIds = BLOCKS
      .filter((b) => checkedBlockIds.has(b.id))
      .map((b) => b.id);

    const enableResearch = checkedBlockIds.has('deep_research');

    // Load custom templates from storage, then build prompt
    chrome.storage.sync.get({ blockTemplates: {}, emailDataScope: 'full' }, (settings) => {
      const data = { ...emailData };
      if (settings.emailDataScope === 'snippet' && data.body.length > 200) {
        data.body = data.body.substring(0, 200) + '...';
      }

      const context = buildEmailContext(data);
      const prompt = buildPrompt(orderedIds, context, settings.blockTemplates);
      showPromptEditor(prompt, { enableResearch });
    });
  }

  function sendPrompt(prompt, options = {}) {
    hideOverlay();
    chrome.runtime.sendMessage({
      type: 'SEND_TO_CLAUDE',
      payload: { prompt, ...options },
    });
  }

  // --- Keyboard Listeners ---

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
          if (!textarea) return;
          if (e.shiftKey) {
            sendPrompt(textarea.value, { ...editorOptions, promptEntry: 'paste' });
          } else {
            sendPrompt(textarea.value, { ...editorOptions, promptEntry: 'auto-submit' });
          }
          return;
        }
        return;
      }

      // Blocks mode
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        hideOverlay();
        return;
      }

      if (e.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % BLOCKS.length;
        renderOverlay();
        return;
      }

      if (e.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + BLOCKS.length) % BLOCKS.length;
        renderOverlay();
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          if (checkedBlockIds.size > 0) handleGenerate();
          return;
        }
        toggleBlock(BLOCKS[selectedIndex].id);
        renderOverlay();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (checkedBlockIds.size > 0) handleGenerate();
        return;
      }
    });
  }

})();
