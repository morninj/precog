const DEFAULT_PROMPT_TEMPLATE = `Based on the following email, create an Asana task.

Requirements:
- Title should be in the imperative mood, like a good git commit message (e.g. "Respond to Joe's email about vibecoding", "Review contract from Acme Corp", "Schedule follow-up with Sarah")
- Assign the task to me
- Set the due date to today ({today})
- Description should summarize the key points and list any TODO items
- Include the link to the original email at the very top of the description

Email details:
- Subject: {subject}
- From: {sender}
- Date: {date}
- Link: {url}
- Body:
{body}`;

const DEFAULT_DEEP_CONTEXT_TEMPLATE = `Based on the following email, create an Asana task with full context.

Requirements:
- Title should be in the imperative mood, like a good git commit message (e.g. "Respond to Joe's email about vibecoding", "Review contract from Acme Corp", "Schedule follow-up with Sarah")
- Assign the task to me
- Set the due date to today ({today})
- Include the link to the original email at the very top of the description
- Search Gmail for all related email threads with this sender and on this topic. Include links to relevant threads.
- Search Google Drive for any related documents, spreadsheets, or files. Include links to relevant files.
- Search Slack for any related conversations or messages. Include links to relevant threads.
- Write a comprehensive summary that synthesizes all the context you found
- List all TODO items and next steps
- Include a "Sources" section at the bottom with links to all relevant emails, Drive files, and Slack messages

Email details:
- Subject: {subject}
- From: {sender}
- Date: {date}
- Link: {url}
- Body:
{body}`;

const promptEntryEl = document.getElementById('promptEntry');
const emailDataScopeEl = document.getElementById('emailDataScope');
const promptTemplateEl = document.getElementById('promptTemplate');
const deepContextTemplateEl = document.getElementById('deepContextTemplate');
const resetTemplateBtn = document.getElementById('resetTemplate');
const resetDeepTemplateBtn = document.getElementById('resetDeepTemplate');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(
  {
    promptEntry: 'auto-submit',
    emailDataScope: 'full',
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    deepContextTemplate: DEFAULT_DEEP_CONTEXT_TEMPLATE,
  },
  (settings) => {
    promptEntryEl.value = settings.promptEntry;
    emailDataScopeEl.value = settings.emailDataScope;
    promptTemplateEl.value = settings.promptTemplate;
    deepContextTemplateEl.value = settings.deepContextTemplate;
  }
);

// Reset templates to defaults
resetTemplateBtn.addEventListener('click', () => {
  promptTemplateEl.value = DEFAULT_PROMPT_TEMPLATE;
});

resetDeepTemplateBtn.addEventListener('click', () => {
  deepContextTemplateEl.value = DEFAULT_DEEP_CONTEXT_TEMPLATE;
});

// Save settings
saveBtn.addEventListener('click', () => {
  chrome.storage.sync.set(
    {
      promptEntry: promptEntryEl.value,
      emailDataScope: emailDataScopeEl.value,
      promptTemplate: promptTemplateEl.value,
      deepContextTemplate: deepContextTemplateEl.value,
    },
    () => {
      statusEl.textContent = 'Saved';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    }
  );
});
