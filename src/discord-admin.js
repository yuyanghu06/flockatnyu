import './discord-admin.css';
import { discordAdminRequest } from './discord-admin-client.js';

const status = document.getElementById('admin-status'), content = document.getElementById('admin-content');
const list = document.getElementById('channel-list'), form = document.getElementById('channel-form');
const retry = document.getElementById('admin-retry'), save = document.getElementById('channel-save');
const guild = document.getElementById('guild-id');
let busy = false;
function controls(value) {
  busy = value; retry.disabled = save.disabled = value;
  for (const button of list.querySelectorAll('button')) button.disabled = value;
  form.setAttribute('aria-busy', String(value));
}
function render(channels) {
  list.replaceChildren();
  if (!channels.length) { const item = document.createElement('li'); item.textContent = 'No channels selected yet.'; list.append(item); }
  for (const channel of channels) {
    const item = document.createElement('li'), description = document.createElement('div'); description.className = 'channel-description';
    const title = document.createElement('strong'); title.textContent = channel.title;
    const detail = document.createElement('p'); detail.textContent = `Channel ${channel.channelId} · ${channel.enabled ? 'Enabled' : 'Disabled'}`;
    description.append(title, detail);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = channel.enabled ? 'Disable' : 'Enable';
    toggle.setAttribute('aria-label', `${toggle.textContent} ${channel.title}`);
    toggle.addEventListener('click', async () => {
      if (busy) return;
      controls(true);
      try { await discordAdminRequest('/api/admin/discord/channels', { channel: { sourceId: channel.sourceId, channelId: channel.channelId, guildId: channel.guildId, title: channel.title, enabled: !channel.enabled } }); await load(); }
      catch (error) { status.textContent = error.message; }
      finally { controls(false); }
    });
    item.append(description, toggle); list.append(item);
  }
}
async function load() {
  controls(true); status.textContent = 'Loading selected channels…';
  try {
    const result = await discordAdminRequest();
    if (!Array.isArray(result.channels)) throw new Error('The channel list is unavailable.');
    content.hidden = false; render(result.channels);
    if (result.sync.guildId) { guild.value = result.sync.guildId; guild.readOnly = true; }
    status.textContent = result.sync.configured ? 'Channel settings are ready. Channel discovery runs separately.' : 'Channel settings are ready. Configure Discord discovery to refresh the catalogue.';
  } catch (error) { content.hidden = true; status.textContent = error.message; }
  finally { controls(false); }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; controls(true);
  try {
    const channel = { guildId: guild.value.trim(), channelId: document.getElementById('channel-id').value.trim(), title: document.getElementById('channel-title').value.trim(), enabled: true };
    await discordAdminRequest('/api/admin/discord/channels', { channel });
    document.getElementById('channel-id').value = document.getElementById('channel-title').value = '';
    await load();
  } catch (error) { status.textContent = error.message; }
  finally { controls(false); }
});
retry.addEventListener('click', () => { if (!busy) void load(); });
void load();
