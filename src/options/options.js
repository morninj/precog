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
const genericPageMaxCharsEl = document.getElementById('genericPageMaxChars');
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
    genericPageMaxChars: '20000',
    blockTemplates: {},
  },
  (settings) => {
    emailDataScopeEl.value = settings.emailDataScope;
    maxTitleWordsEl.value = settings.maxTitleWords;
    genericPageMaxCharsEl.value = settings.genericPageMaxChars;

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
      genericPageMaxChars: genericPageMaxCharsEl.value,
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

// --- Quick Asana task ---
// Kept in local (not synced) storage: the keys are secrets and the style
// guide can exceed sync storage's per-item size limit.
const ASANA_ORIGIN = 'https://app.asana.com/*';
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com/*';
const QUICK_TASK_DEFAULTS = {
  asanaToken: '',
  anthropicKey: '',
  claudeConnection: 'direct',
  quickTaskModel: 'claude-sonnet-5-5',
  asanaWorkspaceGid: '',
  asanaWorkspaceName: '',
  asanaSectionName: 'Triage',
  quickTaskGuide: '',
  taskBanner: 'gmail',
};

const taskBannerEl = document.getElementById('taskBanner');
const asanaTokenEl = document.getElementById('asanaToken');
const anthropicKeyEl = document.getElementById('anthropicKey');
const claudeConnectionEl = document.getElementById('claudeConnection');
const anthropicKeySettingEl = document.getElementById('anthropicKeySetting');
const quickTaskModelEl = document.getElementById('quickTaskModel');

// The key field only applies when calling the API from the browser
function syncConnectionUi() {
  anthropicKeySettingEl.hidden = claudeConnectionEl.value === 'helper';
}
claudeConnectionEl.addEventListener('change', syncConnectionUi);
const workspaceEl = document.getElementById('asanaWorkspaceGid');
const sectionNameEl = document.getElementById('asanaSectionName');
const quickTaskGuideEl = document.getElementById('quickTaskGuide');
const loadWorkspacesBtn = document.getElementById('loadWorkspaces');
const workspaceStatusEl = document.getElementById('workspaceStatus');

function setWorkspaceOptions(workspaces, selectedGid) {
  workspaceEl.textContent = '';
  if (workspaces.length === 0) workspaces = [{ gid: '', name: 'Load workspaces to choose one' }];
  for (const ws of workspaces) {
    const option = document.createElement('option');
    option.value = ws.gid;
    option.textContent = ws.name;
    workspaceEl.appendChild(option);
  }
  if (selectedGid) workspaceEl.value = selectedGid;
}

chrome.storage.local.get(QUICK_TASK_DEFAULTS, (s) => {
  asanaTokenEl.value = s.asanaToken;
  anthropicKeyEl.value = s.anthropicKey;
  claudeConnectionEl.value = s.claudeConnection;
  syncConnectionUi();
  quickTaskModelEl.value = s.quickTaskModel;
  sectionNameEl.value = s.asanaSectionName;
  quickTaskGuideEl.value = s.quickTaskGuide;
  taskBannerEl.value = s.taskBanner;
  setWorkspaceOptions(
    s.asanaWorkspaceGid ? [{ gid: s.asanaWorkspaceGid, name: s.asanaWorkspaceName || s.asanaWorkspaceGid }] : [],
    s.asanaWorkspaceGid
  );
});

loadWorkspacesBtn.addEventListener('click', async () => {
  const token = asanaTokenEl.value.trim();
  if (!token) {
    workspaceStatusEl.textContent = 'Enter the Asana token first.';
    return;
  }
  workspaceStatusEl.textContent = 'Loading…';
  try {
    // Must be the first await so it runs inside the click's user gesture
    const granted = await chrome.permissions.request({ origins: [ASANA_ORIGIN] });
    if (!granted) throw new Error('Permission to reach Asana was not granted.');
    const res = await fetch('https://app.asana.com/api/1.0/workspaces?opt_fields=name&limit=100', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.errors?.[0]?.message || `Asana returned ${res.status}`);
    setWorkspaceOptions(json.data, workspaceEl.value);
    workspaceStatusEl.textContent = `${json.data.length} found. Choose one, then Save.`;
  } catch (e) {
    workspaceStatusEl.textContent = e.message;
  }
});

saveBtn.addEventListener('click', () => {
  const asanaToken = asanaTokenEl.value.trim();
  const useHelper = claudeConnectionEl.value === 'helper';
  // With the helper, the key lives in the Keychain, so don't keep a copy here
  const anthropicKey = useHelper ? '' : anthropicKeyEl.value.trim();
  // Ask only for what the chosen setup needs, and only once it's being set up
  if (asanaToken || anthropicKey) {
    chrome.permissions.request(
      useHelper
        ? { origins: [ASANA_ORIGIN], permissions: ['nativeMessaging'] }
        : { origins: [ASANA_ORIGIN, ANTHROPIC_ORIGIN] }
    );
  }
  if (useHelper) anthropicKeyEl.value = '';
  chrome.storage.local.set({
    asanaToken,
    anthropicKey,
    claudeConnection: claudeConnectionEl.value,
    quickTaskModel: quickTaskModelEl.value,
    asanaWorkspaceGid: workspaceEl.value,
    asanaWorkspaceName: workspaceEl.selectedOptions[0]?.textContent || '',
    asanaSectionName: sectionNameEl.value.trim() || 'Triage',
    quickTaskGuide: quickTaskGuideEl.value,
    taskBanner: taskBannerEl.value,
  });
});
