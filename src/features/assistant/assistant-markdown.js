import MarkdownIt from 'markdown-it';

// Assistant/source text is untrusted: render Markdown without raw HTML or images.
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false, maxNesting: 20 });
markdown.validateLink = (value) => {
  try {
    const url = new URL(value);
    return (
      value.length <= 4096 &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};
markdown.renderer.rules.image = (tokens, index, options, env, renderer) =>
  markdown.utils.escapeHtml(renderer.renderInlineAsText(tokens[index].children, options, env));

export function renderAssistantMarkdown(text) {
  return markdown.render(text);
}
