/**
 * The Beziehungen graph on screen: the running spring embedder that animates
 * the rendered SVG, dragging a node, the hover lighting and the hover card.
 * What the graph contains and where it starts comes from
 * `helpers/connection-graph.mjs`; this file only moves the drawing.
 */

import { createSpringEmbedder } from '../helpers/connection-graph.mjs';

/**
 * The graph's layout box. The drawing itself takes the size of the space it
 * is shown in; positions are kept in this box and scaled.
 */
export const GRAPH_WIDTH = 1000;
export const GRAPH_HEIGHT = 600;

/** Never smaller than this, however little room the window leaves. */
const GRAPH_MIN_HEIGHT = 280;

/** Room kept under the graph: the scroll box's padding and the frame's border. */
const GRAPH_BOTTOM_GAP = 22;

/**
 * The graph is drawn at most this often per second, whatever the screen's
 * refresh rate: smooth enough for settling springs, and a 144 Hz screen does
 * not draw it six times as often as needed.
 */
const GRAPH_FPS = 30;

/**
 * The spring embedder runs this many physics steps per drawn frame — four at
 * 30 fps keeps the pace of the earlier two per 60 Hz frame — and stops once
 * the kinetic energy left falls under the threshold.
 */
const GRAPH_STEPS_PER_FRAME = 4;
const GRAPH_REST_ENERGY = 0.05;

/**
 * The size the graph may take: the SVG's laid-out width, and the height left
 * under its top edge in the sheet's scroll box, less the legend and the box's
 * bottom padding — measured with the sheet scrolled to the top, so it does not
 * depend on where the reader happens to be.
 */
function measureGraph(svg, scroller) {
  const top = svg.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const legend = svg.parentElement.querySelector('.graph-legend')?.offsetHeight ?? 0;
  return {
    width: Math.round(svg.clientWidth),
    height: Math.max(GRAPH_MIN_HEIGHT, Math.round(scroller.clientHeight - top - legend - GRAPH_BOTTOM_GAP)),
  };
}

/**
 * Start the spring embedder on the graph just rendered and animate it until
 * it comes to rest. Each frame runs a few physics steps and writes the
 * positions into the SVG; nothing about the DOM is rebuilt. With reduced
 * motion asked for, the graph settles out of sight and is drawn once.
 *
 * @param {SVGSVGElement} svg
 * @param {HTMLElement} scroller  The sheet's scroll box
 * @param {object} options
 * @param {{nodes: object[], edges: object[]}} options.model  The laid-out graph
 * @param {Map<string, {x: number, y: number}>} options.positions
 *   Where each node was left, in the layout box. Updated as the graph moves.
 * @param {object} options.physics  The spring parameters
 * @param {() => void} options.onResize  Called once the space the graph is shown in changes size
 * @returns {object} The run: `wake()`, `stop()`, and the `held`/`paused` flags the sheet sets
 */
export function startGraph(svg, scroller, { model, positions, physics, onResize }) {
  // The drawing takes the space it is shown in, 1:1 in pixels: the whole
  // width, and the height down to the bottom of the window as it sits with
  // the sheet scrolled to the top. Positions are kept in the layout's own box
  // and scaled into this one, so a resize stretches the picture rather than
  // throwing it away.
  const { width, height } = measureGraph(svg, scroller);
  svg.style.height = `${height}px`;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const sx = width / GRAPH_WIDTH;
  const sy = height / GRAPH_HEIGHT;

  const sim = createSpringEmbedder(
    model.nodes.map((node) => {
      const at = positions.get(node.id) ?? node;
      return { ...node, x: at.x * sx, y: at.y * sy };
    }),
    model.edges,
    { width, height, ...physics },
  );
  const nodeEls = new Map([...svg.querySelectorAll('.graph-node')].map((el) => [el.dataset.nodeId, el]));
  const edgeEls = [...svg.querySelectorAll('.graph-edge')].map((el) => ({
    a: sim.node(el.dataset.from),
    b: sim.node(el.dataset.to),
    line: el.querySelector('line'),
    label: el.querySelector('text'),
  }));
  const draw = () => {
    for (const node of sim.nodes) {
      nodeEls.get(node.id)?.setAttribute('transform', `translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})`);
      positions.set(node.id, { x: node.x / sx, y: node.y / sy });
    }
    for (const { a, b, line, label } of edgeEls) {
      line.setAttribute('x1', a.x.toFixed(1));
      line.setAttribute('y1', a.y.toFixed(1));
      line.setAttribute('x2', b.x.toFixed(1));
      line.setAttribute('y2', b.y.toFixed(1));
      label?.setAttribute('x', ((a.x + b.x) / 2).toFixed(1));
      label?.setAttribute('y', ((a.y + b.y) / 2).toFixed(1));
    }
  };

  const view = svg.ownerDocument.defaultView;
  // `held`: a node is being dragged and the graph runs on even at rest.
  // `paused`: the pointer rests on a node, and the graph stands still so it
  // can be read — unless that node is being dragged.
  const run = {
    sim,
    frame: null,
    held: false,
    paused: false,
    stopped: false,
    wake: null,
    width,
    height,
    observer: null,
    stop() {
      run.stopped = true;
      if (run.frame) view.cancelAnimationFrame(run.frame);
      run.observer?.disconnect();
    },
  };
  let last = -Infinity;
  const tick = (time) => {
    // Paused on a hovered node, or out of sight on another tab: no frames.
    // Coming back to the tab starts the graph again (see the sheet's tab click).
    if ((run.paused && !run.held) || !svg.clientWidth) {
      run.frame = null;
      return;
    }
    // Between two drawn frames: wait for the next screen frame. A dragged
    // node is drawn every frame, so it stays under the pointer.
    if (!run.held && time - last < 1000 / GRAPH_FPS - 1) {
      run.frame = view.requestAnimationFrame(tick);
      return;
    }
    last = time;
    let energy = 0;
    for (let i = 0; i < GRAPH_STEPS_PER_FRAME; i++) energy = sim.step();
    draw();
    run.frame = energy > GRAPH_REST_ENERGY || run.held ? view.requestAnimationFrame(tick) : null;
  };
  run.wake = () => {
    if (run.frame === null) run.frame = view.requestAnimationFrame(tick);
  };

  if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const settle = () => {
      for (let i = 0; i < 2000 && sim.step() > GRAPH_REST_ENERGY; i++);
      draw();
    };
    settle();
    run.wake = settle;
  } else {
    run.wake();
  }

  // A new size — the window resized, the sheet detached, the splitter or the
  // browser zoom moved — starts the drawing over in the new box, from where
  // the nodes are now. Only a real change does: setting the height above is
  // itself a resize of the SVG.
  run.observer = new ResizeObserver(() => {
    if (run.stopped || run.held) return;
    const next = measureGraph(svg, scroller);
    if (next.width !== run.width || next.height !== run.height) onResize();
  });
  run.observer.observe(svg);
  run.observer.observe(scroller);
  return run;
}

/**
 * Drag one graph node. It is pinned to the pointer for as long as it is held,
 * and the springs pull the rest after it; let go, and it is free again and the
 * whole graph swings into a new rest. The pointer is mapped into the SVG's own
 * coordinates, since the drawing is scaled to the tab. The character stays the
 * fixed anchor and is not dragged.
 * @param {object|null} run  The run `startGraph` returned
 * @param {PointerEvent} event
 * @param {SVGElement} el    The node's element
 */
export function dragGraphNode(run, event, el) {
  const node = run?.sim.node(el.dataset.nodeId);
  if (event.button !== 0 || !node || el.classList.contains('graph-node-self')) return;
  const svg = el.ownerSVGElement;
  const place = (e) => {
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    node.x = Math.min(run.width, Math.max(0, point.x));
    node.y = Math.min(run.height, Math.max(0, point.y));
  };
  el.setPointerCapture(event.pointerId);
  el.classList.add('is-dragging');
  node.fixed = true;
  run.held = true;
  run.wake();

  const move = (e) => {
    place(e);
    run.wake();
  };
  const stop = () => {
    el.classList.remove('is-dragging');
    node.fixed = false;
    run.held = false;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', stop);
    el.removeEventListener('pointercancel', stop);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

/**
 * Light `node` and what it touches in the graph, or clear the lighting.
 * @param {SVGSVGElement|null} svg
 * @param {SVGElement|null} node
 */
export function lightGraphNode(svg, node) {
  if (!svg) return;
  svg.classList.toggle('has-focus', !!node);
  for (const el of svg.querySelectorAll('.is-lit')) el.classList.remove('is-lit');
  if (!node) return;
  const id = node.dataset.nodeId;
  node.classList.add('is-lit');
  for (const edge of svg.querySelectorAll('.graph-edge')) {
    const { from, to } = edge.dataset;
    if (from !== id && to !== id) continue;
    edge.classList.add('is-lit');
    const other = from === id ? to : from;
    svg.querySelector(`.graph-node[data-node-id="${CSS.escape(other)}"]`)?.classList.add('is-lit');
  }
}

/**
 * Show the hover card for the graph node `el` beside it, or hide the card.
 * Filled as text, never as markup: the values are what players typed.
 * @param {HTMLElement|null} card
 * @param {{title: string, kind: string, rows: Array<{label: string, value: string}>}|null} details
 * @param {Element|null} el
 */
export function showGraphCard(card, details, el) {
  if (!card) return;
  if (!details || !el) {
    card.hidden = true;
    return;
  }
  const doc = card.ownerDocument;
  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const list = doc.createElement('dl');
  for (const { label, value } of details.rows) list.append(make('dt', '', label), make('dd', '', value));
  card.replaceChildren(make('strong', 'graph-card-title', details.title), make('span', 'graph-card-kind', details.kind));
  if (details.rows.length) card.append(list);
  card.hidden = false;

  // Right of the node, or left of it where the right has no room; never past
  // the graph's top or bottom.
  const box = card.parentElement.getBoundingClientRect();
  const at = el.getBoundingClientRect();
  const gap = 10;
  const left = at.right - box.left + gap + card.offsetWidth <= box.width
    ? at.right - box.left + gap
    : Math.max(0, at.left - box.left - gap - card.offsetWidth);
  const top = Math.min(Math.max(0, at.top - box.top), Math.max(0, box.height - card.offsetHeight));
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}
