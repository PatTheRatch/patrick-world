import { describe, expect, it } from 'vitest';
import { catalogue } from '../fixtures/catalogue';
import { GitHubSource, type FetchLike } from './github';
import type { GithubRaw } from './github/raw';

const land = () => true;

function answering(status: number, type: string, body: string): FetchLike {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null) },
      text: () => Promise.resolve(body),
    });
}

const raw: GithubRaw = {
  version: 1,
  fetchedAt: '2025-03-10T09:00:00Z',
  accounts: ['pat'],
  repos: [
    {
      owner: 'pat',
      name: 'scratch',
      full_name: 'pat/scratch',
      description: null,
      topics: [],
      created_at: '2024-05-05T10:00:00Z',
      pushed_at: '2024-05-05T10:00:00Z',
      archived: false,
      private: true,
      default_branch: 'main',
      language: null,
      languages: {},
      releases: [],
      tags: [],
      commits: [{ sha7: 'abc1234', date: '2024-05-05T10:00:00Z', author: 'pat' }],
      tree: { root: [], inside: {} },
      paths: {},
    },
  ],
};

describe('GitHubSource', () => {
  it('reads the record and reports when it was surveyed', async () => {
    const source = new GitHubSource(catalogue, land, '/data/github.json', answering(200, 'application/json', JSON.stringify(raw)));
    const events = await source.load();
    expect(source.id).toBe('github');
    expect(source.label).toBe('GitHub');
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.source === 'github')).toBe(true);
    expect(source).toMatchObject({ status: 'loaded', fetchedAt: raw.fetchedAt, repoCount: 1, problem: null });
    expect(await source.load()).toEqual(events);
  });

  it('treats a missing record as absent, not as an error', async () => {
    const missing = new GitHubSource(catalogue, land, '/x', answering(404, 'text/plain', 'Not found'));
    expect(await missing.load()).toEqual([]);
    expect(missing.status).toBe('absent');

    // A dev server answers a missing file with the app's own page, and says 200.
    const fallback = new GitHubSource(catalogue, land, '/x', answering(200, 'text/html', '<!doctype html><html></html>'));
    expect(await fallback.load()).toEqual([]);
    expect(fallback).toMatchObject({ status: 'absent', fetchedAt: null, repoCount: 0 });
  });

  it('reports a broken record without throwing', async () => {
    const garbled = new GitHubSource(catalogue, land, '/x', answering(200, 'application/json', '{"fetchedAt": '));
    expect(await garbled.load()).toEqual([]);
    expect(garbled.status).toBe('error');
    expect(garbled.problem).toMatch(/sync:github/);

    const wrongShape = new GitHubSource(catalogue, land, '/x', answering(200, 'application/json', '{"hello":1}'));
    expect(await wrongShape.load()).toEqual([]);
    expect(wrongShape.status).toBe('error');

    const offline = new GitHubSource(catalogue, land, '/x', () => Promise.reject(new Error('offline')));
    expect(await offline.load()).toEqual([]);
    expect(offline).toMatchObject({ status: 'error', problem: 'offline' });

    const serverError = new GitHubSource(catalogue, land, '/x', answering(500, 'text/plain', 'boom'));
    expect(await serverError.load()).toEqual([]);
    expect(serverError.status).toBe('error');
  });
});
