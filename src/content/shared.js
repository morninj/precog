// Shared Precog overlay, blocks, and prompt assembly.
// Site-specific scripts (gmail.js, asana.js) call initPrecog() with their config.

const ALL_BLOCKS = [
  {
    id: 'asana_task',
    label: 'Create Asana task',
    desc: 'Create a task with title, assignee, and due date',
    defaultTemplate: [
      'Create an Asana task based on the above context.',
      'Title should be no more than {maxTitleWords} words, in the imperative mood, like a good git commit message (e.g. "Review contract from Acme Corp", "Schedule follow-up with Sarah").',
      'Assign the task to me.',
      'Set the due date to today ({today}).',
      'Include a link to the source at the very top of the description.',
      'At the end of the description, include any source-specific IDs from the details below (e.g. Gmail thread/message IDs, Slack message link, Asana task GID).',
      'Use plain text for the task description. Do not use markdown or HTML formatting.',
    ].join('\n- '),
    modes: [
      { id: 'full', label: 'Full' },
      {
        id: 'concise',
        label: 'Concise',
        template: [
          'Create an Asana task based on the above context.',
          'Title should be no more than {maxTitleWords} words, in the imperative mood.',
          'Assign the task to me.',
          'Set the due date to today ({today}).',
          'The description should ONLY contain a link to the source. No other text in the description.',
        ].join('\n- '),
      },
    ],
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
    modes: [
      { id: 'list', label: 'List' },
      {
        id: 'advise',
        label: 'Advise',
        template: 'List all TODOs and next steps. For each TODO, include a brief recommended approach with a confidence level (high/medium/low), any strategic considerations, and anticipated questions or blockers.',
      },
    ],
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
  let blockModes = {}; // { blockId: modeIndex }
  let customTitle = '';
  let showTitleInput = false;
  let editorOptions = {};

  // --- Prompt Assembly ---

  function buildPrompt(blockIds, context, blockTemplates, settings) {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const requirements = blockIds
      .map((id) => {
        const block = ALL_BLOCKS.find((b) => b.id === id);
        const modeIndex = blockModes[id] || 0;
        const mode = block?.modes?.[modeIndex];
        let template = (mode?.template) ? mode.template
          : (blockTemplates[id] || block?.defaultTemplate || '');
        if (id === 'asana_task' && customTitle.trim()) {
          template = template
            .replace(/\n?-\s*Title should be no more than[^\n]*/g, '');
          template += `\n- Use this exact title for the Asana task: "${customTitle.trim()}"`;
        }
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

    return prompt.replace(/\{today\}/g, today).replace(/\{maxTitleWords\}/g, settings.maxTitleWords || '10');
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
          ${blocks.map((b, i) => {
            const focused = i === selectedIndex;
            const checked = checkedBlockIds.has(b.id);
            const modeHtml = (b.modes && focused) ? `
              <div class="precog-mode-toggle">
                ${b.modes.map((m, mi) =>
                  `<span class="precog-mode${mi === (blockModes[b.id] || 0) ? ' precog-mode-active' : ''}" data-block-id="${b.id}" data-mode-index="${mi}">${m.label}</span>`
                ).join('<span class="precog-mode-sep">&middot;</span>')}
              </div>` : '';
            let titleHtml = '';
            let descHtml = `<div class="precog-block-desc">${b.desc}</div>`;
            if (b.id === 'asana_task' && checked && focused) {
              descHtml = `<div class="precog-block-desc">${b.desc} (or <span class="precog-set-title" id="precog-set-title">custom title</span>)</div>`;
              if (showTitleInput) {
                titleHtml = `<div class="precog-title-row"><input type="text" class="precog-title-input" id="precog-custom-title" placeholder="Custom title..." value="${escapeHtml(customTitle)}"></div>`;
              }
            }
            return `
            <li class="precog-block${focused ? ' precog-focused' : ''}${checked ? ' precog-checked' : ''}" data-id="${b.id}" data-index="${i}">
              <span class="precog-checkbox">${checked ? '&#10003;' : ''}</span>
              <div class="precog-block-content">
                <div class="precog-block-label">${b.label}</div>
                ${descHtml}
                ${titleHtml}
              </div>
              ${modeHtml}
            </li>`;
          }).join('')}
        </ul>
        <div class="precog-actions">
          <button id="precog-quick-btn" class="precog-btn-primary"${checkedBlockIds.size === 0 ? ' disabled' : ''}>Quick run &#8984;&#8629;</button>
          <button id="precog-generate-btn" class="precog-btn-secondary"${checkedBlockIds.size === 0 ? ' disabled' : ''}>Generate prompt &#8984;&#8679;&#8629;</button>
        </div>
      `;

      modal.querySelectorAll('.precog-block').forEach((el) => {
        el.addEventListener('click', () => {
          toggleBlock(el.dataset.id);
          renderOverlay();
        });
      });

      modal.querySelectorAll('.precog-mode').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          blockModes[el.dataset.blockId] = parseInt(el.dataset.modeIndex, 10);
          renderOverlay();
        });
      });

      const setTitleLink = modal.querySelector('#precog-set-title');
      if (setTitleLink) {
        setTitleLink.addEventListener('click', (e) => {
          e.stopPropagation();
          showTitleInput = true;
          renderOverlay();
          document.getElementById('precog-custom-title')?.focus();
        });
      }

      const titleInput = modal.querySelector('#precog-custom-title');
      if (titleInput) {
        titleInput.addEventListener('input', (e) => {
          customTitle = e.target.value;
        });
        titleInput.addEventListener('click', (e) => e.stopPropagation());
        titleInput.focus();
      }

      modal.querySelector('#precog-quick-btn').addEventListener('click', () => {
        if (checkedBlockIds.size > 0) handleGenerate({ quickCreate: true });
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
    if (checkedBlockIds.has(id)) {
      checkedBlockIds.delete(id);
    } else {
      checkedBlockIds.add(id);
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
        <button id="precog-send-auto-btn" class="precog-btn-primary">Send to Claude and run &#8984;&#8629;</button>
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
    customTitle = '';
    showTitleInput = false;
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
      overlayMode = 'blocks';
    }
  }

  // --- Action Handlers ---

  function handleGenerate({ quickCreate = false } = {}) {
    const data = config.extractData();

    if (!data) {
      alert(config.noDataMessage || '[Precog] No data found on this page.');
      return;
    }

    const orderedIds = blocks
      .filter((b) => checkedBlockIds.has(b.id))
      .map((b) => b.id);

    const enableResearch = checkedBlockIds.has('deep_research');

    chrome.storage.sync.get({ blockTemplates: {}, emailDataScope: 'full', maxTitleWords: '10', genericPageMaxChars: '20000' }, (settings) => {
      const context = config.buildContext(data, settings);
      const prompt = buildPrompt(orderedIds, context, settings.blockTemplates, settings);
      if (quickCreate) {
        sendPrompt(prompt, { enableResearch, promptEntry: 'auto-submit' });
      } else {
        showPromptEditor(prompt, { enableResearch });
      }
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

  // Listen for shortcut command from service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TOGGLE_OVERLAY') {
      if (overlayEl) {
        hideOverlay();
      } else if (!config.canActivate || config.canActivate()) {
        if (config.beforeShow && !config.beforeShow()) return;
        showOverlay();
      }
    }
  });

  return { showOverlay, hideOverlay };

  function attachOverlayKeyHandler(el) {
    el.addEventListener('keydown', (e) => {
      if (overlayMode === 'editor') {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          hideOverlay();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
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

      // Blocks mode — if typing in the title input, let it through
      if (e.target.id === 'precog-custom-title') {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          customTitle = e.target.value;
          showTitleInput = !!customTitle.trim();
          renderOverlay();
          overlayEl.focus();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          customTitle = e.target.value;
          if (checkedBlockIds.size > 0) {
            handleGenerate({ quickCreate: !e.shiftKey });
          }
          return;
        }
        return;
      }

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

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const block = blocks[selectedIndex];
        if (block.modes) {
          const current = blockModes[block.id] || 0;
          const len = block.modes.length;
          blockModes[block.id] = e.key === 'ArrowRight'
            ? (current + 1) % len
            : (current - 1 + len) % len;
          renderOverlay();
        }
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        const block = blocks[selectedIndex];
        if (block.id === 'asana_task' && checkedBlockIds.has('asana_task')) {
          showTitleInput = !showTitleInput;
          renderOverlay();
          if (showTitleInput) {
            document.getElementById('precog-custom-title')?.focus();
          }
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (checkedBlockIds.size > 0) {
          handleGenerate({ quickCreate: !e.shiftKey });
        }
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        toggleBlock(blocks[selectedIndex].id);
        renderOverlay();
        return;
      }
    });
  }
}
