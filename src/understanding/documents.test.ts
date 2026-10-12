import { describe, expect, it } from 'vitest';
import { cutDocument, DOCUMENT_LIMITS, documentCandidates } from './documents';

const readme = (text: string, path = 'README.md'): { path: string; text: string } => ({ path, text });

describe('documentCandidates', () => {
  it('follows the README\'s links to documents inside the repository', () => {
    const { candidates, more } = documentCandidates(
      readme('See [the roadmap](./docs/ROADMAP.md#now) and <a href="docs/setup.md">setup</a>, or the [guide](docs/guide.md "Title").'),
      ['README.md'],
    );
    expect(candidates).toEqual([
      { path: 'docs/ROADMAP.md', via: 'readme' },
      { path: 'docs/setup.md', via: 'readme' },
      { path: 'docs/guide.md', via: 'readme' },
    ]);
    expect(more).toBe(false);
  });

  it('leaves out what is not a document of this repository', () => {
    const text = [
      '[site](https://example.com/PLAN.md) [mail](mailto:a@b.c) [top](#usage) [cdn](//x.y/z.md)',
      '![shot](docs/shot.png) [code](src/main.py) [up](../other/PLAN.md)',
      '[licence](LICENSE.md) [conduct](CODE_OF_CONDUCT.md) [changes](CHANGELOG.md) [self](README.md)',
      '```',
      '[example](docs/example.md)',
      '```',
      '[gone](GONE.md)',
    ].join('\n');
    const root = ['README.md', 'LICENSE.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md'];
    expect(documentCandidates(readme(text), root).candidates).toEqual([]);
  });

  it('finds telling names at the top of the repository without a link, and not names that only resemble them', () => {
    const root = ['README.md', 'TODO', 'PROJECT_STATUS.md', 'roadmap-2026.md', 'planets.md', 'notes.py', 'package.json', 'resume_ai_product.md', 'DESIGN.md'];
    expect(documentCandidates(readme('Nothing linked.'), root).candidates).toEqual([
      { path: 'PROJECT_STATUS.md', via: 'name' },
      { path: 'roadmap-2026.md', via: 'name' },
      { path: 'TODO', via: 'name' },
      // A weaker word counts only as the whole name.
      { path: 'DESIGN.md', via: 'name' },
    ]);
    // With no README at all the names still stand.
    expect(documentCandidates(null, ['STATUS.md']).candidates).toEqual([{ path: 'STATUS.md', via: 'name' }]);
    expect(documentCandidates(undefined, []).candidates).toEqual([]);
  });

  it('reads the most telling first, uses the file\'s own spelling, and says when there were more', () => {
    const text = '[a](docs/a.md) [b](docs/b.md) [plan](plan.md) [status](docs/STATUS.md) [c](docs/c.md)';
    const { candidates, more } = documentCandidates(readme(text), ['README.md', 'PLAN.md', 'HANDOFF.md']);
    expect(candidates).toEqual([
      { path: 'docs/STATUS.md', via: 'readme' },
      { path: 'HANDOFF.md', via: 'name' },
      // Linked as `plan.md`; the file is `PLAN.md`, and it is listed once.
      { path: 'PLAN.md', via: 'readme' },
      { path: 'docs/a.md', via: 'readme' },
    ]);
    expect(candidates).toHaveLength(DOCUMENT_LIMITS.documents);
    expect(more).toBe(true);
  });

  it('resolves links from where the README itself stands', () => {
    expect(documentCandidates(readme('[r](../ROADMAP.md) [n](notes.md) [abs](/docs/spec.md)', 'docs/README.md'), ['ROADMAP.md']).candidates).toEqual([
      { path: 'ROADMAP.md', via: 'readme' },
      { path: 'docs/notes.md', via: 'readme' },
      { path: 'docs/spec.md', via: 'readme' },
    ]);
  });
});

describe('cutDocument', () => {
  it('leaves a document of ordinary length alone', () => {
    const text = '# Status\n\nShort.\n';
    expect(cutDocument(text)).toEqual({ text, truncated: false });
  });

  it('keeps the opening and the end of a long one, on whole lines, and says what was left out', () => {
    const lines = Array.from({ length: 4000 }, (_, i) => `- [x] entry ${i}`);
    const text = `# Status\n\n${lines.join('\n')}\n\n## Next\n\n- [ ] The thing after this\n`;
    const cut = cutDocument(text);
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(DOCUMENT_LIMITS.chars + 60);
    expect(cut.text.startsWith('# Status\n\n- [x] entry 0\n')).toBe(true);
    expect(cut.text.endsWith('## Next\n\n- [ ] The thing after this\n')).toBe(true);
    const note = /\n\n\[… (\d+) characters left out here …\]\n\n/.exec(cut.text);
    expect(note).not.toBeNull();
    expect(Number(note![1])).toBe(text.length - (cut.text.length - note![0].length));
    // No line was cut in half on either side of the note.
    for (const line of cut.text.split('\n')) expect(line === '' || /^(# Status|## Next|- \[.\] .+|\[… \d+ characters left out here …\])$/.test(line), line).toBe(true);
  });
});
