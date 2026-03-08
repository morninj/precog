(() => {
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

    const messageIds = Array.from(document.querySelectorAll('[data-message-id]'))
      .map((el) => el.getAttribute('data-message-id'))
      .filter(Boolean);
    const legacyMessageIds = Array.from(document.querySelectorAll('[data-legacy-message-id]'))
      .map((el) => el.getAttribute('data-legacy-message-id'))
      .filter(Boolean);

    // Extract linked Asana task GIDs from the email body
    const linkedAsanaTaskGids = [];
    const asanaGidsSeen = new Set();
    document.querySelectorAll('.a3s.aiL a[href*="app.asana.com"]').forEach((link) => {
      const match = link.href.match(/\/task\/(\d+)/);
      if (match && !asanaGidsSeen.has(match[1])) {
        asanaGidsSeen.add(match[1]);
        linkedAsanaTaskGids.push(match[1]);
      }
    });

    const url = window.location.href;

    if (!subject && !body) return null;

    return { subject, sender, date, body, url, threadId, messageIds, legacyMessageIds, linkedAsanaTaskGids };
  }

  function buildEmailContext(emailData, settings) {
    const data = { ...emailData };
    if (settings.emailDataScope === 'snippet' && data.body.length > 200) {
      data.body = data.body.substring(0, 200) + '...';
    }

    const details = [
      'Email details:',
      `- Subject: ${data.subject}`,
      `- From: ${data.sender}`,
      `- Date: ${data.date}`,
      `- Link: ${data.url}`,
    ];

    if (data.threadId) {
      details.push(`- Gmail thread ID: ${data.threadId}`);
    }
    if (data.messageIds.length > 0) {
      details.push(`- Gmail message IDs: ${data.messageIds.join(', ')}`);
    }
    if (data.legacyMessageIds.length > 0) {
      details.push(`- Gmail RFC message IDs: ${data.legacyMessageIds.join(', ')}`);
    }

    details.push('- Body:', data.body);

    if (data.linkedAsanaTaskGids.length > 0) {
      details.push('');
      details.push('Related Asana tasks found in email (use these GIDs to read the tasks via the Asana connector):');
      data.linkedAsanaTaskGids.forEach((gid) => {
        details.push(`- Asana task GID: ${gid}`);
      });
    }

    return {
      preamble: 'Based on the following email, please complete the requirements listed below.',
      details: details.join('\n'),
    };
  }

  initPrecog({
    source: 'gmail',
    extractData: extractEmailData,
    buildContext: buildEmailContext,
    availableBlockIds: ['asana_task', 'summarize', 'identify_todos', 'recommend', 'deep_context', 'draft_reply', 'deep_research'],
    defaultBlockIds: ['asana_task', 'summarize', 'identify_todos', 'recommend'],
    noDataMessage: '[Precog] Open an email first — no email data found on this page.',
    beforeShow() {
      const collapsed = document.querySelectorAll('.adx[aria-expanded="false"], .kv[aria-expanded="false"]');
      if (collapsed.length > 0) {
        return confirm(`Some messages are collapsed and won't be included. You can press ; in Gmail to expand all.\n\nContinue anyway?`);
      }
      return true;
    },
  });
})();
