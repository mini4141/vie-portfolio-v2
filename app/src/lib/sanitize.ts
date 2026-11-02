import sanitizeHtml from 'sanitize-html';

/**
 * The story is rich text typed by the owner, so it is trusted-ish, but we still
 * strip everything outside the block set the editor can produce. Public pages
 * render this output verbatim.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'p', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'aside', 'pre', 'code',
    'strong', 'em', 's', 'mark', 'a', 'figure', 'figcaption', 'div', 'span', 'i', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href'],
    img: ['src', 'alt'],
    aside: ['data-kind'],
    pre: ['data-lang'],
    div: ['data-cols'],
    '*': ['class'],
  },
  allowedClasses: {
    blockquote: ['stat'],
    aside: ['callout'],
    pre: ['code'],
    figure: ['rt-img', 'rt-embed', 'is-narrow'],
    div: ['win', 'win-bar', 'shots', 'rt-table'],
    a: ['embed'],
    span: ['play', 'dur'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tag, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, ...(/^https?:/i.test(attribs.href ?? '') ? { rel: 'noopener noreferrer', target: '_blank' } : {}) },
    }),
  },
  exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
};
// rel/target are added by transformTags *after* the attribute allow-list, so allow them explicitly.
OPTIONS.allowedAttributes = { ...(OPTIONS.allowedAttributes as object), a: ['href', 'rel', 'target'] };

export function sanitizeStory(html: string): string {
  return sanitizeHtml(html ?? '', OPTIONS).trim();
}

/** Plain-text word count used for "N min read". */
export function wordCount(html: string): number {
  return (sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).match(/\S+/g) ?? []).length;
}
