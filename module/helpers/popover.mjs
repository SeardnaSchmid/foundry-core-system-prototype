/**
 * The body-level native popovers the actor sheet anchors to its own elements.
 *
 * ApplicationV2 replaces the sheet's contents on every render, so a popover
 * inside `this.element` would be destroyed under the user. Each one instead
 * lives on the host document's body, keeps its own stable listeners, and is
 * re-anchored to whatever element now stands where its old anchor did.
 *
 * Reads no Foundry globals, so the placement maths is unit-tested directly.
 */

const GAP = 6;
const EDGE = 8;

/**
 * Where to put a popover so it sits beside its anchor and inside the viewport:
 * below the anchor if it fits, above it otherwise, never off either edge.
 * @param {{left: number, top: number, bottom: number}} anchorRect
 * @param {{width: number, height: number}} popoverRect
 * @param {{width: number, height: number}} viewport
 * @returns {{left: number, top: number}}
 */
export function popoverPosition(anchorRect, popoverRect, viewport) {
  const left = Math.min(
    Math.max(EDGE, anchorRect.left),
    Math.max(EDGE, viewport.width - popoverRect.width - EDGE)
  );
  const below = anchorRect.bottom + GAP;
  const above = anchorRect.top - popoverRect.height - GAP;
  const top = below + popoverRect.height <= viewport.height - EDGE ? below : Math.max(EDGE, above);
  return { left: Math.round(left), top: Math.round(top) };
}

export class SheetPopover {
  /**
   * @param {Document} host            The document the sheet lives in now
   * @param {string} className         Extra class beside `tno item-popover`
   * @param {object} options
   * @param {(element: HTMLElement) => Promise<void>} options.render
   *   Redraws the popover's contents and label.
   * @param {() => Element|null} options.findAnchor
   *   The anchor to fall back to once a re-render has replaced the old one.
   */
  constructor(host, className, { render, findAnchor }) {
    this.render = render;
    this.findAnchor = findAnchor;
    this.anchor = null;
    this.element = host.createElement('div');
    this.element.className = `tno item-popover ${className}`.trim();
    this.element.setAttribute('popover', 'auto');
    host.body.append(this.element);
    this.element.addEventListener('keydown', (event) => {
      // Native light-dismiss still handles Escape; only stop Foundry's
      // document keybind from closing the actor sheet at the same time.
      if (event.key === 'Escape' && this.isOpen) event.stopPropagation();
    });
    this.element.addEventListener('toggle', (event) => {
      if (event.newState === 'closed') this.anchor = null;
    });
  }

  get isOpen() {
    return !!this.element?.matches(':popover-open');
  }

  /** Redraw beside `anchor`, show, and place. */
  async open(anchor) {
    this.anchor = anchor;
    await this.refresh();
    if (!this.isOpen) this.element.showPopover();
    this.position();
  }

  hide() {
    if (this.isOpen) this.element.hidePopover();
  }

  /**
   * Redraw the contents. Replacing the markup destroys the focus inside it, so
   * an element marked `data-focus-key` gets the keyboard back afterwards — a
   * stepper that moved focus to nowhere on every press would be unusable
   * without a mouse.
   */
  async refresh() {
    const focusKey = this.element.ownerDocument.activeElement?.closest?.('[data-focus-key]')
      ?.dataset.focusKey ?? null;
    await this.render(this.element);
    if (focusKey) this.element.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  /** Keep the popover beside its anchor across re-renders and window moves. */
  position() {
    if (!this.isOpen) return;
    if (!this.anchor?.isConnected) this.anchor = this.findAnchor();
    if (!this.anchor) return;
    // The popover's own window, not the one this code runs in: a detached
    // sheet is measured against the parent workspace otherwise, and lands
    // off-screen.
    const view = this.element.ownerDocument.defaultView ?? window;
    const { left, top } = popoverPosition(
      this.anchor.getBoundingClientRect(),
      this.element.getBoundingClientRect(),
      { width: view.innerWidth, height: view.innerHeight }
    );
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  /**
   * Move into whichever document the sheet is in now. Detaching and
   * re-attaching happen whenever the player likes, and a popover left in the
   * old window would open on the wrong screen — or, once that window is
   * closed, on none. `append` adopts across documents; the open state does not
   * survive the move, so anything open is closed first.
   * @param {Document} host
   */
  mount(host) {
    if (this.element.ownerDocument === host) return;
    this.hide();
    host.body.append(this.element);
  }

  destroy() {
    this.hide();
    this.element.remove();
  }
}
