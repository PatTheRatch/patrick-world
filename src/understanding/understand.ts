// Layer two: project understanding.
//
// `HeuristicUnderstander` is the fallback and the tested path: pure, deterministic, no
// network. It says only what the evidence supports, marks every guess `low`, and leaves out
// what it cannot support. It never offers a next step or an open question, because it has
// no way to know one; those lists come back empty.
//
// A model-written understanding goes through the same `Understander` interface and the
// same shape. It is prepared by scripts/understand.mjs, which never calls a model from the
// app. Either way the result is advisory: see types.ts.

import { humanise } from '../world/sources/github/transform';
import { formatDay } from '../world/time';
import { clip, type ProjectEvidence } from './evidence';
import type { Claim, Confidence, ProjectUnderstanding, Understander } from './types';

export const HEURISTIC_LIMITS = {
  /** Sentences of README kept for "what this is". */
  sentences: 3,
  whatThisIsChars: 420,
  capabilities: 8,
  unfinishedIssues: 5,
  unfinishedTodos: 5,
  /** Unticked lines taken from the repository's own status, roadmap and plan documents, in all. */
  unfinishedListed: 5,
  /** And from any one of them, so that one long plan does not crowd out the rest. */
  unfinishedListedPerDocument: 3,
  /** Directories named in the summary of recent work. */
  recentGroups: 3,
} as const;

const claim = (value: string, confidence: Confidence, sources: string[]): Claim<string> => ({ value, confidence, sources });

/** One line, no exclamation marks, quotes made single so the text can sit inside double quotes. */
const quoted = (text: string): string => `"${text.replace(/\s+/g, ' ').replace(/!+/g, '').replace(/"/g, "'").trim()}"`;

function firstSentences(text: string, count: number): string {
  const parts = text.match(/[^.?]+[.?]+(\s|$)/g);
  if (parts === null) return text.trim();
  return parts.slice(0, count).join('').trim();
}

const wordsOf = (s: string): string[] =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

/** Does the README seem to be about this repository, or is it a template nobody rewrote? */
function readmeIsAboutIt(evidence: ProjectEvidence, paragraph: string): boolean {
  const read = `${paragraph} ${evidence.readme.status === 'present' ? evidence.readme.headings.join(' ') : ''}`;
  const text = new Set(wordsOf(read));
  if (wordsOf(evidence.name).some((w) => text.has(w))) return true;
  // `launch-pad` and "Launchpad" are the same name.
  const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return squash(evidence.name).length > 2 && squash(read).includes(squash(evidence.name));
}

export class HeuristicUnderstander implements Understander {
  readonly id = 'heuristic';

  /**
   * `generatedAt` is supplied, never read from a clock, so that the same evidence always
   * gives the same understanding. It defaults to the time of the sync the evidence came from.
   */
  constructor(private readonly generatedAt?: string) {}

  understand(evidence: ProjectEvidence, place: string): Promise<ProjectUnderstanding> {
    return Promise.resolve(understandHeuristically(evidence, place, this.generatedAt));
  }
}

/** The same reading, synchronously. */
export function understandHeuristically(evidence: ProjectEvidence, place: string, generatedAt?: string): ProjectUnderstanding {
  const L = HEURISTIC_LIMITS;
  const name = humanise(evidence.name);
  const readme = evidence.readme;
  const paragraph = readme.status === 'present' ? readme.firstParagraph : undefined;

  // What this is: the README's own first paragraph, else the description, else a guess from the files.
  let whatThisIs: Claim<string>;
  if (paragraph !== undefined && readme.status === 'present') {
    const text = clip(firstSentences(paragraph, L.sentences), L.whatThisIsChars);
    const about = readmeIsAboutIt(evidence, paragraph);
    const sources = [readme.source];
    if (evidence.description !== undefined) sources.push(evidence.description.source);
    whatThisIs = claim(
      about ? text : `${name}'s README opens: ${quoted(text)} That text does not name the project, so it may be a template.`,
      about ? 'medium' : 'low',
      sources,
    );
  } else if (evidence.description !== undefined) {
    whatThisIs = claim(`${name} is described in its repository as: ${quoted(evidence.description.value)}.`, 'medium', [evidence.description.source]);
  } else {
    const dirs = evidence.structure.featureDirectories.length > 0 ? evidence.structure.featureDirectories : evidence.structure.topLevelDirectories;
    const language = evidence.structure.languages[0]?.name;
    const why = readme.status === 'none' ? 'It has no README and no description' : 'Its README says nothing usable and it has no description';
    const guess =
      dirs.length > 0
        ? `inferred only from its ${language === undefined ? '' : `${language} `}files and directories (${dirs.slice(0, 6).join(', ')})`
        : 'and its files say little more';
    whatThisIs = claim(`${name}: ${why}; what it is has been ${guess.startsWith('and') ? `left unsaid, ${guess}` : guess}.`, 'low', [evidence.structure.source]);
  }

  // Capabilities: a directory is the nearest thing to a capability the record can see. Always a guess.
  const capabilities = evidence.structure.featureDirectories.slice(0, L.capabilities).map((path) => {
    const base = path.split('/').pop() ?? path;
    return claim(`${humanise(base)} (the ${path}/ directory)`, 'low', [`${path}/`]);
  });

  const unfinished: Claim<string>[] = [];
  if (evidence.issues.status === 'present') {
    for (const issue of evidence.issues.items.slice(0, L.unfinishedIssues)) {
      const updated = issue.updatedAt === undefined ? '' : `, last updated ${formatDay(issue.updatedAt)}`;
      unfinished.push(claim(`Issue #${issue.number} ${quoted(issue.title)} is open${updated}`, 'high', [issue.source]));
    }
  }
  if (evidence.todos.status === 'present') {
    for (const todo of evidence.todos.items.slice(0, L.unfinishedTodos)) {
      unfinished.push(claim(`${todo.path} carries a ${todo.marker}: ${quoted(todo.text)}`, 'high', [todo.source]));
    }
  }

  // What the repository's own documents list as not done. The document says so outright; how
  // current the document is, the record cannot say, so this is `medium` and never `high`.
  if (evidence.documents.status === 'present') {
    let taken = 0;
    for (const doc of evidence.documents.items) {
      for (const item of doc.openItems.slice(0, L.unfinishedListedPerDocument)) {
        if (taken >= L.unfinishedListed) break;
        const where = item.under === undefined ? '' : `, under ${quoted(item.under)}`;
        unfinished.push(claim(`${doc.path} lists as not done${where}: ${quoted(item.text)}`, 'medium', [doc.source]));
        taken++;
      }
    }
  }

  // Maturity: counted facts only. The heuristic does not judge whether anything works.
  const a = evidence.activity;
  let maturity: Claim<string>;
  if (a.commits === 0 || a.firstCommitAt === undefined || a.lastCommitAt === undefined) {
    maturity = claim('No commits are recorded.', 'high', ['commit history']);
  } else {
    const span =
      a.firstCommitAt === a.lastCommitAt ? `on ${formatDay(a.firstCommitAt)}` : `from ${formatDay(a.firstCommitAt)} to ${formatDay(a.lastCommitAt)}`;
    const releases = a.releases.length === 0 ? 'no releases' : `${a.releases.length} ${a.releases.length === 1 ? 'release' : 'releases'}`;
    maturity = claim(
      `${a.commits} ${a.commits === 1 ? 'commit' : 'commits'} ${span}, ${releases}${a.archived ? ', archived on GitHub' : ''}. Whether it works is not something the commit record shows.`,
      'high',
      ['commit history'],
    );
  }

  // Recent work: where the latest commits were, and what the newest one said.
  let recentWork: Claim<string>;
  const newest = evidence.recentCommits[0];
  if (newest === undefined) recentWork = claim('No recent work is recorded.', 'high', ['commit history']);
  else {
    const oldest = evidence.recentCommits[evidence.recentCommits.length - 1] ?? newest;
    const where = evidence.recentWork
      .filter((g) => g.path !== '.')
      .slice(0, L.recentGroups)
      .map((g) => `${g.path}/`);
    const span = newest.at === undefined ? '' : oldest.at === undefined || oldest.at === newest.at ? ` on ${formatDay(newest.at)}` : ` from ${formatDay(oldest.at)} to ${formatDay(newest.at)}`;
    const n = evidence.recentCommits.length;
    const places = where.length > 0 ? `, mostly in ${where.join(', ')}` : '';
    const said = newest.message === '' ? '' : ` The newest reads ${quoted(newest.message)}.`;
    recentWork = claim(
      `The latest ${n === 1 ? 'commit was' : `${n} commits were`}${span}${places}.${said}`,
      'medium',
      evidence.recentCommits.slice(0, 3).map((c) => c.source),
    );
  }

  const out: ProjectUnderstanding = {
    place,
    whatThisIs,
    capabilities,
    maturity,
    recentWork,
    unfinished,
    // The heuristic cannot know an open question or a next step. It does not guess at them.
    openQuestions: [],
    nextSteps: [],
    provenance: {
      generator: 'heuristic',
      generatedAt: generatedAt ?? evidence.fetchedAt ?? '1970-01-01T00:00:00Z',
      basedOn: {},
      advisory: true,
    },
  };
  if (evidence.fetchedAt !== undefined) out.provenance.basedOn.fetchedAt = evidence.fetchedAt;
  if (evidence.headCommit !== undefined) out.provenance.basedOn.commit = evidence.headCommit;
  if (evidence.structure.languages.length > 0 || evidence.structure.topLevelDirectories.length > 0) {
    out.architecture = claim(evidence.structure.summary, 'medium', [evidence.structure.source]);
  }
  return out;
}
