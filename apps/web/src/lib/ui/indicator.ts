/**
 * Places a shared selection surface (`.indicator-host::before`) under the child
 * matching `selector`. The first placement is immediate; later ones slide.
 */
export function indicator(node: HTMLElement, selector: string) {
  let current = selector,
    frame = 0;
  function place() {
    const target = node.querySelector<HTMLElement>(current);
    if (!target || !target.offsetWidth) {
      cancelAnimationFrame(frame);
      node.removeAttribute("data-indicator");
      return;
    }
    node.style.setProperty("--indicator-x", `${target.offsetLeft}px`);
    node.style.setProperty("--indicator-y", `${target.offsetTop}px`);
    node.style.setProperty("--indicator-w", `${target.offsetWidth}px`);
    node.style.setProperty("--indicator-h", `${target.offsetHeight}px`);
    if (node.hasAttribute("data-indicator")) return;
    node.setAttribute("data-indicator", "placed");
    frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (node.hasAttribute("data-indicator"))
          node.setAttribute("data-indicator", "live");
      }),
    );
  }
  const mutations = new MutationObserver(place);
  mutations.observe(node, {
    subtree: true,
    childList: true,
    attributeFilter: ["class", "aria-selected"],
  });
  const resize = new ResizeObserver(place);
  resize.observe(node);
  place();
  return {
    update(next: string) {
      current = next;
      place();
    },
    destroy() {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
    },
  };
}
