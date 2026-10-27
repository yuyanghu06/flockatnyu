import { readAttachmentFiles } from './chat-attachments.js';
import { normalizeContactContext } from './chat-client.js';

export function installAssistantComposer(view) {
  view.contactChip = function contactChip(context, removable = false) {
    const chip = view.el('span', 'assistant-contact-chip');
    const name =
      [context.first_name, context.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact';
    chip.append(view.el('span', 'assistant-contact-name', name));
    if (removable) {
      const remove = view.el('button', 'assistant-contact-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Remove selected contact');
      remove.addEventListener('click', () => {
        view.draftContactContext = undefined;
        view.renderContactContext();
        view.controls();
        view.input.focus();
      });
      chip.append(remove);
    }
    return chip;
  };
  view.renderContactContext = function renderContactContext() {
    const height = view.panel.getBoundingClientRect().height;
    const follow = view.atLatest();
    view.contactContextArea.replaceChildren();
    view.contactContextArea.hidden = !view.draftContactContext;
    if (view.draftContactContext)
      view.contactContextArea.append(view.contactChip(view.draftContactContext, true));
    view.queueResize(height, follow);
  };
  view.attachContact = function attachContact(context) {
    if (view.disposed) return false;
    let selected;
    try {
      selected = normalizeContactContext(context);
    } catch {
      return false;
    }
    if (!selected) return false;
    view.draftContactContext = selected;
    view.renderContactContext();
    view.controls();
    view.open();
    if (view.panel.open) view.input.focus();
    return true;
  };
  view.renderDraftFiles = function renderDraftFiles() {
    const height = view.panel.getBoundingClientRect().height;
    const follow = view.atLatest();
    view.draftFiles.replaceChildren();
    view.draftFiles.hidden = !view.draftAttachments.length;
    for (const [index, file] of view.draftAttachments.entries()) {
      const chip = view.el('div', 'assistant-attachment');
      if (file.mimeType.startsWith('image/')) {
        const preview = view.el('img', 'assistant-attachment-preview');
        preview.alt = '';
        preview.src = `data:${file.mimeType};base64,${file.data}`;
        chip.append(preview);
      }
      const name = view.el('span', 'assistant-attachment-name', file.name);
      name.title = file.name;
      const remove = view.el('button', 'assistant-attachment-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.disabled = view.readingFiles;
      remove.addEventListener('click', () => {
        view.draftAttachments = view.draftAttachments.filter((_, i) => i !== index);
        view.attachmentError.hidden = true;
        view.renderDraftFiles();
        view.controls();
        view.input.focus();
      });
      chip.append(name, remove);
      view.draftFiles.append(chip);
    }
    view.queueResize(height, follow);
  };
  view.fileError = function fileError(error) {
    view.attachmentError.textContent = error.message;
    view.attachmentError.hidden = false;
  };
  view.attachmentSize = function attachmentSize(attachments) {
    return attachments.reduce(
      (sum, file) =>
        sum +
        (file.data.length / 4) * 3 -
        (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0),
      0,
    );
  };
  view.pendingAttachmentSize = function pendingAttachmentSize() {
    return (
      view.queuedMessages.reduce(
        (sum, message) => sum + view.attachmentSize(message.attachments),
        0,
      ) + (view.activeMessage ? view.attachmentSize(view.activeMessage.attachments) : 0)
    );
  };
  view.addFiles = async function addFiles(files) {
    if (!view.entered || view.disposed || view.readingFiles || !files?.length) return;
    view.readingFiles = true;
    view.attachmentError.hidden = true;
    view.controls();
    view.renderDraftFiles();
    try {
      const attachments = await readAttachmentFiles(files, view.draftAttachments);
      if (
        view.pendingAttachmentSize() + view.attachmentSize(attachments) >
        view.maxPendingAttachmentBytes
      )
        throw new Error(
          'Files in active and queued messages plus this draft can total up to 20 MiB. Remove a queued message or file, or wait for a reply.',
        );
      if (!view.disposed) view.draftAttachments = attachments;
    } catch (error) {
      if (!view.disposed) view.fileError(error);
    } finally {
      view.readingFiles = false;
      view.fileInput.value = '';
      if (!view.disposed) {
        view.renderDraftFiles();
        view.controls();
      }
    }
  };
}
