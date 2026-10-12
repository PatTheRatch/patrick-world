// The static vocabulary the fixture world refers to: the country and the Key of Methods.

import type { Catalogue, MethodDef, RegionDef } from '../types';

const regions: RegionDef[] = [
  {
    id: 'the-court',
    name: 'The Court',
    center: { x: 1500, y: 1250 },
    radius: 620,
    note: 'Sport and fantasy analytics.',
  },
  {
    id: 'mindworks',
    name: 'Mindworks',
    center: { x: 3050, y: 1150 },
    radius: 640,
    note: 'Agents, tooling and machine intelligence.',
  },
  {
    id: 'ledger-reach',
    name: 'Ledger Reach',
    center: { x: 1900, y: 2300 },
    radius: 520,
    note: 'Money and markets.',
  },
  {
    id: 'the-commons',
    name: 'The Commons',
    center: { x: 3350, y: 2250 },
    radius: 520,
    note: 'Everyday life and play.',
  },
];

function m(id: string, name: string, family: string, requires: string[] = []): MethodDef {
  return { id, name, family, requires };
}

const methods: MethodDef[] = [
  m('typescript', 'TypeScript', 'language'),
  m('python', 'Python', 'language'),
  m('rust', 'Rust', 'language'),

  m('sql', 'SQL', 'data'),
  m('postgresql', 'PostgreSQL', 'data', ['sql']),
  m('data-engineering', 'Data engineering', 'data', ['python', 'sql']),
  m('web-scraping', 'Web scraping', 'data', ['python']),

  m('statistics', 'Statistics', 'analysis', ['python']),
  m('investment-analytics', 'Investment analytics', 'analysis', ['statistics', 'data-engineering']),
  m('computer-vision', 'Computer vision', 'analysis', ['python', 'statistics']),

  m('product-design', 'Product design', 'interface'),
  m('react', 'React', 'interface', ['typescript']),
  m('canvas-graphics', 'Canvas graphics', 'interface', ['typescript']),
  m('mobile-development', 'Mobile development', 'interface', ['react']),

  m('auth-identity', 'Auth & identity', 'platform', ['typescript']),

  m('prompt-design', 'Prompt design', 'intelligence'),
  m('ai-agents', 'AI agents', 'intelligence', ['prompt-design', 'python']),
  m('mcp', 'MCP', 'intelligence', ['ai-agents', 'typescript']),
  m('llm-evaluation', 'LLM evaluation', 'intelligence', ['prompt-design', 'statistics']),
  m('fine-tuning', 'Fine-tuning', 'intelligence', ['llm-evaluation', 'python']),
];

export const catalogue: Catalogue = {
  methods,
  regions,
  size: { width: 4800, height: 3200 },
};
