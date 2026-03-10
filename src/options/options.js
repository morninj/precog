// Block definitions must match shared.js
const BLOCKS = [
  {
    id: 'asana_task',
    label: 'Create Asana task',
    defaultTemplate: [
      'Create an Asana task based on the above context.',
      'Title should be no more than {maxTitleWords} words, in the imperative mood, like a good git commit message (e.g. "Review contract from Acme Corp", "Schedule follow-up with Sarah").',
      'Assign the task to me.',
      'Set the due date to today ({today}).',
      'Include a link to the source at the very top of the description.',
      'At the end of the description, include any source-specific IDs from the details below (e.g. Gmail thread/message IDs, Slack message link, Asana task GID).',
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
    id: 'draft_email',
    label: 'Draft an email',
    defaultTemplate: 'Based on the task description, draft an email to the appropriate recipients. Identify the right people to contact from the context, address the key points, and include any necessary details or attachments mentioned in the task.',
  },
  {
    id: 'deep_research',
    label: 'Do deep research',
    defaultTemplate: 'Use your research capabilities to thoroughly investigate this topic before responding.',
  },
];

const emailDataScopeEl = document.getElementById('emailDataScope');
const maxTitleWordsEl = document.getElementById('maxTitleWords');
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
    maxTitleWords: '10',
    blockTemplates: {},
  },
  (settings) => {
    emailDataScopeEl.value = settings.emailDataScope;
    maxTitleWordsEl.value = settings.maxTitleWords;

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
      maxTitleWords: maxTitleWordsEl.value,
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
