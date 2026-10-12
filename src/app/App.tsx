import { useEffect } from 'preact/hooks';
import { RANKS } from '../world/types';
import { World } from './World';
import { TODAY, asOf, deriveMs, events, keyOpen, load, loaded, method, world } from './store';
import { enter, getRenderer, inspect, play, visit } from './view';
import { RoadHint, SiteCapture } from './ui/Capture';
import { Cartouche } from './ui/Cartouche';
import { EditionDial } from './ui/EditionDial';
import { KeySheet, MethodNote } from './ui/KeySheet';
import { SurveyNote } from './ui/SurveyNote';
import { useSignal } from '@preact/signals';

const params = new URLSearchParams(location.search);
if (params.has('still')) document.documentElement.classList.add('is-still');

export function App() {
  useEffect(() => {
    void load().then(() => {
      // Once per session, draw the atlas from its first edition to today.
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let seen = false;
      try {
        seen = sessionStorage.getItem('patricks-world/intro') === '1';
        sessionStorage.setItem('patricks-world/intro', '1');
      } catch {
        // Storage can be unavailable; the intro simply plays.
      }
      const at = params.get('at');
      if (at) asOf.value = at;
      else if (!reduce && !seen && !params.has('still')) {
        asOf.value = world.value.beginsAt;
        play(3600);
      }
      // Deep links: ?go=place or ?go=place/feature, ?close, ?method=id, ?key, ?still (no motion).
      const follow = (tries = 0) => {
        const r = getRenderer();
        if (!r) {
          if (tries < 40) setTimeout(() => follow(tries + 1), 25);
          return;
        }
        if (params.has('still')) r.camera.reducedMotion = true;
        const m = params.get('method');
        if (m) method.value = m;
        if (params.has('key')) keyOpen.value = true;
        const [place, feature] = (params.get('go') ?? '').split('/');
        if (place && feature) inspect(place, feature, true);
        else if (place) (params.has('close') ? enter : visit)(place);
      };
      follow();
    });
  }, []);

  if (!loaded.value) return <p class="loading">Unrolling the sheet…</p>;

  return (
    <>
      <World />
      <PlaceIndex />
      <SurveyNote />
      <MethodNote />
      <SiteCapture />
      <RoadHint />
      <Cartouche />
      <EditionDial />
      <KeySheet />
      {params.has('perf') && <Perf />}
    </>
  );
}

/** Every place as a real button, so the world is reachable without a pointer. */
function PlaceIndex() {
  const places = [...world.value.places].sort(
    (a, b) => RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank) || b.commits - a.commits,
  );
  return (
    <nav class="index" aria-label="Places">
      <ul>
        {places.map((p) => (
          <li key={p.id}>
            <button type="button" onFocus={() => visit(p.id)} onClick={() => enter(p.id)}>
              {p.name}, {p.rank === 'major' ? 'major city' : p.rank}, {p.liveliness}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Perf() {
  const frame = useSignal(0);
  useEffect(() => {
    const id = setInterval(() => (frame.value = getRenderer()?.frameMs ?? 0), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <p class="perf">
      frame {frame.value.toFixed(1)} ms · derive {deriveMs.value.toFixed(1)} ms · {events.value.length.toLocaleString('en-US')}{' '}
      events · {world.value.places.length} places · {asOf.value === TODAY.value ? 'present' : asOf.value}
    </p>
  );
}
