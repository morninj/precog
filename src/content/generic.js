window.__precogModules = window.__precogModules || {};
window.__precogModules.generic = {
  matches: () => true,
  init: () => {
    let capturedSelection = '';
    let capturedBodyText = '';

    function extractPageData() {
      const title = document.title || '';
      const url = window.location.href;

      if (!title && !capturedSelection && !capturedBodyText) return null;

      return { title, url, selectedText: capturedSelection, bodyText: capturedBodyText };
    }

    function buildPageContext(data, settings) {
      const maxChars = parseInt(settings.genericPageMaxChars || '20000', 10);
      const details = [
        'Page details:',
        `- Title: ${data.title}`,
        `- URL: ${data.url}`,
      ];

      if (data.selectedText) {
        details.push('- Selected text:', data.selectedText);
      } else if (data.bodyText) {
        const text = data.bodyText.length > maxChars
          ? data.bodyText.substring(0, maxChars) + '...'
          : data.bodyText;
        details.push('- Page content:', text);
      }

      return {
        preamble: 'Based on the following webpage content, please complete the requirements listed below.',
        details: details.join('\n'),
      };
    }

    initPrecog({
      source: 'webpage',
      beforeShow() {
        // Capture selection and body text before the overlay steals focus
        capturedSelection = window.getSelection()?.toString()?.trim() || '';
        if (!capturedSelection) {
          capturedBodyText = document.body.innerText || '';
        } else {
          capturedBodyText = '';
        }
        return true;
      },
      extractData: extractPageData,
      buildContext: buildPageContext,
      availableBlockIds: ['asana_task', 'summarize', 'identify_todos', 'deep_context', 'draft_reply', 'deep_research'],
      defaultBlockIds: ['summarize', 'identify_todos'],
      noDataMessage: '[Precog] No content found on this page.',
    });
  },
};
