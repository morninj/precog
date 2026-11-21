window.__precogModules = window.__precogModules || {};
window.__precogModules.asana = {
  matches: (hostname) => hostname === 'app.asana.com',
  init: () => {
    function prosemirrorToMarkdown(el) {
      if (!el) return '';
      // Each block is a paragraph, heading or whole list; blocks are separated
      // by a blank line. Asana's empty paragraphs (used for spacing) are dropped.
      const blocks = [];

      for (const node of el.children) {
        if (node.matches('header, h1, h2, h3, h4, h5, h6')) {
          const level = parseInt(node.getAttribute('data-asana-level')
            || node.tagName.match(/^H(\d)$/)?.[1] || '2', 10);
          // Asana renders headings as bold text; the # already marks them
          const text = inlineToMarkdown(node, { plain: true }).trim();
          if (text) blocks.push(`${'#'.repeat(level)} ${text}`);
        } else if (node.matches('ol, ul, .ProsemirrorEditor-list')) {
          blocks.push(listToMarkdown(node));
        } else if (node.matches('blockquote')) {
          const text = prosemirrorToMarkdown(node);
          if (text) blocks.push(text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n'));
        } else if (node.matches('pre')) {
          blocks.push('```\n' + node.textContent.replace(/\n$/, '') + '\n```');
        } else if (node.matches('hr')) {
          blocks.push('---');
        } else {
          const text = inlineToMarkdown(node).trim();
          if (text) blocks.push(text);
        }
      }

      return blocks.join('\n\n');
    }

    // Asana lists are flat: nesting is in data-list-indent, and numbered vs.
    // bulleted is per item in data-list-type.
    function listToMarkdown(list) {
      const lines = [];
      const counters = [];
      for (const li of list.querySelectorAll('.ProsemirrorEditor-listItem, li')) {
        const indent = Math.max(1, parseInt(li.getAttribute('data-list-indent') || '1', 10));
        counters.length = indent; // restart numbering below a shallower item
        const numbered = (li.getAttribute('data-list-type') || (list.tagName === 'OL' ? 'numbered' : 'bulleted')) === 'numbered';
        counters[indent - 1] = numbered ? (counters[indent - 1] || 0) + 1 : 0;
        const marker = numbered ? `${counters[indent - 1]}.` : '-';
        const p = li.querySelector('p');
        const text = (p ? inlineToMarkdown(p) : li.textContent).trim();
        lines.push(`${'   '.repeat(indent - 1)}${marker} ${text}`);
      }
      return lines.join('\n');
    }

    const INLINE_MARKS = {
      STRONG: '**', B: '**',
      EM: '*', I: '*',
      S: '~~', STRIKE: '~~', DEL: '~~',
      CODE: '`',
    };

    // Markdown markers must hug the text, so keep surrounding spaces outside
    function wrapMark(text, mark) {
      const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text;
    }

    function inlineToMarkdown(el, { plain = false } = {}) {
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
          } else if (!plain && INLINE_MARKS[child.tagName]) {
            result += wrapMark(inlineToMarkdown(child), INLINE_MARKS[child.tagName]);
          } else {
            result += inlineToMarkdown(child, { plain });
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

    function findDescriptionEl() {
      return document.querySelector('#TaskDescription .ProseMirror')
        || document.querySelector('.ProsemirrorEditor.TextEditor3-prosemirrorEditor');
    }

    let toastTimer = null;
    function showToast(message) {
      let toast = document.getElementById('precog-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'precog-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('precog-toast-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('precog-toast-visible'), 2000);
    }

    async function copyDescription() {
      const el = findDescriptionEl();
      if (!el) {
        showToast('Open a task first');
        return;
      }
      const description = prosemirrorToMarkdown(el).trim();
      if (!description) {
        showToast('This task has no description');
        return;
      }
      const text = `${description}\n\n(asana task url: ${window.location.href})`;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Description copied');
      } catch (err) {
        // Async clipboard API can refuse when the page isn't focused; fall back
        // to the legacy copy command
        const active = document.activeElement;
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (active instanceof HTMLElement) active.focus();
        if (!ok) console.error('[Precog] Clipboard write failed:', err);
        showToast(ok ? 'Description copied' : 'Could not copy to the clipboard');
      }
    }

    // Same Chrome command as Gmail's "copy thread link" (Ctrl+Cmd+C on Mac,
    // Alt+Shift+C elsewhere), forwarded by the service worker
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'COPY_THREAD_LINK') copyDescription();
    });

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
