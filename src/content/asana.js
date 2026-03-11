window.__precogModules = window.__precogModules || {};
window.__precogModules.asana = {
  matches: (hostname) => hostname === 'app.asana.com',
  init: () => {
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

    function extractTaskGid() {
      const match = window.location.href.match(/\/task\/(\d+)/);
      return match ? match[1] : '';
    }

    function extractGmailLinks(el) {
      if (!el) return [];
      const links = el.querySelectorAll('a[href*="mail.google.com"]');
      const threads = new Set();
      for (const link of links) {
        const match = link.href.match(/#[^/]+\/([A-Za-z0-9]+)$/);
        if (match) threads.add(match[1]);
      }
      return Array.from(threads);
    }

    function extractAsanaData() {
      const titleEl = document.querySelector('textarea[aria-label="Task Name"]');
      const title = titleEl?.value?.trim() || '';

      const descriptionEl = document.querySelector('.ProsemirrorEditor.TextEditor3-prosemirrorEditor');
      const description = prosemirrorToMarkdown(descriptionEl);

      const url = window.location.href;
      const taskGid = extractTaskGid();
      const linkedGmailThreads = extractGmailLinks(descriptionEl);

      if (!title && !description) return null;

      return { title, description, url, taskGid, linkedGmailThreads };
    }

    function buildAsanaContext(data) {
      const details = [
        'Asana task details:',
        `- Title: ${data.title}`,
        `- Link: ${data.url}`,
      ];

      if (data.taskGid) {
        details.push(`- Asana task GID: ${data.taskGid}`);
      }

      details.push('- Description:', data.description);

      if (data.linkedGmailThreads.length > 0) {
        details.push('');
        details.push('Related Gmail threads found in description (use these IDs to read the threads via the Gmail connector):');
        data.linkedGmailThreads.forEach((id) => {
          details.push(`- Gmail thread: ${id}`);
        });
      }

      return {
        preamble: 'Based on the following Asana task, please complete the requirements listed below.',
        details: details.join('\n'),
      };
    }

    initPrecog({
      source: 'asana',
      canActivate: () => !!document.querySelector('.ProsemirrorEditor.TextEditor3-prosemirrorEditor'),
      extractData: extractAsanaData,
      buildContext: buildAsanaContext,
      availableBlockIds: ['summarize', 'identify_todos', 'deep_context', 'draft_email', 'deep_research'],
      defaultBlockIds: ['summarize', 'identify_todos'],
      noDataMessage: '[Precog] Open a task first — no task data found on this page.',
    });
  },
};
