// Shared Precog overlay, blocks, and prompt assembly.
// Site-specific scripts (gmail.js, asana.js) call initPrecog() with their config.

const ALL_BLOCKS = [
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
      'At the end of the description, include the Gmail thread ID, Gmail message IDs, and Gmail RFC message IDs from the email details below.',
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
    id: 'draft_email',
    label: 'Draft an email',
    desc: 'Draft an email to the appropriate recipients',
    defaultTemplate: 'Based on the task description, draft an email to the appropriate recipients. Identify the right people to contact from the context, address the key points, and include any necessary details or attachments mentioned in the task.',
  },
  {
    id: 'deep_research',
    label: 'Do deep research',
    desc: 'Use Claude\'s research mode for thorough investigation',
    defaultTemplate: 'Use your research capabilities to thoroughly investigate this topic before responding.',
  },
];

// config: { extractData, buildContext, availableBlockIds, defaultBlockIds, noDataMessage }
function initPrecog(config) {
  const blocks = ALL_BLOCKS.filter((b) => config.availableBlockIds.includes(b.id));

  let overlayEl = null;
  let overlayMode = 'blocks'; // 'blocks' or 'editor'
  let selectedIndex = 0;
  let checkedBlockIds = new Set(config.defaultBlockIds);
  let editorOptions = {};

  // --- Prompt Assembly ---

  function buildPrompt(blockIds, context, blockTemplates) {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const requirements = blockIds
      .map((id) => {
        const template = blockTemplates[id] || ALL_BLOCKS.find((b) => b.id === id)?.defaultTemplate || '';
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
          ${blocks.map((b, i) => `
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

      modal.querySelectorAll('.precog-block').forEach((el) => {
        el.addEventListener('click', () => {
          toggleBlock(el.dataset.id);
          renderOverlay();
        });
      });

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
    const block = ALL_BLOCKS.find((b) => b.id === id);
    if (checkedBlockIds.has(id)) {
      checkedBlockIds.delete(id);
      ALL_BLOCKS.forEach((b) => {
        if (b.requires?.includes(id)) checkedBlockIds.delete(b.id);
      });
    } else {
      checkedBlockIds.add(id);
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

  // --- Action Handlers ---

  function handleGenerate() {
    const data = config.extractData();

    if (!data) {
      alert(config.noDataMessage || '[Precog] No data found on this page.');
      return;
    }

    if (data.warning) {
      if (!confirm(data.warning + '\n\nContinue anyway?')) return;
    }

    const orderedIds = blocks
      .filter((b) => checkedBlockIds.has(b.id))
      .map((b) => b.id);

    const enableResearch = checkedBlockIds.has('deep_research');

    chrome.storage.sync.get({ blockTemplates: {}, emailDataScope: 'full' }, (settings) => {
      const context = config.buildContext(data, settings);
      const prompt = buildPrompt(orderedIds, context, settings.blockTemplates);
      showPromptEditor(prompt, { enableResearch });
    });
  }

  function sendPrompt(prompt, options = {}) {
    hideOverlay();
    chrome.runtime.sendMessage({
      type: 'SEND_TO_CLAUDE',
      payload: { prompt, source: config.source, ...options },
    });
  }

  // --- Keyboard Listeners ---

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'π')) {
      e.preventDefault();
      e.stopPropagation();
      if (overlayEl) {
        hideOverlay();
      } else if (!config.canActivate || config.canActivate()) {
        showOverlay();
      }
    }
  }, true); // capture phase to intercept before the host page

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
        selectedIndex = (selectedIndex + 1) % blocks.length;
        renderOverlay();
        return;
      }

      if (e.key === 'ArrowUp') {
        selectedIndex = (selectedIndex - 1 + blocks.length) % blocks.length;
        renderOverlay();
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          if (checkedBlockIds.size > 0) handleGenerate();
          return;
        }
        toggleBlock(blocks[selectedIndex].id);
        renderOverlay();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (checkedBlockIds.size > 0) handleGenerate();
        return;
      }
    });
  }
}
