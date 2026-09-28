window.__precogModules = window.__precogModules || {};
window.__precogModules.gmail = {
  matches: (hostname) => hostname === 'mail.google.com',
  init: () => {
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

    // --- Copy thread link for Claude ---
    // The URL bar often shows an opaque display token; the hex thread ID in
    // data-legacy-thread-id produces a link Claude's Gmail connector can use.
    const LINK_ICON = '<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M432-288H288q-79.68 0-135.84-56.23Q96-400.45 96-480.23 96-560 152.16-616q56.16-56 135.84-56h144v72H288q-50 0-85 35t-35 85q0 50 35 85t85 35h144v72Zm-96-156v-72h288v72H336Zm192 156v-72h144q50 0 85-35t35-85q0-50-35-85t-85-35H528v-72h144q79.68 0 135.84 56.23 56.16 56.22 56.16 136Q864-400 807.84-344 751.68-288 672-288H528Z"/></svg>';
    const CHECK_ICON = '<svg viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M389-267 195-460l51-52 143 143 325-324 51 51-376 375Z"/></svg>';

    function isVisible(el) {
      return !!(el && el.offsetParent !== null);
    }

    function findThreadHeading(from) {
      if (from) {
        let node = from.parentElement;
        while (node && node !== document.body) {
          const h2 = node.querySelector('h2[data-legacy-thread-id]');
          if (h2) return h2;
          node = node.parentElement;
        }
      }
      const all = document.querySelectorAll('h2[data-legacy-thread-id]');
      return Array.from(all).find(isVisible) || all[0] || null;
    }

    function buildThreadLink(h2) {
      const id = h2.getAttribute('data-legacy-thread-id');
      const account = window.location.pathname.match(/\/mail\/u\/(\d+)/)?.[1] || '0';
      return `https://mail.google.com/mail/u/${account}/#all/${id}`;
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

    async function copyThreadLink(from) {
      const h2 = findThreadHeading(from);
      if (!h2) {
        showToast('Open a thread first');
        return false;
      }
      const link = buildThreadLink(h2);
      try {
        await navigator.clipboard.writeText(link);
        showToast('Thread link copied for Claude');
        return true;
      } catch (err) {
        // Async clipboard API can refuse when the page isn't focused; fall back
        // to the legacy copy command before giving up
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        if (ok) {
          showToast('Thread link copied for Claude');
          return true;
        }
        console.error('[Precog] Clipboard write failed:', err);
        prompt('Copy this link:', link);
        return false;
      }
    }

    // Gmail re-renders the toolbar's children (e.g. after clicks), which strips
    // our button while leaving the toolbar element itself in place. So check for
    // the button on every pass and re-insert the same element when it's missing.
    const copyButtons = new WeakMap();

    function createCopyButton() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'precog-copy-link-btn';
      btn.title = `Copy thread link for Claude (${/Mac/.test(navigator.platform) ? '⌥⇧C' : 'Alt+Shift+C'})`;
      btn.setAttribute('aria-label', 'Copy thread link for Claude');
      btn.innerHTML = LINK_ICON;
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await copyThreadLink(btn)) {
          btn.innerHTML = CHECK_ICON;
          btn.classList.add('precog-copied');
          setTimeout(() => {
            btn.innerHTML = LINK_ICON;
            btn.classList.remove('precog-copied');
          }, 1500);
        }
      });
      return btn;
    }

    function injectCopyButtons() {
      document.querySelectorAll('.bHJ').forEach((toolbar) => {
        let btn = copyButtons.get(toolbar);
        if (!btn) {
          btn = createCopyButton();
          copyButtons.set(toolbar, btn);
        }
        if (btn.parentNode !== toolbar || toolbar.firstChild !== btn) {
          toolbar.insertBefore(btn, toolbar.firstChild);
        }
      });
    }

    let injectScheduled = false;
    new MutationObserver(() => {
      if (injectScheduled) return;
      injectScheduled = true;
      requestAnimationFrame(() => {
        injectScheduled = false;
        injectCopyButtons();
      });
    }).observe(document.body, { childList: true, subtree: true });
    injectCopyButtons();

    // Keyboard shortcut is a Chrome command (Alt+Shift+C by default, rebindable
    // at chrome://extensions/shortcuts), forwarded by the service worker
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'COPY_THREAD_LINK') copyThreadLink(null);
    });

    initPrecog({
      source: 'gmail',
      canActivate: () => !!document.querySelector('h2[data-thread-perm-id]'),
      extractData: extractEmailData,
      buildContext: buildEmailContext,
      availableBlockIds: ['asana_task', 'summarize', 'identify_todos', 'deep_context', 'draft_reply', 'deep_research'],
      defaultBlockIds: ['asana_task', 'summarize', 'identify_todos'],
      noDataMessage: '[Precog] Open an email first — no email data found on this page.',
      beforeShow() {
        const collapsed = document.querySelectorAll('.adx[aria-expanded="false"], .kv[aria-expanded="false"]');
        if (collapsed.length > 0) {
          return confirm(`Some messages are collapsed and won't be included. You can press ; in Gmail to expand all.\n\nContinue anyway?`);
        }
        return true;
      },
    });
  },
};
