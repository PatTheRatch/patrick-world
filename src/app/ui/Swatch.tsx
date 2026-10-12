// Small drawings of how a building looks at each stage. Used in the Key and in notes,
// so the legend is always the same drawing as the map.

import { INK, WASH, css, mix } from '../../render/palette';
import type { FeatureKind, FeatureStage } from '../../world/types';

export const STAGE_NAME: Record<FeatureStage, string> = {
  concept: 'Proposed',
  planned: 'Staked',
  designed: 'From plans',
  building: 'Being built',
  working: 'Working',
  mature: 'Mature',
};

export const STAGE_MEANING: Record<FeatureStage, string> = {
  concept: 'An idea for it. A pencilled lot and a stake.',
  planned: 'Decided on. Outlined in pencil.',
  designed: 'Drawn up. A dashed ink outline.',
  building: 'Under way. Washed as far as it has risen, hatched beyond.',
  working: 'It runs. Fully washed, with a shadow as long as the work in it.',
  mature: 'Proven and added to. A heavy wall and annexes.',
};

export function StageSwatch({ stage, kind = 'works', size = 1 }: { stage: FeatureStage; kind?: FeatureKind; size?: number }) {
  const wash = css(WASH[kind]);
  const ink = css(INK.black);
  const pencil = css(INK.graphite);
  const w = 40;
  const h = 30;
  const id = `hatch-${kind}`;
  return (
    <svg width={w * size} height={h * size} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" class="swatch">
      <defs>
        <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke={ink} stroke-width="0.7" opacity="0.5" />
        </pattern>
      </defs>
      {stage === 'concept' && (
        <g fill="none" stroke={pencil}>
          <rect x="5.5" y="5.5" width="27" height="19" stroke-width="1.1" stroke-dasharray="0.2 3.2" stroke-linecap="round" />
          <circle cx="19" cy="15" r="1.8" stroke-width="0.9" />
          <path d="M15.5 15h7M19 11.5v7" stroke-width="0.9" />
        </g>
      )}
      {stage === 'planned' && <rect x="7.5" y="7.5" width="23" height="15" fill="none" stroke={pencil} stroke-width="1.3" />}
      {stage === 'designed' && (
        <rect x="7.5" y="7.5" width="23" height="15" fill="none" stroke={ink} stroke-width="1.1" stroke-dasharray="4 2.6" />
      )}
      {stage === 'building' && (
        <g>
          <rect x="7.5" y="7.5" width="11" height="15" fill={wash} opacity="0.8" />
          <rect x="18.5" y="7.5" width="12" height="15" fill={`url(#${id})`} />
          <rect x="7.5" y="7.5" width="23" height="15" fill="none" stroke={ink} stroke-width="1.2" stroke-dasharray="4 2.8" />
        </g>
      )}
      {stage === 'working' && (
        <g>
          <path d="M7.5 22.5l2.4 3h23l-2.4-3zM30.5 7.5l2.4 3v15l-2.4-3z" fill={ink} opacity="0.24" />
          <rect x="7.5" y="7.5" width="23" height="15" fill={wash} stroke={ink} stroke-width="1" />
        </g>
      )}
      {stage === 'mature' && (
        <g>
          <path d="M5.5 22.5l4.6 5.6h25.4l-4.6-5.6zM30.5 5.5l4.6 5.6v17l-4.6-5.6z" fill={ink} opacity="0.24" />
          <rect x="24.5" y="2.5" width="6" height="4" fill={css(mix(WASH[kind], INK.black, 0.13))} stroke={ink} stroke-width="1.5" />
          <rect x="5.5" y="5.5" width="25" height="17" fill={css(mix(WASH[kind], INK.black, 0.13))} stroke={ink} stroke-width="1.9" />
        </g>
      )}
    </svg>
  );
}

export function WashSwatch({ kind }: { kind: FeatureKind }) {
  return (
    <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true" class="swatch">
      <rect x="1" y="1" width="24" height="16" fill={css(WASH[kind])} stroke={css(INK.black)} stroke-width="1" />
    </svg>
  );
}
