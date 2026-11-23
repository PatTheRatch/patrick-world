import { describe, expect, it } from 'vitest';
import { nodeFs } from '../understanding/testkit';
import { DEFINITION_FILE, DEFINITION_KINDS, DEFINITION_STAGES, parseDefinition, settleStage } from './definition';
import { catalogue } from './fixtures/catalogue';
import { KINDS, STAGES } from './types';

const minimal = { version: 1, id: 'boxout-fantasy', name: 'Boxout Fantasy', what: 'Fantasy basketball, judged honestly.', features: [] };
const feature = { id: 'trade-judge', name: 'Trade judge', kind: 'observatory', stage: 'working' };

const parse = (value: unknown) => parseDefinition(JSON.stringify(value));
function errorsOf(value: unknown): string[] {
  const result = parse(value);
  return result.ok ? [] : result.errors;
}

describe('reading a city definition', () => {
  it('speaks the world\u2019s own kinds and stages', () => {
    expect(DEFINITION_KINDS).toEqual(KINDS);
    expect(DEFINITION_STAGES).toEqual(STAGES);
  });

  it('accepts the least a city can say about itself', () => {
    const result = parse(minimal);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition).toEqual(minimal);
  });

  it('keeps a feature as it was written, with tidied paths', () => {
    const result = parse({
      ...minimal,
      features: [{ ...feature, paths: ['./src/judge/', 'src/judge', 'api/trades.ts'], ward: 'Front office', methods: ['statistics'] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition.features[0]).toEqual({
      ...feature,
      paths: ['src/judge', 'api/trades.ts'],
      ward: 'Front office',
      methods: ['statistics'],
    });
  });

  it('lets a planned feature have no paths at all', () => {
    const result = parse({ ...minimal, features: [{ ...feature, stage: 'planned' }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition.features[0]?.paths).toBeUndefined();
  });

  it('reads links to other cities by their ids', () => {
    const result = parse({ ...minimal, links: [{ to: 'patrick-os', kind: 'feeds', carries: 'league context' }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition.links).toEqual([{ to: 'patrick-os', kind: 'feeds', carries: 'league context' }]);
  });

  it('ignores keys it does not know, so a later version can add them', () => {
    const result = parse({ ...minimal, mood: 'hopeful' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition).toEqual(minimal);
  });

  it('refuses text that is not JSON', () => {
    expect(parseDefinition('{ version: 1').ok).toBe(false);
    expect(parseDefinition('[]').ok).toBe(false);
  });

  it('reports every problem at once', () => {
    const errors = errorsOf({ version: 2, id: 'Boxout Fantasy', what: '', features: [{ id: 'x', kind: 'castle' }] });
    expect(errors).toEqual([
      '"version" must be 1.',
      'The city needs an id in lower-case words joined by hyphens.',
      'The city has no name.',
      '"what" must say what the city is.',
      'Feature "x" has no name.',
      'Feature "x" needs a kind: one of frontage, works, reservoir, observatory, utility.',
      'Feature "x" needs a stage: one of concept, planned, designed, building, working, mature.',
    ]);
  });

  it('refuses two features with one id', () => {
    expect(errorsOf({ ...minimal, features: [feature, feature] })).toEqual(['Two features share the id "trade-judge".']);
  });

  it('refuses a path that leaves the repository', () => {
    for (const path of ['../other-repo/src', '/etc', 'src\\judge', '']) {
      expect(errorsOf({ ...minimal, features: [{ ...feature, paths: [path] }] })).toHaveLength(1);
    }
  });

  it('refuses a link to itself and a link of no known kind', () => {
    expect(errorsOf({ ...minimal, links: [{ to: 'boxout-fantasy', kind: 'feeds' }] })).toEqual(['Link 1 points at this city itself.']);
    expect(errorsOf({ ...minimal, links: [{ to: 'patrick-os', kind: 'owns' }] })).toHaveLength(1);
  });
});

describe('the owner’s word against the evidence', () => {
  it('agrees with both when they agree', () => {
    expect(settleStage('working', 'working')).toBe('working');
    expect(settleStage('building', 'building')).toBe('building');
  });

  it('shows what is only intended when there is no work to weigh it against', () => {
    expect(settleStage('concept', null)).toBe('concept');
    expect(settleStage('planned', null)).toBe('planned');
  });

  it('draws work that has started as building, whatever the file still calls it', () => {
    expect(settleStage('concept', 'building')).toBe('building');
    expect(settleStage('planned', 'working')).toBe('building');
    expect(settleStage('designed', 'mature')).toBe('building');
  });

  it('lets the owner hold back what the commits would call finished', () => {
    expect(settleStage('building', 'working')).toBe('building');
    expect(settleStage('working', 'mature')).toBe('working');
  });

  it('lets the owner call finished what the commits would not', () => {
    expect(settleStage('working', 'building')).toBe('working');
    expect(settleStage('mature', 'working')).toBe('mature');
    expect(settleStage('working', null)).toBe('working');
  });
});

describe('this repository’s own definition', () => {
  it('reads cleanly, names real methods and a real region, and points at paths that exist', async () => {
    const fs = await nodeFs();
    const result = parseDefinition(fs.readFileSync(DEFINITION_FILE, 'utf8'));
    expect(result.ok ? [] : result.errors).toEqual([]);
    if (!result.ok) return;
    const { definition } = result;

    expect(catalogue.regions.map((r) => r.id)).toContain(definition.region);
    const methods = new Set(catalogue.methods.map((m) => m.id));
    for (const f of definition.features) {
      for (const method of f.methods ?? []) expect(methods.has(method), `${f.id}: ${method}`).toBe(true);
      for (const path of f.paths ?? []) expect(fs.existsSync(path), `${f.id}: ${path}`).toBe(true);
    }
  });
});
