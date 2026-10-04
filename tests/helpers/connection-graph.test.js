import { describe, it, expect } from 'vitest';
import { SPRING_DEFAULTS, buildConnectionGraph, createSpringEmbedder, layoutGraph, normalizeSpringParams } from '../../module/helpers/connection-graph.mjs';

const self = { name: 'Rosa', img: 'rosa.webp' };
const stored = [
  { id: 'a', name: 'Marco', relations: ['Kontakt', 'Freund'], factions: ['Kartell'], origins: ['Triton'], neuralink: true },
  { id: 'b', name: 'Tim', relations: [], factions: ['kartell'], origins: [] },
];

describe('buildConnectionGraph', () => {
  const graph = buildConnectionGraph(self, stored);
  const ids = graph.nodes.map((n) => n.id);

  it('has the character, every person and every distinct entity', () => {
    expect(ids).toEqual(['self', 'person:a', 'faction:kartell', 'origin:triton', 'person:b']);
  });

  it('labels the character-to-person edge with the Beziehungen', () => {
    expect(graph.edges.find((e) => e.to === 'person:a').label).toBe('Kontakt, Freund');
  });

  it('joins people to a shared faction regardless of case', () => {
    const toFaction = graph.edges.filter((e) => e.to === 'faction:kartell').map((e) => e.from);
    expect(toFaction).toEqual(['person:a', 'person:b']);
  });

  it('marks people in the Neuralink phone book instead of adding a node', () => {
    expect(graph.nodes.find((n) => n.id === 'person:a').reachable).toBe(true);
    expect(graph.nodes.find((n) => n.id === 'person:b').reachable).toBe(false);
    expect(graph.edges.some((e) => e.kind === 'neuralink')).toBe(false);
  });
});

describe('hiding kinds', () => {
  it('leaves out switched-off kinds and their edges', () => {
    const graph = buildConnectionGraph(self, stored, { hidden: ['faction'] });
    expect(graph.nodes.some((n) => n.kind === 'faction')).toBe(false);
    expect(graph.edges.some((e) => e.kind === 'faction')).toBe(false);
    expect(graph.nodes.some((n) => n.kind === 'origin')).toBe(true);
  });

  it('never hides the character or the people', () => {
    const graph = buildConnectionGraph(self, stored, { hidden: ['self', 'person', 'origin'] });
    expect(graph.nodes.map((n) => n.id)).toEqual(['self', 'person:a', 'faction:kartell', 'person:b']);
  });
});

describe('layoutGraph', () => {
  const laid = layoutGraph(buildConnectionGraph(self, stored), { width: 1000, height: 600, padding: 50 });

  it('pins the character in the middle', () => {
    expect(laid.nodes[0]).toMatchObject({ x: 500, y: 300 });
  });

  it('keeps every node inside the box', () => {
    for (const node of laid.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(50);
      expect(node.x).toBeLessThanOrEqual(950);
      expect(node.y).toBeGreaterThanOrEqual(50);
      expect(node.y).toBeLessThanOrEqual(550);
    }
  });

  it('gives edges their ends and is deterministic', () => {
    const edge = laid.edges[0];
    const from = laid.nodes.find((n) => n.id === edge.from);
    expect([edge.x1, edge.y1]).toEqual([from.x, from.y]);
    expect(layoutGraph(buildConnectionGraph(self, stored))).toEqual(layoutGraph(buildConnectionGraph(self, stored)));
  });

  it('copes with the character alone', () => {
    expect(layoutGraph(buildConnectionGraph(self, [])).nodes).toHaveLength(1);
  });
});

describe('createSpringEmbedder', () => {
  const box = { width: 1000, height: 600 };
  const settle = (sim, max = 3000) => {
    let energy = Infinity;
    let steps = 0;
    while (energy > 0.05 && steps < max) { energy = sim.step(); steps++; }
    return { energy, steps };
  };

  it('comes to rest', () => {
    const graph = layoutGraph(buildConnectionGraph(self, stored), box);
    const sim = createSpringEmbedder(graph.nodes, graph.edges, box);
    const { energy, steps } = settle(sim);
    expect(energy).toBeLessThanOrEqual(0.05);
    expect(steps).toBeLessThan(3000);
  });

  it('never moves the character or a held node', () => {
    const graph = layoutGraph(buildConnectionGraph(self, stored), box);
    const sim = createSpringEmbedder(graph.nodes, graph.edges, box);
    const held = sim.node('person:a');
    held.fixed = true;
    held.x = 900;
    held.y = 100;
    settle(sim);
    expect(sim.node('self')).toMatchObject({ x: 500, y: 300 });
    expect(held).toMatchObject({ x: 900, y: 100 });
  });

  it('pulls a far node in along its spring', () => {
    const nodes = [
      { id: 'self', kind: 'self', x: 500, y: 300 },
      { id: 'p', kind: 'person', x: 950, y: 300 },
    ];
    const sim = createSpringEmbedder(nodes, [{ from: 'self', to: 'p', kind: 'relation' }], box);
    settle(sim);
    expect(sim.node('p').x).toBeLessThan(800);
    expect(sim.node('p').x).toBeGreaterThan(500);
  });

  it('keeps nodes inside the box', () => {
    const graph = layoutGraph(buildConnectionGraph(self, stored), box);
    const sim = createSpringEmbedder(graph.nodes, graph.edges, { ...box, padding: 40 });
    for (let i = 0; i < 50; i++) sim.step();
    for (const node of sim.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(40);
      expect(node.x).toBeLessThanOrEqual(960);
    }
  });
});

describe('buildConnectionGraph · knows', () => {
  const stored = [
    { id: '1', name: 'C', knows: ['D', 'Rosa', 'b'] },
    { id: '2', name: 'B', knows: ['C'] },
  ];
  const graph = buildConnectionGraph({ name: 'Rosa' }, stored);
  const knows = graph.edges.filter((edge) => edge.kind === 'knows');

  it('joins people by name once per pair, never the character again', () => {
    expect(knows.map((edge) => [edge.from, edge.to])).toEqual([
      ['person:1', 'hearsay:d'],
      ['person:1', 'person:2'],
    ]);
  });

  it('gives a name without a row a hearsay person node', () => {
    expect(graph.nodes.find((node) => node.id === 'hearsay:d')).toEqual({ id: 'hearsay:d', kind: 'person', label: 'D', hearsay: true });
  });
});

describe('normalizeSpringParams', () => {
  it('fills defaults and clamps to the slider range', () => {
    expect(normalizeSpringParams(null)).toEqual(SPRING_DEFAULTS);
    expect(normalizeSpringParams({ stiffness: 9, springLength: '80', gravity: 'x' })).toEqual({
      ...SPRING_DEFAULTS, stiffness: 0.15, springLength: 80,
    });
  });
});

describe('createSpringEmbedder · params', () => {
  it('takes changed forces on the next step', () => {
    const nodes = [{ id: 'self', kind: 'self', x: 500, y: 300 }, { id: 'p', kind: 'person', x: 700, y: 300 }];
    const sim = createSpringEmbedder(nodes, [{ from: 'self', to: 'p', kind: 'relation' }], { repulsion: 0, gravity: 0 });
    sim.params.springLength = 100;
    for (let i = 0; i < 400; i++) sim.step();
    expect(sim.node('p').x).toBeCloseTo(600, 0);
  });
});

describe('createSpringEmbedder · settling', () => {
  it('comes to rest even when crowded against the walls', () => {
    const stored = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, name: `P${i}`, factions: [`F${i % 10}`], origins: [`O${i % 6}`], knows: [`P${(i * 7) % 60}`],
    }));
    const laid = layoutGraph(buildConnectionGraph({ name: 'X' }, stored));
    const sim = createSpringEmbedder(laid.nodes, laid.edges, { width: 900, height: 500 });
    let steps = 0;
    while (sim.step() > 0.05 && steps < 5000) steps++;
    expect(steps).toBeLessThan(5000);
  });
});

