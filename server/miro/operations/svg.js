import { SaxesParser } from 'saxes';
import { validMiroId } from '../mcp-config.js';

// SVG remains inert evidence. Parse only original attribute identities/content;
// never execute markup, resolve entities, render it, or fetch external resources.
export function miroSvgItems(svg) {
  if (typeof svg !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('invalid_svg');
  const parser = new SaxesParser({ xmlns: true }),
    stack = [],
    items = [];
  let failed = false;
  parser.on('error', () => {
    failed = true;
  });
  parser.on('opentag', (tag) => {
    const a = Object.fromEntries(
      Object.values(tag.attributes).map((attr) => [attr.name, attr.value]),
    );
    const parent = stack.at(-1);
    const item = validMiroId(a['data-miro-id'])
      ? {
          id: a['data-miro-id'],
          type: a['data-type'] || (a['data-frame'] ? 'frame' : null),
          text: a['data-content'] || '',
          hasTable: false,
        }
      : null;
    stack.push({ item, owner: item || parent?.owner });
    if (item) items.push(item);
    if (tag.local === 'table' && stack.at(-1).owner) stack.at(-1).owner.hasTable = true;
    // A frame's type often lives on its first child rect.
    if (!item && a['data-type'] === 'frame' && parent?.owner) parent.owner.type = 'frame';
  });
  parser.on('text', (text) => {
    if (stack.at(-1)?.owner) stack.at(-1).owner.text += text;
  });
  parser.on('closetag', () => stack.pop());
  parser.write(svg).close();
  if (failed) throw new Error('invalid_svg');
  return items.filter(
    (item) =>
      item.type !== 'frame' &&
      !['grid', 'table'].includes(item.type) &&
      !item.hasTable &&
      item.text.trim(),
  );
}
