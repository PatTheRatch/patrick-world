// What Patrick's World believes a project IS, as opposed to what happened in it.
//
//   repository evidence → project understanding → continuation suggestions → world presentation
//
// Everything in this file is ADVISORY. An understanding is somebody's reading of the
// evidence: a heuristic's, or a language model's. It carries who wrote it, when, and what it
// was read from, and every statement in it carries its own confidence and sources. Nothing
// here is canonical state, nothing here is ever written back to the event log, and the
// world derives identically whether an understanding exists or not.

import type { ProjectEvidence } from './evidence';

export type Confidence = 'high' | 'medium' | 'low';

/**
 * One statement, with how sure its author is and where a person could go to check it.
 * `sources` are things that can be followed: `README.md`, `commit 3fa9c1e`, `issue #12`,
 * `src/server/`, `repository description`.
 */
export interface Claim<T> {
  value: T;
  confidence: Confidence;
  sources: string[];
}

export interface Provenance {
  /** Who or what wrote this reading: `heuristic`, `fixture (fictional)`, a model's name. */
  generator: string;
  /** ISO timestamp the reading was written. */
  generatedAt: string;
  /** What it was read from: the sync it used and the newest commit it saw. */
  basedOn: { fetchedAt?: string; commit?: string };
  /** Always true. The type will not let an understanding claim to be anything else. */
  advisory: true;
}

export interface ProjectUnderstanding {
  /** Place id, as on the map. */
  place: string;
  /** One to three plain sentences. Not marketing copy. */
  whatThisIs: Claim<string>;
  audience?: Claim<string>;
  problem?: Claim<string>;
  capabilities: Claim<string>[];
  architecture?: Claim<string>;
  maturity: Claim<string>;
  recentWork: Claim<string>;
  /** Each a full sentence saying what is open: `Issue #4 "Offline mode" is open.` */
  unfinished: Claim<string>[];
  openQuestions: Claim<string>[];
  /** Each an action in the imperative, short enough to be a title: `Add the calendar view`. */
  nextSteps: Claim<string>[];
  /** Where he could naturally pick back up. An action, like a next step. */
  pickUp?: Claim<string>;
  provenance: Provenance;
}

/** Anything that can read a project's evidence and say what it thinks the project is. */
export interface Understander {
  readonly id: string;
  understand(evidence: ProjectEvidence, place: string): Promise<ProjectUnderstanding>;
}

const CONFIDENCE: readonly string[] = ['high', 'medium', 'low'];

function isClaim(value: unknown): value is Claim<string> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.value === 'string' &&
    typeof v.confidence === 'string' &&
    CONFIDENCE.includes(v.confidence) &&
    Array.isArray(v.sources) &&
    v.sources.every((s) => typeof s === 'string')
  );
}

const isClaimList = (value: unknown): value is Claim<string>[] => Array.isArray(value) && value.every(isClaim);
const optionalClaim = (value: unknown): boolean => value === undefined || isClaim(value);

/**
 * Enough of a check to keep a malformed or half-written entry off the map. It also refuses
 * anything not marked advisory: a reading that will not say it is a reading is not shown.
 */
export function isProjectUnderstanding(value: unknown): value is ProjectUnderstanding {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const p = v.provenance as Record<string, unknown> | null | undefined;
  return (
    typeof v.place === 'string' &&
    isClaim(v.whatThisIs) &&
    isClaim(v.maturity) &&
    isClaim(v.recentWork) &&
    isClaimList(v.capabilities) &&
    isClaimList(v.unfinished) &&
    isClaimList(v.openQuestions) &&
    isClaimList(v.nextSteps) &&
    optionalClaim(v.audience) &&
    optionalClaim(v.problem) &&
    optionalClaim(v.architecture) &&
    optionalClaim(v.pickUp) &&
    typeof p === 'object' &&
    p !== null &&
    typeof p.generator === 'string' &&
    typeof p.generatedAt === 'string' &&
    p.advisory === true &&
    typeof p.basedOn === 'object' &&
    p.basedOn !== null
  );
}
