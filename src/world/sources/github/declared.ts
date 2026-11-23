// A repository's own definition, read through its history.
//
// The file has no dates in it and needs none: git has them. Each commit that touched
// `patrick-world.json` is a revision, and the day of that commit is the day its claims were
// first made. So a feature the file calls planned is planned FROM the day the file first
// named it, the edition dial can be turned back past that day, and a feature's lot is fixed
// by a date that never changes however often the file is edited afterwards.
//
// Pure: no DOM, no fetch, no clock.

import { parseDefinition, settleStage } from '../../definition';
import type { CityDefinition, EvidencedStage } from '../../definition';
import { isoDay } from '../../time';
import { STAGES } from '../../types';
import type { FeatureStage } from '../../types';
import type { GithubDefinition } from './raw';
import type { InferredStages } from './transform';

/** The file said this feature was at `stage`, from the day `at`. */
export interface StageClaim {
  at: string;
  stage: FeatureStage;
}

export interface DeclaredCity {
  /** The newest revision that reads cleanly. */
  definition: CityDefinition;
  /** The day each feature was first named, by feature id. */
  knownAt: Map<string, string>;
  /** Each feature's claimed stage over time: one entry per change, oldest first. */
  claims: Map<string, StageClaim[]>;
  /** The day each link first appeared, by `linkKey`. */
  linkedAt: Map<string, string>;
}

export const linkKey = (link: { to: string; kind: string }): string => `${link.kind}|${link.to}`;

/**
 * Read every revision, oldest first. A revision that does not read cleanly is passed over:
 * the city stays as its last readable revision described it, and `problem` says so.
 * `today` is the day of the sync; no claim is dated after it.
 */
export function readDeclared(record: GithubDefinition | undefined, today: string): { city: DeclaredCity | null; problem?: string } {
  if (record === undefined || record.revisions.length === 0) return { city: null };

  let definition: CityDefinition | null = null;
  let broken: string[] | null = null;
  const knownAt = new Map<string, string>();
  const claims = new Map<string, StageClaim[]>();
  const linkedAt = new Map<string, string>();
  let last = '';

  for (const revision of record.revisions) {
    const parsed = parseDefinition(revision.text);
    if (!parsed.ok) {
      broken = parsed.errors;
      continue;
    }
    broken = null;
    // Dated by its commit: never ahead of the sync, never before a revision it follows.
    let at = revision.date !== null && revision.date.length >= 10 ? isoDay(revision.date) : last !== '' ? last : today;
    if (at > today) at = today;
    if (at < last) at = last;
    last = at;

    definition = parsed.definition;
    for (const feature of definition.features) {
      if (!knownAt.has(feature.id)) knownAt.set(feature.id, at);
      const history = claims.get(feature.id) ?? [];
      if (history.length === 0 || history[history.length - 1]!.stage !== feature.stage) history.push({ at, stage: feature.stage });
      claims.set(feature.id, history);
    }
    for (const link of definition.links ?? []) {
      if (!linkedAt.has(linkKey(link))) linkedAt.set(linkKey(link), at);
    }
  }

  if (definition === null) {
    return { city: null, problem: `${record.path} could not be read, so the city is still guessed at: ${(broken ?? []).join(' ')}` };
  }
  const city: DeclaredCity = { definition, knownAt, claims, linkedAt };
  if (broken !== null) {
    return { city, problem: `The newest ${record.path} could not be read, so the one before it is drawn: ${broken.join(' ')}` };
  }
  return { city };
}

/** The furthest stage a run of commits evidences. */
export function furthest(inferred: InferredStages | null): EvidencedStage | null {
  if (inferred === null) return null;
  return inferred.mature !== undefined ? 'mature' : inferred.working !== undefined ? 'working' : 'building';
}

export interface DatedStage {
  stage: FeatureStage;
  at: string;
  /** `github`: dated by commits. `declared`: dated by the day the file said so. */
  source: 'github' | 'declared';
}

const STARTED = STAGES.indexOf('building');
const BUILT: readonly EvidencedStage[] = ['building', 'working', 'mature'];

/**
 * A declared feature's stages, each with the day it was reached, in order.
 *
 *   - What was only intended (concept, planned, designed) is dated the day the file said it,
 *     for as long as no work had started.
 *   - From `building` on, a stage the commits also evidence keeps the commits' date, so a
 *     city that adopts a definition today keeps the history it already had.
 *   - A stage only the owner vouches for is dated the day the file first said so.
 *
 * How far the list goes is `settleStage`'s decision and nobody else's.
 */
export function declaredStages(claims: readonly StageClaim[], inferred: InferredStages | null, today: string): DatedStage[] {
  const now = claims[claims.length - 1];
  if (now === undefined) return [];
  const settled = settleStage(now.stage, furthest(inferred));
  const reach = STAGES.indexOf(settled);
  const firstWork = inferred?.building;
  const out: DatedStage[] = [];
  let last = '';

  for (const claim of claims) {
    if (STAGES.indexOf(claim.stage) >= STARTED) continue;
    // Once there are commits it is building, whatever the file went on calling it.
    if (firstWork !== undefined && claim.at >= firstWork) continue;
    out.push({ stage: claim.stage, at: claim.at, source: 'declared' });
    last = claim.at;
  }

  for (const stage of BUILT) {
    if (STAGES.indexOf(stage) > reach) break;
    let at = inferred?.[stage];
    let source: DatedStage['source'] = 'github';
    if (stage === settled && stage === now.stage) {
      // The owner's own claim: it counts from the day it was made, if that is before the
      // commits alone would have shown it (or if they never would).
      const said = now.at < last ? last : now.at;
      if (at === undefined || said < at) {
        at = said;
        source = 'declared';
      }
    }
    if (at === undefined) continue;
    if (at > today) at = today;
    out.push({ stage, at, source });
    if (at > last) last = at;
  }
  return out;
}
