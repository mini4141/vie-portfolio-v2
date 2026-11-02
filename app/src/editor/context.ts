import type { Editor } from '@tiptap/core';

export interface CtxAction { id: string; label: string; pressed?: boolean; disabled?: boolean; danger?: boolean; run: () => void }
export interface Ctx { kind: 'callout' | 'table'; label: string; el: HTMLElement; actions: CtxAction[] }

const KINDS = [['note', 'Note'], ['tip', 'Tip'], ['warn', 'Heads up']] as const;

/** The callout or table around the cursor, with the actions the small bar above it offers. */
export function contextFor(editor: Editor): Ctx | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name !== 'callout' && name !== 'table') continue;
    const dom = editor.view.nodeDOM($from.before(d));
    if (!(dom instanceof HTMLElement)) return null;
    const c = () => editor.chain().focus();
    if (name === 'callout') {
      const kind = $from.node(d).attrs.kind as string;
      const pos = $from.before(d);
      return {
        kind: 'callout', label: 'Callout', el: dom,
        actions: KINDS.map(([k, label]) => ({
          id: k, label, pressed: kind === k,
          run: () => { editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...$from.node(d).attrs, kind: k })); editor.commands.focus(); },
        })),
      };
    }
    const header = $from.node(d).firstChild?.firstChild?.type.name === 'tableHeader';
    return {
      kind: 'table', label: 'Table', el: (dom.closest('table') ?? dom) as HTMLElement,
      actions: [
        { id: 'row-add', label: '+ Row', run: () => void c().addRowAfter().run() },
        { id: 'col-add', label: '+ Column', run: () => void c().addColumnAfter().run() },
        { id: 'row-del', label: '− Row', run: () => void c().deleteRow().run() },
        { id: 'col-del', label: '− Column', run: () => void c().deleteColumn().run() },
        { id: 'header', label: 'Header row', pressed: header, run: () => void c().toggleHeaderRow().run() },
        { id: 'table-del', label: 'Delete table', danger: true, run: () => void c().deleteTable().run() },
      ],
    };
  }
  return null;
}
