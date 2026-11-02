import { Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { storyExtensions, toStoryHtml } from './extensions.ts';
import { buildPreview } from './preview.ts';
import { INSERTS, filterInserts, imageHtml, galleryHtml, type InsertItem } from './blocks.ts';
import { pickMedia } from './media-client.ts';
import { blockCount, blockIndexAtY, moveBlock, duplicateBlock, deleteBlock, addParagraphAfter, TURN_INTO, isTextBlock, selectInside } from './gutter.ts';
import { contextFor } from './context.ts';
import { editFigure, readFigure, figuresOf } from './picture.ts';

interface Data { id: number; role: string; slug: string; status: string; title: string; summary: string; story_html: string; tags: string[]; cover_id: number | null; cover: string; cover_alt: string }

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
const data: Data = JSON.parse($('#ed-data')!.textContent!);
const guest = data.role !== 'owner';
const toast = (m: string) => {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
};

/* ---------- fields ---------- */
const titleEl = $<HTMLInputElement>('[data-doc-title]')!;
const sumEl = $<HTMLTextAreaElement>('[data-doc-sum]')!;
const tagsEl = $('[data-tags]')!;
const tagInput = $<HTMLInputElement>('[data-tag-input]')!;
const featuredEl = $<HTMLInputElement>('[data-featured]')!;
const setters = $$<HTMLInputElement>('[data-set]');
let tags = [...data.tags];

function renderTags() {
  $$('.chip', tagsEl).forEach((c) => c.remove());
  for (const t of tags) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(t);
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', `Remove ${t}`);
    x.addEventListener('click', () => { tags = tags.filter((o) => o !== t); renderTags(); changed(); });
    chip.append(x);
    tagsEl.insertBefore(chip, tagInput);
  }
}
tagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const v = tagInput.value.trim().replace(/,$/, '');
    if (v && !tags.includes(v) && tags.length < 12) { tags.push(v); renderTags(); changed(); }
    tagInput.value = '';
  } else if (e.key === 'Backspace' && !tagInput.value && tags.length) { tags.pop(); renderTags(); changed(); }
});

/* ---------- editor ---------- */
const blockLabel: Record<string, string> = { h2: 'Heading', h3: 'Subheading', p: 'Text' };
const editor = new Editor({
  element: $('[data-rt]')!,
  extensions: [
    ...storyExtensions(),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? blockLabel[`h${node.attrs.level}`]! : 'Type / for blocks, or just start writing…'),
    }),
  ],
  content: data.story_html,
  editorProps: {
    attributes: { class: 'rt rt-edit', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Project story', spellcheck: 'true' },
    handleKeyDown: (_v, e) => slashKey(e),
  },
  onUpdate: () => { changed(); },
  onSelectionUpdate: () => { syncToolbar(); updateMenus(); },
  onTransaction: () => { syncToolbar(); },
});
const story = () => toStoryHtml(editor.getHTML());

/* ---------- autosave ---------- */
const autosave = $('[data-autosave]')!, autosaveText = $('[data-autosave-text]')!;
let timer: ReturnType<typeof setTimeout> | undefined, lastSent = '', saving = false, dirty = false;
const status = (t: string, typing = false) => { autosaveText.textContent = t; autosave.classList.toggle('typing', typing); };

function payload() {
  const v = (k: string) => setters.find((s) => s.dataset.set === k)!.value.trim();
  return {
    title: titleEl.value.trim() || data.title,
    summary: sumEl.value.trim(),
    story_html: story(),
    tags,
    kind: v('kind'), role: v('role'), stack: v('stack'), live_url: v('live_url'), src_url: v('src_url'),
    started: v('started'), finished: v('finished'),
    featured: featuredEl.checked,
    cover_media_id: data.cover_id,
  };
}

async function save(): Promise<boolean> {
  if (guest) return false;
  clearTimeout(timer);
  if (saving) { timer = setTimeout(save, 400); return false; }
  const body = payload(), s = JSON.stringify(body);
  if (s === lastSent) { dirty = false; status('All changes saved'); return true; }
  saving = true; status('Saving…', true);
  try {
    const r = await fetch(`/api/projects/${data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: s, keepalive: s.length < 60_000 });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { status(j.message || 'Couldn’t save. Will retry.', true); toast(j.message || 'Couldn’t save your changes.'); return false; }
    lastSent = s; dirty = false;
    status(`Saved ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    return true;
  } catch {
    status('Offline — will retry', true);
    timer = setTimeout(save, 5000);
    return false;
  } finally { saving = false; }
}

function changed() {
  dirty = true;
  $$('[data-title-echo]').forEach((e) => (e.textContent = titleEl.value || 'Untitled'));
  $('[data-sum-count]')!.textContent = `${sumEl.value.length} / 140`;
  updateStats(); schedulePreview();
  if (guest) { status('Not saved — guest mode', true); return; }
  status('Unsaved changes…', true);
  clearTimeout(timer); timer = setTimeout(save, 1500);
}
for (const el of [titleEl, sumEl, ...setters, featuredEl]) el.addEventListener('input', changed);
featuredEl.addEventListener('change', () => { $('[data-feat-badge]')!.hidden = !featuredEl.checked; });
window.addEventListener('beforeunload', (e) => { if (dirty && !guest) { void save(); e.preventDefault(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) void save(); });
if (guest) {
  let told = false;
  editor.on('update', () => { if (!told) { told = true; toast('Type away — nothing you change here will be saved.'); } });
}

function updateStats() {
  const words = (editor.getText().match(/\S+/g) ?? []).length;
  $('[data-ed-stats]')!.textContent = `${words} words · ${Math.max(1, Math.round(words / 200))} min read`;
}

/* ---------- toolbar ---------- */
const cmdRun: Record<string, () => void> = {
  bold: () => editor.chain().focus().toggleBold().run(),
  italic: () => editor.chain().focus().toggleItalic().run(),
  strike: () => editor.chain().focus().toggleStrike().run(),
  code: () => editor.chain().focus().toggleCode().run(),
  mark: () => editor.chain().focus().toggleHighlight().run(),
  ul: () => editor.chain().focus().toggleBulletList().run(),
  ol: () => editor.chain().focus().toggleOrderedList().run(),
  link: () => openLink(),
};
const markName: Record<string, string> = { bold: 'bold', italic: 'italic', strike: 'strike', code: 'code', mark: 'highlight', ul: 'bulletList', ol: 'orderedList', link: 'link' };
// mousedown must not steal the editor selection
$$('[data-cmd],[data-hist],[data-insert]').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
$$('[data-cmd]').forEach((b) => b.addEventListener('click', () => cmdRun[b.dataset.cmd!]!()));
$$('[data-hist]').forEach((b) => b.addEventListener('click', () => (b.dataset.hist === 'undo' ? editor.chain().focus().undo().run() : editor.chain().focus().redo().run())));
const blockSel = $<HTMLSelectElement>('[data-block-type]')!;
blockSel.addEventListener('change', () => {
  const c = editor.chain().focus();
  switch (blockSel.value) {
    case 'p': c.setParagraph().run(); break;
    case 'h2': c.setHeading({ level: 2 }).run(); break;
    case 'h3': c.setHeading({ level: 3 }).run(); break;
    case 'ul': c.toggleBulletList().run(); break;
    case 'ol': c.toggleOrderedList().run(); break;
    case 'quote': c.toggleBlockquote().run(); break;
    case 'callout': c.toggleWrap('callout').run(); break;
    case 'pre': c.toggleCodeBlock().run(); break;
  }
});

function syncToolbar() {
  $$('[data-cmd]').forEach((b) => b.setAttribute('aria-pressed', String(editor.isActive(markName[b.dataset.cmd!]!))));
  const a = editor.isActive.bind(editor);
  blockSel.value = a('heading', { level: 2 }) ? 'h2' : a('heading', { level: 3 }) ? 'h3' : a('bulletList') ? 'ul' : a('orderedList') ? 'ol'
    : a('blockquote') ? 'quote' : a('callout') ? 'callout' : a('codeBlock') ? 'pre' : a('paragraph') ? 'p' : '';
  $<HTMLButtonElement>('[data-hist=undo]')!.disabled = !editor.can().undo();
  $<HTMLButtonElement>('[data-hist=redo]')!.disabled = !editor.can().redo();
}

/* ---------- popup menu (slash + insert) ---------- */
const pop = $('[data-pop]')!;
let popItems: InsertItem[] = [], popIdx = 0, popMode: 'none' | 'slash' | 'insert' = 'none', slashFrom = -1;

function renderPop() {
  pop.replaceChildren();
  if (!popItems.length) { const n = document.createElement('div'); n.className = 'pop-none'; n.textContent = 'No matching block'; pop.append(n); return; }
  let group = '';
  popItems.forEach((it, i) => {
    if (it.group !== group) { group = it.group; const h = document.createElement('div'); h.className = 'pop-h'; h.textContent = group; pop.append(h); }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pop-i' + (i === popIdx ? ' on' : ''); b.setAttribute('role', 'menuitem');
    const gl = document.createElement('span'); gl.className = 'gl'; gl.textContent = it.glyph;
    const t = document.createElement('span'); const bb = document.createElement('b'); bb.textContent = it.label; const sm = document.createElement('small'); sm.textContent = it.hint;
    t.append(bb, sm); b.append(gl, t);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => pick(it));
    pop.append(b);
  });
  pop.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function openPop(mode: 'slash' | 'insert', items: InsertItem[], x: number, y: number) {
  popMode = mode; popItems = items; popIdx = 0; renderPop();
  pop.hidden = false;
  const w = 280, h = Math.min(360, innerHeight * 0.6);
  pop.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
  pop.style.top = `${y + h > innerHeight - 8 ? Math.max(8, y - h - 30) : y}px`;
}
function closePop() { pop.hidden = true; popMode = 'none'; slashFrom = -1; }
function pick(it: InsertItem) {
  const c = editor.chain().focus();
  if (popMode === 'slash' && slashFrom >= 0) c.deleteRange({ from: slashFrom, to: editor.state.selection.from });
  closePop();
  if (it.pick) { c.run(); void insertPictures(it.pick); return; }
  it.run(c, editor).run();
}
async function insertPictures(kind: 'image' | 'gallery') {
  const got = await pickMedia({ kind: 'image', multiple: kind === 'gallery', title: kind === 'gallery' ? 'Choose pictures for the gallery' : 'Choose a picture' });
  editor.commands.focus();
  if (!got?.length) return;
  editor.chain().focus().insertContent(kind === 'gallery' ? galleryHtml(got) : imageHtml(got[0]!)).run();
}
function slashKey(e: KeyboardEvent): boolean {
  if (popMode === 'none') return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (popItems.length) { popIdx = (popIdx + (e.key === 'ArrowDown' ? 1 : -1) + popItems.length) % popItems.length; renderPop(); }
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') { if (popItems[popIdx]) { pick(popItems[popIdx]!); return true; } closePop(); return false; }
  if (e.key === 'Escape') { closePop(); return true; }
  return false;
}
function updateMenus() {
  // slash menu: a "/word" typed at the start of an empty-so-far paragraph
  const { $from, empty } = editor.state.selection;
  const text = $from.parent.textContent;
  if (empty && $from.parent.type.name === 'paragraph' && /^\/[\w ]{0,20}$/.test(text) && $from.parentOffset === text.length) {
    const rect = editor.view.coordsAtPos($from.pos);
    slashFrom = $from.pos - text.length;
    const items = filterInserts(text.slice(1));
    if (popMode !== 'slash') openPop('slash', items, rect.left, rect.bottom + 6);
    else {
      popItems = items; popIdx = Math.min(popIdx, Math.max(0, items.length - 1)); renderPop();
      pop.style.top = `${rect.bottom + 6}px`; // the page may have scrolled since the menu opened
    }
  } else if (popMode === 'slash') closePop();
  // bubble toolbar
  const sel = editor.state.selection;
  if (!sel.empty && editor.isActive('paragraph') || (!sel.empty && editor.isActive('heading'))) showBubble(); else if (bubbleMode !== 'link') hideBubble();
}
$$('[data-insert]').forEach((b) => b.addEventListener('click', () => {
  if (popMode === 'insert') { closePop(); return; }
  if (b.dataset.atEnd !== undefined) editor.chain().focus('end').run();
  const r = b.getBoundingClientRect();
  openPop('insert', INSERTS, r.left, r.bottom + 6);
}));
document.addEventListener('mousedown', (e) => { if (popMode !== 'none' && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-insert]')) closePop(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popMode === 'insert') { closePop(); editor.commands.focus(); } });

/* ---------- bubble toolbar + links ---------- */
const bubble = $('[data-bubble]')!, linkForm = $<HTMLFormElement>('[data-link-form]')!, linkInput = $<HTMLInputElement>('input', linkForm)!;
let bubbleMode: '' | 'link' = '';
function placeBubble() {
  const { from, to } = editor.state.selection;
  const a = editor.view.coordsAtPos(from), b = editor.view.coordsAtPos(to);
  bubble.hidden = false;
  const w = bubble.offsetWidth;
  bubble.style.left = `${Math.max(8, Math.min((a.left + b.right) / 2 - w / 2, innerWidth - w - 8))}px`;
  bubble.style.top = `${Math.max(8, a.top - bubble.offsetHeight - 8)}px`;
}
function showBubble() { bubble.dataset.mode = ''; bubbleMode = ''; placeBubble(); }
function hideBubble() { bubble.hidden = true; bubbleMode = ''; bubble.dataset.mode = ''; }
function openLink() {
  if (editor.state.selection.empty && !editor.isActive('link')) { toast('Select some text first, then add a link.'); return; }
  linkInput.value = (editor.getAttributes('link').href as string) ?? '';
  bubble.dataset.mode = 'link'; bubbleMode = 'link'; placeBubble();
  linkInput.focus();
}
const normalUrl = (v: string) => {
  v = v.trim();
  if (!v) return '';
  if (/^(https?:|mailto:)/i.test(v)) return v;
  return /^[\w.-]+\.[a-z]{2,}/i.test(v) ? `https://${v}` : '';
};
linkForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = normalUrl(linkInput.value);
  if (!url) { toast('Links must start with https:// or http://.'); return; }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  hideBubble();
});
$('[data-unlink]')!.addEventListener('click', () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); hideBubble(); });
linkInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { hideBubble(); editor.commands.focus(); } });
bubble.addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); });
editor.on('blur', ({ event }) => { if (!(event as FocusEvent | undefined)?.relatedTarget || !bubble.contains((event as FocusEvent).relatedTarget as Node)) { if (bubbleMode !== 'link') hideBubble(); } });
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && editor.isFocused) { e.preventDefault(); openLink(); } });

/* ---------- block bar: callout kind, table rows/columns ---------- */
const ctxBar = $('[data-ctx]')!;
let ctxKey = '';
function updateCtx() {
  const ctx = editor.isFocused || ctxBar.contains(document.activeElement) ? contextFor(editor) : null;
  if (!ctx || !bubble.hidden) { ctxBar.hidden = true; ctxKey = ''; return; }
  const key = `${ctx.kind}:${ctx.actions.map((a) => `${a.id}${a.pressed ? '*' : ''}`).join()}`;
  if (key !== ctxKey) {
    ctxKey = key;
    ctxBar.replaceChildren(...ctx.actions.map((a) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tb'; b.textContent = a.label;
      if (a.pressed !== undefined) b.setAttribute('aria-pressed', String(a.pressed));
      if (a.danger) b.dataset.danger = '';
      b.addEventListener('click', () => a.run());
      return b;
    }));
    ctxBar.setAttribute('aria-label', `${ctx.label} options`);
  }
  ctxBar.hidden = false;
  const r = ctx.el.getBoundingClientRect(), w = ctxBar.offsetWidth;
  if (r.bottom < 90 || r.top > innerHeight) { ctxBar.hidden = true; return; } // scrolled out of view
  ctxBar.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  ctxBar.style.top = `${Math.max(8, r.top - ctxBar.offsetHeight - 6)}px`;
}
ctxBar.addEventListener('mousedown', (e) => e.preventDefault());
editor.on('transaction', updateCtx);
editor.on('blur', () => setTimeout(updateCtx, 0));
addEventListener('scroll', updateCtx, true);
addEventListener('resize', updateCtx);

/* ---------- block gutter: add below, drag to move, block menu ---------- */
const gutter = $('[data-gutter]')!, gHandle = $('[data-handle]', gutter)!, gAdd = $('[data-add]', gutter)!, docWrap = gutter.parentElement!;
const dropLine = document.createElement('div');
dropLine.className = 'drop-line'; dropLine.hidden = true; docWrap.appendChild(dropLine);
const blockEl = (i: number) => editor.view.dom.children[i] as HTMLElement | undefined;
let gIndex = -1, dragFrom = -1, dropTo = -1, menu: HTMLElement | null = null;
function showGutter(i: number) {
  const b = blockEl(i);
  if (!b) return;
  gIndex = i;
  const lh = parseFloat(getComputedStyle(b).lineHeight), off = b.tagName === 'HR' ? -13 : Number.isNaN(lh) ? 0 : Math.max(0, (Math.min(lh, 40) - 26) / 2);
  // a tall block can start under the sticky toolbar: keep the gutter in the visible part of it
  const bar = $('.rt-toolbar')?.getBoundingClientRect().bottom ?? 0, br = b.getBoundingClientRect();
  const y = Math.min(Math.max(br.top + off, bar + 6), Math.max(br.top + off, br.bottom - 32));
  gutter.style.top = `${y - docWrap.getBoundingClientRect().top}px`;
  gutter.classList.add('on');
}
function closeMenu() { menu?.remove(); menu = null; }
docWrap.addEventListener('mousemove', (e) => { if (dragFrom < 0 && !menu && !(e.target as HTMLElement).closest('.gutter')) showGutter(blockIndexAtY(editor, e.clientY)); });
docWrap.addEventListener('mouseleave', () => { if (!menu) gutter.classList.remove('on'); });
editor.view.dom.addEventListener('keydown', () => gutter.classList.remove('on'));
$$('button', gutter).forEach((b) => b.addEventListener('mousedown', (e) => { if (b !== gHandle) e.preventDefault(); }));
gAdd.addEventListener('click', () => {
  addParagraphAfter(editor, gIndex);
  editor.commands.focus();
  const r = gAdd.getBoundingClientRect();
  openPop('insert', INSERTS, r.right + 6, r.top);
});
function openBlockMenu() {
  closeMenu(); closePop();
  const i = gIndex, n = blockCount(editor);
  const items: { label: string; run: () => void; danger?: boolean; sep?: string }[] = [];
  let turned = 0;
  items.push({ sep: 'Block', label: 'Move up', run: () => void moveBlock(editor, i, i - 1) });
  items.push({ label: 'Move down', run: () => void moveBlock(editor, i, i + 1) });
  items.push({ label: 'Duplicate', run: () => void duplicateBlock(editor, i) });
  items.push({ label: 'Delete', danger: true, run: () => void deleteBlock(editor, i) });
  if (isTextBlock(editor, i)) TURN_INTO.forEach((t) => items.push({ sep: !turned++ ? 'Turn into' : undefined, label: t.label, run: () => { selectInside(editor, i); t.run(editor); } }));
  menu = document.createElement('div');
  menu.className = 'pop'; menu.setAttribute('role', 'menu');
  for (const it of items) {
    if (it.sep) { const h = document.createElement('div'); h.className = 'pop-h'; h.textContent = it.sep; menu.append(h); }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pop-i' + (it.danger ? ' danger' : ''); b.setAttribute('role', 'menuitem');
    b.disabled = (it.label === 'Move up' && i === 0) || (it.label === 'Move down' && i === n - 1);
    b.innerHTML = '<span><b></b></span>'; b.querySelector('b')!.textContent = it.label;
    b.addEventListener('click', () => { closeMenu(); it.run(); editor.commands.focus(); });
    menu.append(b);
  }
  document.body.append(menu);
  const r = gHandle.getBoundingClientRect();
  menu.style.left = `${r.right + 6}px`;
  menu.style.top = `${Math.max(8, Math.min(r.top, innerHeight - menu.offsetHeight - 8))}px`;
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}
gHandle.addEventListener('click', () => { if (menu) closeMenu(); else openBlockMenu(); });
document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target as Node) && !gHandle.contains(e.target as Node)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) { closeMenu(); gHandle.focus(); } });
gHandle.addEventListener('dragstart', (e) => {
  dragFrom = gIndex; closeMenu(); closePop();
  e.dataTransfer!.effectAllowed = 'move';
  try { e.dataTransfer!.setData('text/plain', ''); const b = blockEl(dragFrom); if (b) e.dataTransfer!.setDragImage(b, 0, 0); } catch { /* drag image is optional */ }
  setTimeout(() => blockEl(dragFrom)?.classList.add('is-drag'), 0);
});
function endDrag() { blockEl(dragFrom)?.classList.remove('is-drag'); dragFrom = -1; dropTo = -1; dropLine.hidden = true; }
gHandle.addEventListener('dragend', endDrag);
docWrap.addEventListener('dragover', (e) => {
  if (dragFrom < 0) return;
  e.preventDefault(); e.dataTransfer!.dropEffect = 'move';
  const kids = Array.from(editor.view.dom.children) as HTMLElement[];
  let slot = kids.length; // slot = the gap before block `slot`
  for (let i = 0; i < kids.length; i++) { const r = kids[i]!.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { slot = i; break; } }
  dropTo = slot > dragFrom ? slot - 1 : slot; // index in the final order
  const ref = kids[slot] ?? kids[kids.length - 1]!, wrapTop = docWrap.getBoundingClientRect().top;
  dropLine.hidden = false;
  dropLine.style.top = `${(slot < kids.length ? ref.getBoundingClientRect().top - 9 : ref.getBoundingClientRect().bottom + 7) - wrapTop}px`;
}, true);
docWrap.addEventListener('drop', (e) => {
  if (dragFrom < 0) return;
  e.preventDefault(); e.stopPropagation();
  const from = dragFrom, to = dropTo;
  endDrag();
  moveBlock(editor, from, to);
}, true);

/* ---------- modes + preview ---------- */
const form = $('[data-ed-form]')!, frame = $('[data-preview-frame]')!, iframe = $<HTMLIFrameElement>('iframe', frame)!;
let mode = 'edit', pvTimer: ReturnType<typeof setTimeout> | undefined;
function renderPreview() {
  iframe.srcdoc = buildPreview({
    slug: data.slug, title: titleEl.value, summary: sumEl.value, story: story(), cover: data.cover, coverAlt: data.cover_alt,
    kind: setters.find((s) => s.dataset.set === 'kind')!.value, role: setters.find((s) => s.dataset.set === 'role')!.value,
    stack: setters.find((s) => s.dataset.set === 'stack')!.value, tags,
    started: setters.find((s) => s.dataset.set === 'started')!.value, finished: setters.find((s) => s.dataset.set === 'finished')!.value,
  });
  fitFrame();
}
function schedulePreview() { if (mode === 'edit') return; clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 350); }
function fitFrame() {
  const phone = frame.dataset.size === 'phone', inner = frame.firstElementChild as HTMLElement;
  const w = phone ? 390 : 1200, avail = frame.clientWidth - 28 - (phone ? 16 : 0);
  const scale = Math.min(1, avail / w);
  iframe.style.width = `${w}px`;
  iframe.style.height = `${(frame.clientHeight - 28) / scale}px`;
  inner.style.transform = `scale(${scale})`;
  inner.style.width = `${w + (phone ? 16 : 0)}px`;
  inner.style.height = `${frame.clientHeight - 28}px`;
}
$$('[data-mode-btn]').forEach((b) => b.addEventListener('click', () => {
  mode = b.dataset.modeBtn!;
  form.setAttribute('data-mode', mode);
  $$('[data-mode-btn]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  if (mode !== 'edit') { renderPreview(); }
}));
$$('[data-preview-size]').forEach((b) => b.addEventListener('click', () => {
  frame.dataset.size = b.dataset.previewSize!;
  $$('[data-preview-size]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  fitFrame();
}));
addEventListener('resize', () => { if (mode !== 'edit') fitFrame(); });
new MutationObserver(() => { if (mode !== 'edit') renderPreview(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------- edit an existing picture, video or gallery figure ---------- */
function editPictureDialog(blockPos: number, index: number) {
  const node = editor.state.doc.nodeAt(blockPos);
  if (!node || node.type.name !== 'mediaBlock') return;
  const host = document.createElement('div');
  host.innerHTML = node.attrs.html;
  const fig = figuresOf(host)[index];
  if (!fig) return;
  const f = readFigure(fig);
  let replacement: { url: string; alt: string; original_name: string } | null = null;
  const dlg = document.createElement('dialog');
  dlg.className = 'welcome picker';
  dlg.setAttribute('aria-label', 'Edit picture');
  dlg.innerHTML = `<div class="picker-head"><h2>Edit picture</h2></div>
    <div class="picker-foot">
      <p class="hint" data-file></p>
      <label class="field"${f.hasAlt ? '' : ' hidden'}><span class="flabel">Description <span class="hint">(for screen readers)</span></span><input class="input" data-alt maxlength="300"></label>
      <label class="field"><span class="flabel">Caption <span class="hint">(shown under the picture)</span></span><input class="input" data-cap maxlength="300"></label>
      <div class="actions"><button type="button" class="btn btn-primary" data-ok>Done</button>${f.hasAlt ? '<button type="button" class="btn" data-replace>Replace picture</button>' : ''}<button type="button" class="btn" data-no>Cancel</button></div>
    </div>`;
  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
  q('[data-file]').textContent = f.name;
  q<HTMLInputElement>('[data-alt]').value = f.alt;
  q<HTMLInputElement>('[data-cap]').value = f.caption;
  dlg.querySelector('[data-replace]')?.addEventListener('click', async () => {
    const got = await pickMedia({ kind: 'image', title: 'Choose a replacement picture' });
    if (!got?.[0]) return;
    replacement = got[0];
    q('[data-file]').textContent = got[0].original_name;
    q<HTMLInputElement>('[data-alt]').value = got[0].alt;
  });
  q('[data-no]').addEventListener('click', () => dlg.close());
  q('[data-ok]').addEventListener('click', () => {
    const html = editFigure(node.attrs.html, index, {
      alt: f.hasAlt ? q<HTMLInputElement>('[data-alt]').value.trim() : undefined,
      caption: q<HTMLInputElement>('[data-cap]').value,
      replace: replacement ?? undefined,
    });
    if (html !== node.attrs.html) editor.view.dispatch(editor.state.tr.setNodeMarkup(blockPos, undefined, { html }));
    dlg.close();
  });
  dlg.addEventListener('close', () => { dlg.remove(); editor.commands.focus(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  q<HTMLInputElement>('[data-cap]').focus();
}
editor.view.dom.addEventListener('dblclick', (e) => {
  const fig = (e.target as HTMLElement).closest('figure');
  if (!fig) return;
  const block = fig.closest('.shots') ?? fig;
  let hit = -1;
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'mediaBlock' && editor.view.nodeDOM(pos) === block) hit = pos;
    return false;
  });
  if (hit < 0) return;
  e.preventDefault();
  editPictureDialog(hit, block === fig ? 0 : Array.from(block.querySelectorAll('figure')).indexOf(fig));
});

/* ---------- cover ---------- */
const coverImg = $<HTMLImageElement>('[data-cover]')!, noCover = $('[data-no-cover]')!, coverClear = $('[data-cover-clear]')!;
function showCover(id: number | null, url = '', alt = '') {
  data.cover_id = id; data.cover = url; data.cover_alt = alt;
  coverImg.hidden = !url; noCover.hidden = !!url; coverClear.hidden = !url;
  if (url) { coverImg.src = url; coverImg.alt = alt; }
  changed();
}
$('[data-cover-pick]')!.addEventListener('click', async () => {
  if (guest) return;
  const got = await pickMedia({ kind: 'image', title: 'Choose a cover picture', selected: data.cover_id ?? undefined });
  if (got?.[0]) showCover(got[0].id, got[0].url, got[0].alt);
});
coverClear.addEventListener('click', () => { if (!guest) showCover(null); });

/* ---------- header actions ---------- */
async function call(method: string, url: string, body?: unknown) {
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.message || 'Something went wrong. Please try again.'); return null; }
    return j;
  } catch { toast('Can’t reach the server. Check your connection.'); return null; }
}
function setPublished(on: boolean) {
  data.status = on ? 'published' : 'draft';
  $<HTMLElement>('[data-act=publish]')!.hidden = on;
  $<HTMLElement>('[data-act=unpublish]')!.hidden = !on;
  $<HTMLElement>('[data-live-link]')!.hidden = !on;
  const badge = $('[data-status-badge]')!;
  badge.textContent = on ? 'Published' : 'Draft';
  badge.className = `badge ${on ? 'pub' : 'draft'}`;
}
$$('[data-act]').forEach((b) => b.addEventListener('click', async () => {
  if (guest) return;
  const act = b.dataset.act;
  if (act === 'publish' || act === 'unpublish') {
    if (!(await save()) && dirty) return;
    const r = await call('PATCH', `/api/projects/${data.id}`, { status: act === 'publish' ? 'published' : 'draft' });
    if (!r) return;
    setPublished(act === 'publish');
    toast(act === 'publish' ? 'Published. It’s live on your site.' : 'Unpublished. It’s hidden from visitors again.');
  } else if (act === 'duplicate') {
    await save();
    const r = await call('POST', `/api/projects/${data.id}/duplicate`);
    if (r) location.href = `/admin/projects/${r.project.id}`;
  } else if (act === 'delete') {
    ($('#del-dlg') as HTMLDialogElement).showModal();
  }
}));
$('#del-yes')!.addEventListener('click', async () => {
  dirty = false;
  if (await call('DELETE', `/api/projects/${data.id}`)) location.href = '/admin#projects';
});

/* ---------- boot ---------- */
renderTags();
changed();
dirty = false;
status(guest ? 'Autosave is off in guest mode' : 'All changes saved');
lastSent = JSON.stringify(payload());
syncToolbar();
