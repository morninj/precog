// Block definitions must match gmail.js
const BLOCKS = [
  {
    id: 'asana_task',
    label: 'Create Asana task',
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
    defaultTemplate: 'Summarize the key points.',
  },
  {
    id: 'identify_todos',
    label: 'Identify TODOs',
    defaultTemplate: 'List all TODOs and next steps.',
  },
  {
    id: 'recommend',
    label: 'Recommend approaches',
    defaultTemplate: 'For each TODO, include a brief recommended approach with a confidence level (high/medium/low), any strategic considerations, and anticipated questions or blockers.',
  },
  {
    id: 'deep_context',
    label: 'Search for deep context',
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
    defaultTemplate: 'Draft a reply that addresses the key points and any open questions. Match the tone and formality of the original message.',
  },
  {
    id: 'deep_research',
    label: 'Deep research',
    defaultTemplate: 'Use your research capabilities to thoroughly investigate this topic before responding.',
  },
];

const emailDataScopeEl = document.getElementById('emailDataScope');
const blockEditorsEl = document.getElementById('block-editors');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

// Build per-block editor UI
const blockTextareas = {};
BLOCKS.forEach((block) => {
  const div = document.createElement('div');
  div.className = 'setting';
  div.innerHTML = `
    <label for="block-${block.id}">${block.label}</label>
    <textarea id="block-${block.id}" rows="4"></textarea>
    <button class="btn-link" data-block-id="${block.id}">Reset to default</button>
  `;
  blockEditorsEl.appendChild(div);

  const textarea = div.querySelector('textarea');
  blockTextareas[block.id] = textarea;

  div.querySelector('.btn-link').addEventListener('click', () => {
    textarea.value = block.defaultTemplate;
  });
});

// Load saved settings
chrome.storage.sync.get(
  {
    emailDataScope: 'full',
    blockTemplates: {},
  },
  (settings) => {
    emailDataScopeEl.value = settings.emailDataScope;

    BLOCKS.forEach((block) => {
      blockTextareas[block.id].value =
        settings.blockTemplates[block.id] || block.defaultTemplate;
    });
  }
);

// Save settings
saveBtn.addEventListener('click', () => {
  const blockTemplates = {};
  BLOCKS.forEach((block) => {
    const value = blockTextareas[block.id].value;
    // Only store if different from default (keeps storage lean)
    if (value !== block.defaultTemplate) {
      blockTemplates[block.id] = value;
    }
  });

  chrome.storage.sync.set(
    {
      emailDataScope: emailDataScopeEl.value,
      blockTemplates,
    },
    () => {
      statusEl.textContent = 'Saved';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    }
  );
});
