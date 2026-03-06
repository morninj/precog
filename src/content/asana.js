console.log('[Precog] Asana content script loaded');
(() => {
  function prosemirrorToMarkdown(el) {
    if (!el) return '';
    const lines = [];

    for (const node of el.children) {
      if (node.matches('p, .ProsemirrorEditor-paragraph')) {
        const text = inlineToMarkdown(node).trim();
        if (text) lines.push(text);
        else lines.push('');
      } else if (node.matches('ol, ul, .ProsemirrorEditor-list')) {
        for (const li of node.querySelectorAll('.ProsemirrorEditor-listItem')) {
          const indent = parseInt(li.getAttribute('data-list-indent') || '1', 10);
          const prefix = '  '.repeat(indent - 1) + '- ';
          const p = li.querySelector('p');
          const text = p ? inlineToMarkdown(p).trim() : li.textContent.trim();
          lines.push(prefix + text);
        }
      }
    }

    return lines.join('\n');
  }

  function inlineToMarkdown(el) {
    let result = '';
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'A') {
          const href = child.getAttribute('href') || '';
          const text = child.textContent.trim();
          result += `[${text}](${href})`;
        } else if (child.tagName === 'BR') {
          // skip trailing breaks
        } else {
          result += inlineToMarkdown(child);
        }
      }
    }
    return result;
  }

  function extractAsanaData() {
    const titleEl = document.querySelector('textarea[aria-label="Task Name"]');
    const title = titleEl?.value?.trim() || '';

    const descriptionEl = document.querySelector('.ProsemirrorEditor.TextEditor3-prosemirrorEditor');
    const description = prosemirrorToMarkdown(descriptionEl);

    const url = window.location.href;

    if (!title && !description) return null;

    return { title, description, url };
  }

  function buildAsanaContext(data) {
    const details = [
      'Asana task details:',
      `- Title: ${data.title}`,
      `- Link: ${data.url}`,
      '- Description:',
      data.description,
    ].join('\n');

    return {
      preamble: 'Based on the following Asana task, please complete the requirements listed below.',
      details,
    };
  }

  initPrecog({
    source: 'asana',
    extractData: extractAsanaData,
    buildContext: buildAsanaContext,
    availableBlockIds: ['summarize', 'identify_todos', 'recommend', 'deep_context', 'draft_reply', 'deep_research'],
    defaultBlockIds: ['summarize', 'identify_todos', 'recommend'],
    noDataMessage: '[Precog] Open a task first — no task data found on this page.',
  });
})();
