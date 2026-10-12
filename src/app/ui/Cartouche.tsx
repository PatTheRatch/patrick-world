// The title block, where a map keeps it: what this is, which edition, how much is on it.

import { monthYear } from '../dates';
import { asOf, clearManual, hasManual, isPresent, keyOpen, selection, whereabouts, world } from '../store';
import { goHome } from '../view';

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function Cartouche() {
  const w = world.value;
  const where = whereabouts.value;
  const built = w.places.filter((p) => p.commits > 0).length;
  const pencilled = w.places.length - built;
  const buildings = w.places.reduce(
    (n, p) => n + p.features.filter((f) => f.stage === 'working' || f.stage === 'mature').length,
    0,
  );
  const present = isPresent.value;
  const location = [where.region, where.place].filter(Boolean).join(' · ') || 'The whole territory';

  return (
    <header class="cartouche slip">
      <h1>Patrick’s World</h1>
      <p class="cartouche-where">{location}</p>
      <p class={`cartouche-edition${present ? '' : ' is-past'}`}>
        {present ? `Current edition, ${monthYear(asOf.value)}` : `Corrected to ${monthYear(asOf.value)}. Read only.`}
      </p>
      <p class="cartouche-tally">
        {count(built, 'place', 'places')} built on, {count(pencilled, 'idea', 'ideas')} pencilled,{' '}
        {count(buildings, 'building', 'buildings')} standing.
      </p>
      <nav class="cartouche-actions" aria-label="Map">
        <button type="button" class="link" onClick={() => (keyOpen.value = true)}>
          Key <kbd>K</kbd>
        </button>
        <button
          type="button"
          class="link"
          onClick={() => {
            selection.value = null;
            goHome();
          }}
        >
          Whole sheet <kbd>0</kbd>
        </button>
        {hasManual.value && (
          <button type="button" class="link" onClick={clearManual}>
            Erase my marks
          </button>
        )}
      </nav>
      <p class="cartouche-specimen">Specimen sheet. Every place, date and figure on it is fictional.</p>
    </header>
  );
}
