export type ScrollAlignment = "start" | "center" | "end" | "nearest";

export function clampScrollTop(container: HTMLElement, top: number) {
  return Math.max(0, Math.min(top, Math.max(0, container.scrollHeight - container.clientHeight)));
}

export function elementScrollTop(
  container: HTMLElement,
  element: HTMLElement,
  alignment: ScrollAlignment,
) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
  const relativeBottom = relativeTop + elementRect.height;
  const viewportTop = container.scrollTop;
  const viewportBottom = viewportTop + container.clientHeight;
  let target = relativeTop;
  if (alignment === "center") {
    target = relativeTop - (container.clientHeight - elementRect.height) / 2;
  } else if (alignment === "end") {
    target = relativeBottom - container.clientHeight;
  } else if (alignment === "nearest") {
    target =
      relativeTop >= viewportTop && relativeBottom <= viewportBottom
        ? viewportTop
        : relativeTop < viewportTop
          ? relativeTop
          : relativeBottom - container.clientHeight;
  }
  return clampScrollTop(container, target);
}
