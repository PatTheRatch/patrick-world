// Marking a new site: a slip beside the pencil cross, asking only for a name and a line.

import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { capture, draft, isPresent, markSite } from '../store';
import { visit } from '../view';

export function SiteCapture() {
  const c = capture.value;
  const name = useSignal('');
  const note = useSignal('');
  const input = useRef<HTMLInputElement>(null);
  const open = c?.type === 'site';

  useEffect(() => {
    if (open) {
      name.value = '';
      note.value = '';
      input.current?.focus();
    }
  }, [open, open ? c.at.x : 0, open ? c.at.y : 0]);

  if (!open) return null;

  const cancel = () => {
    capture.value = null;
    draft.value = null;
  };
  const submit = (e: Event) => {
    e.preventDefault();
    const n = name.value.trim();
    if (!n) return input.current?.focus();
    const id = markSite(n, note.value.trim() || 'No note yet.', c.at);
    cancel();
    if (isPresent.value) visit(id);
  };

  const x = Math.min(c.screen.x + 18, window.innerWidth - 300);
  const y = Math.min(c.screen.y + 14, window.innerHeight - 290);

  return (
    <form class="site slip" style={{ transform: `translate(${x}px, ${y}px)` }} onSubmit={submit}>
      <h2>Mark a site</h2>
      <label for="site-name">What is it called?</label>
      <input
        id="site-name"
        ref={input}
        type="text"
        autocomplete="off"
        placeholder="A working name"
        value={name.value}
        onInput={(e) => (name.value = (e.target as HTMLInputElement).value)}
      />
      <label for="site-note">What is it, in a line?</label>
      <input
        id="site-note"
        type="text"
        autocomplete="off"
        placeholder="The thought, as you would say it"
        value={note.value}
        onInput={(e) => (note.value = (e.target as HTMLInputElement).value)}
      />
      <p class="site-hint">It starts as a pencil cross. Only real work makes it grow.</p>
      <div class="note-actions">
        <button type="submit" class="link">
          Mark it here
        </button>
        <button type="button" class="link" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A line of instruction while a road is being surveyed. */
export function RoadHint() {
  if (capture.value?.type !== 'road') return null;
  return (
    <p class="hint slip" role="status">
      Click the place this road should reach. <kbd>Esc</kbd> to stop.
    </p>
  );
}
