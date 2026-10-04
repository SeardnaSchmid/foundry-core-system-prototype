import { normalizeConnections } from './connections.mjs';

/**
 * The Beziehungen tab's graph view: the same list as the table, drawn as the
 * entities in it and how they hang together. Pure — no Foundry globals, no
 * DOM — so the sheet only has to turn the laid-out result into SVG.
 *
 * Entities: the character, every person, every distinct Fraktion and
 * Herkunft label, and anyone named under Kennt without a row of their own.
 * Whether a person is in the Neuralink phone book is a mark
 * on their node (`reachable`), not an entity of its own: Neuralink is the
 * phone, not someone to know.
 */

/** The kinds of node, in the order the legend lists them. */
export const GRAPH_NODE_KINDS = ['self', 'person', 'faction', 'origin'];

/** The kinds the legend can switch off. The character and the people are the graph. */
export const GRAPH_HIDEABLE_KINDS = ['faction', 'origin'];

/**
 * Nodes and edges for one character's connections. A Fraktion or Herkunft
 * label shared by several people is one node they all join, matched ignoring
 * case. A person's Beziehung labels label the edge from the character.
 *
 * @param {{name: string, img?: string}} self  The character.
 * @param {unknown} stored  `system.connections`.
 * @param {object} [options]
 * @param {Iterable<string>} [options.hidden]  Kinds from GRAPH_HIDEABLE_KINDS to leave out, with
 *   their edges.
 * @returns {{nodes: Array<{id: string, kind: string, label: string, img?: string, connectionId?: string, reachable?: boolean, hearsay?: boolean}>,
 *            edges: Array<{from: string, to: string, kind: string, label: string}>}}
 */
export function buildConnectionGraph(self, stored, { hidden = [] } = {}) {
  const off = new Set([...hidden].filter((kind) => GRAPH_HIDEABLE_KINDS.includes(kind)));
  const nodes = [{ id: 'self', kind: 'self', label: self.name ?? '', img: self.img }];
  const edges = [];
  const byId = new Map();
  const shared = (kind, label) => {
    const id = `${kind}:${label.toLocaleLowerCase()}`;
    if (!byId.has(id)) {
      const node = { id, kind, label };
      byId.set(id, node);
      nodes.push(node);
    }
    return id;
  };

  const entries = normalizeConnections(stored);
  // Whom a person knows is matched by name to a row, or to the character;
  // the first row of a name wins.
  const byName = new Map([[String(self.name ?? '').trim().toLocaleLowerCase(), 'self']]);
  for (const entry of entries) {
    const key = entry.name.trim().toLocaleLowerCase();
    if (key && !byName.has(key)) byName.set(key, `person:${entry.id}`);
  }

  for (const entry of entries) {
    const id = `person:${entry.id}`;
    nodes.push({ id, kind: 'person', label: entry.name, connectionId: entry.id, reachable: entry.neuralink });
    edges.push({ from: 'self', to: id, kind: 'relation', label: entry.relations.join(', ') });
    if (!off.has('faction')) for (const faction of entry.factions) edges.push({ from: id, to: shared('faction', faction), kind: 'faction', label: '' });
    if (!off.has('origin')) for (const origin of entry.origins) edges.push({ from: id, to: shared('origin', origin), kind: 'origin', label: '' });
  }

  // Person to person, once per pair whichever side names the other. A name
  // with no row of its own is someone known only by hearsay: a person node
  // all the same, but one the character has not met.
  const pairs = new Set();
  for (const entry of entries) {
    const from = `person:${entry.id}`;
    for (const name of entry.knows) {
      const key = name.toLocaleLowerCase();
      let to = byName.get(key);
      if (!to) {
        to = `hearsay:${key}`;
        byName.set(key, to);
        nodes.push({ id: to, kind: 'person', label: name, hearsay: true });
      }
      const pair = [from, to].sort().join('|');
      // Knowing the character is the row itself, already an edge.
      if (to === from || to === 'self' || pairs.has(pair)) continue;
      pairs.add(pair);
      edges.push({ from, to, kind: 'knows', label: '' });
    }
  }

  return { nodes, edges };
}

/**
 * Place the nodes with a force layout (Fruchterman–Reingold): every pair
 * pushes apart, every edge pulls together, the character stays pinned in the
 * middle. Deterministic — the start is a circle in list order, not random —
 * so the picture does not jump on every redraw. The result is scaled into
 * the box with `padding` to spare.
 *
 * @param {{nodes: object[], edges: object[]}} graph
 * @param {object} [options]
 * @param {number} [options.width=1000]
 * @param {number} [options.height=600]
 * @param {number} [options.padding=60]
 * @param {number} [options.iterations=300]
 * @returns {{nodes: Array<object & {x: number, y: number}>, edges: Array<object & {x1: number, y1: number, x2: number, y2: number}>}}
 */
export function layoutGraph(graph, { width = 1000, height = 600, padding = 60, iterations = 300 } = {}) {
  const count = graph.nodes.length;
  const pos = graph.nodes.map((node, i) => {
    if (node.kind === 'self') return { x: 0, y: 0 };
    // People on an inner ring, the shared entities on an outer one.
    const ring = node.kind === 'person' ? 1 : 2;
    const angle = (2 * Math.PI * i) / Math.max(1, count - 1);
    return { x: ring * Math.cos(angle), y: ring * Math.sin(angle) };
  });
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const links = graph.edges.map((edge) => [index.get(edge.from), index.get(edge.to)]);

  const k = 1 / Math.sqrt(Math.max(1, count));
  let temperature = 0.5;
  for (let step = 0; step < iterations; step++) {
    const shift = pos.map(() => ({ x: 0, y: 0 }));
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const dx = pos[a].x - pos[b].x || 1e-3;
        const dy = pos[a].y - pos[b].y || 1e-3;
        const dist = Math.hypot(dx, dy);
        const push = (k * k) / dist;
        shift[a].x += (dx / dist) * push;
        shift[a].y += (dy / dist) * push;
        shift[b].x -= (dx / dist) * push;
        shift[b].y -= (dy / dist) * push;
      }
    }
    for (const [a, b] of links) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.hypot(dx, dy) || 1e-3;
      const pull = (dist * dist) / k;
      shift[a].x -= (dx / dist) * pull;
      shift[a].y -= (dy / dist) * pull;
      shift[b].x += (dx / dist) * pull;
      shift[b].y += (dy / dist) * pull;
    }
    for (let i = 0; i < count; i++) {
      if (graph.nodes[i].kind === 'self') continue;
      const len = Math.hypot(shift[i].x, shift[i].y) || 1;
      const move = Math.min(len, temperature);
      pos[i].x += (shift[i].x / len) * move;
      pos[i].y += (shift[i].y / len) * move;
    }
    temperature *= 0.985;
  }

  // Fit into the box, keeping the aspect ratio and the character centred.
  const reach = {
    x: Math.max(1e-3, ...pos.map((p) => Math.abs(p.x))),
    y: Math.max(1e-3, ...pos.map((p) => Math.abs(p.y))),
  };
  const scale = Math.min((width / 2 - padding) / reach.x, (height / 2 - padding) / reach.y);
  const placed = graph.nodes.map((node, i) => ({
    ...node,
    x: Math.round(width / 2 + pos[i].x * scale),
    y: Math.round(height / 2 + pos[i].y * scale),
  }));
  const at = new Map(placed.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => ({
    ...edge,
    x1: at.get(edge.from).x,
    y1: at.get(edge.from).y,
    x2: at.get(edge.to).x,
    y2: at.get(edge.to).y,
  }));
  return { nodes: placed, edges };
}

/**
 * The spring embedder's forces a reader may tune, with the range each slider
 * offers and its default. Damping is not among them: it only decides how
 * long the graph swings, not what it looks like at rest.
 */
export const SPRING_PARAMS = {
  stiffness: { min: 0.005, max: 0.15, step: 0.005, default: 0.035 },
  springLength: { min: 40, max: 300, step: 5, default: 130 },
  repulsion: { min: 1000, max: 40000, step: 500, default: 12000 },
  gravity: { min: 0, max: 0.03, step: 0.001, default: 0.004 },
};

/** The default of every SPRING_PARAMS force. */
export const SPRING_DEFAULTS = Object.fromEntries(Object.entries(SPRING_PARAMS).map(([key, range]) => [key, range.default]));

/**
 * Read stored forces: every key of SPRING_PARAMS, a number in its range;
 * anything missing or not a number takes the default.
 * @param {unknown} value
 * @returns {{stiffness: number, springLength: number, repulsion: number, gravity: number}}
 */
export function normalizeSpringParams(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(SPRING_PARAMS).map(([key, range]) => {
    const number = Number(source[key]);
    return [key, Number.isFinite(number) && source[key] !== null && source[key] !== '' ? Math.min(range.max, Math.max(range.min, number)) : range.default];
  }));
}

/** Fastest a node moves in one step, in pixels. */
const MAX_SPEED = 25;

/**
 * A live spring embedder (Eades) over laid-out nodes: every edge is a spring
 * with a rest length, every pair of nodes repels like charges, a weak gravity
 * pulls toward the middle, and damping bleeds the motion off until the graph
 * comes to rest. `layoutGraph` gives the start; this is what moves, and what
 * answers a dragged node — fixed nodes take part in the forces but are not
 * moved by them.
 *
 * Positions are in the same box as the layout and stay inside it.
 *
 * @param {Array<{id: string, kind: string, x: number, y: number}>} nodes
 * @param {Array<{from: string, to: string, kind: string}>} edges
 * @param {object} [options]
 * @param {number} [options.width=1000]
 * @param {number} [options.height=600]
 * @param {number} [options.padding=40]
 * @param {number} [options.springLength=130]  Rest length of a character–person spring; the
 *   shorter springs to Fraktion and Herkunft are a share of it.
 * @param {number} [options.stiffness=0.035]    Spring constant.
 * @param {number} [options.repulsion=12000]    Charge between every pair.
 * @param {number} [options.gravity=0.004]      Pull toward the middle.
 * @param {number} [options.damping=0.82]       Velocity kept per step.
 * @returns {{nodes: Array<{id: string, x: number, y: number, vx: number, vy: number, fixed: boolean}>,
 *            params: object, node: (id: string) => object|undefined, step: () => number}}
 *   `params` holds the forces and may be changed between steps.
 *   `step()` advances one tick and returns the kinetic energy left, which
 *   the caller compares against a threshold to know when to stop.
 */
export function createSpringEmbedder(nodes, edges, {
  width = 1000,
  height = 600,
  padding = 40,
  springLength = SPRING_DEFAULTS.springLength,
  stiffness = SPRING_DEFAULTS.stiffness,
  repulsion = SPRING_DEFAULTS.repulsion,
  gravity = SPRING_DEFAULTS.gravity,
  damping = 0.82,
} = {}) {
  // Read on every step, so a slider can change them while the graph runs.
  const params = { springLength, stiffness, repulsion, gravity, damping };
  const state = nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    vx: 0,
    vy: 0,
    // The character is the graph's anchor and never drifts.
    fixed: node.kind === 'self',
  }));
  const byId = new Map(state.map((node) => [node.id, node]));
  const index = new Map(state.map((node, i) => [node.id, i]));
  const springs = edges
    .map((edge) => ({
      i: index.get(edge.from),
      j: index.get(edge.to),
      // People keep a person's distance from each other; a Fraktion or
      // Herkunft hangs closer to its people.
      share: edge.kind === 'relation' || edge.kind === 'knows' ? 1 : 0.6,
    }))
    .filter((spring) => spring.i !== undefined && spring.j !== undefined);
  const cx = width / 2;
  const cy = height / 2;

  function step() {
    const { springLength, stiffness, repulsion, gravity, damping } = params;
    const fx = new Float64Array(state.length);
    const fy = new Float64Array(state.length);

    // Coulomb repulsion between every pair.
    for (let i = 0; i < state.length; i++) {
      for (let j = i + 1; j < state.length; j++) {
        let dx = state[i].x - state[j].x;
        let dy = state[i].y - state[j].y;
        // Two nodes on the same spot get a nudge apart rather than a NaN.
        if (!dx && !dy) { dx = (i - j) * 0.1; dy = 0.1; }
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const d = Math.sqrt(d2);
        const f = repulsion / d2;
        fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
      }
    }

    // Hooke springs along the edges.
    for (const { i, j, share } of springs) {
      const rest = springLength * share;
      const dx = state[j].x - state[i].x;
      const dy = state[j].y - state[i].y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = stiffness * (d - rest);
      fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
      fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
    }

    // Integrate: gravity, damping, and the walls of the box.
    let energy = 0;
    for (let i = 0; i < state.length; i++) {
      const node = state[i];
      if (node.fixed) { node.vx = 0; node.vy = 0; continue; }
      fx[i] += (cx - node.x) * gravity;
      fy[i] += (cy - node.y) * gravity;
      node.vx = (node.vx + fx[i]) * damping;
      node.vy = (node.vy + fy[i]) * damping;
      // A speed limit keeps the step stable when repulsion at close range is
      // huge; without it crowded graphs swing up instead of settling.
      const speed = Math.hypot(node.vx, node.vy);
      if (speed > MAX_SPEED) {
        node.vx *= MAX_SPEED / speed;
        node.vy *= MAX_SPEED / speed;
      }
      // A node against a wall stops there; keeping its speed into the wall
      // would count as motion forever and the graph would never rest.
      const x = Math.min(width - padding, Math.max(padding, node.x + node.vx));
      const y = Math.min(height - padding, Math.max(padding, node.y + node.vy));
      if (x !== node.x + node.vx) node.vx = 0;
      if (y !== node.y + node.vy) node.vy = 0;
      node.x = x;
      node.y = y;
      energy += node.vx * node.vx + node.vy * node.vy;
    }
    return energy;
  }

  return { nodes: state, params, node: (id) => byId.get(id), step };
}
