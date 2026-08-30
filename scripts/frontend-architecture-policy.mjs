const legacyVisualClass =
  /^(?:app-shell|playback-dock|playback-queue|range-control|library-view|library-artwork|album-detail|settings-view|lyrics-pane|application-activity)(?:__|--|-|$)|^(?:tooltip|dropdown-menu|select|checkbox|field|dialog)(?:__|--|$)|^(?:button--|icon-button|type-)/;
const closedPrimitiveTag =
  /<(?:Button|Toggle|Checkbox|SelectTrigger|SelectContent|SelectItem|Slider)\b([^>]*)>/g;

function classAttributeValues(source) {
  const values = [];
  const attribute = /\bclassName\s*=\s*(?:["'`]([^"'`]*)["'`]|\{\s*["'`]([^"'`]*)["'`])/g;
  for (const match of source.matchAll(attribute)) values.push(match[1] ?? match[2] ?? "");
  return values;
}

function selectorValues(source) {
  const values = [];
  const selector = /["'`]\.(?<selector>[A-Za-z_][\w-]*)["'`]/g;
  for (const match of source.matchAll(selector)) values.push(match.groups?.selector ?? "");
  return values;
}

export function findLegacyVisualClasses(source) {
  const values = [...classAttributeValues(source), ...selectorValues(source)];
  return values
    .flatMap((value) => value.split(/\s+/))
    .filter((token) => legacyVisualClass.test(token.replace(/^[^A-Za-z0-9_-]+/, "")));
}

export function hasStylingClassTestDependency(source) {
  return /["'`]\.[A-Za-z_][\w-]*["'`]|toHaveClass\s*\(/.test(source);
}

export function hasClosedPrimitiveOverride(source) {
  return [...source.matchAll(closedPrimitiveTag)].some((match) => /\bclassName\s*=/.test(match[1]));
}

export function countInlineStyleObjects(source) {
  return (source.match(/\bstyle\s*=\s*\{\{/g) ?? []).length;
}

export function findPolicyViolations({ path, source }) {
  const violations = [];
  const relativePath = path.replaceAll("\\", "/");
  const classValues = classAttributeValues(source);
  if (classValues.some((value) => /(?:^|\s)![-\w[/.]/.test(value)))
    violations.push("Tailwind important modifiers are not allowed");
  if (!relativePath.endsWith(".css")) {
    const legacy = findLegacyVisualClasses(source);
    if (legacy.length) violations.push(`legacy visual classes remain: ${legacy.join(", ")}`);
  }
  if (/\.test\.|tests\//.test(relativePath) && hasStylingClassTestDependency(source))
    violations.push("tests must locate observable UI semantically, not by CSS class");
  if (/transition-(?:all|\[(?:width|height|padding|margin|gap|transform|grid))/.test(source))
    violations.push("layout transitions are not allowed");
  if (relativePath.endsWith("TracksView.tsx")) {
    if (countInlineStyleObjects(source) !== 2)
      violations.push("TracksView may contain exactly two virtualization inline style objects");
  } else if (/\bstyle\s*=\s*\{/.test(source)) {
    violations.push("static inline geometry is not allowed outside TracksView virtualization");
  }
  if (
    /src\/(?:components|features)\/.*\.(?:tsx|ts)$/.test(relativePath) &&
    !/src\/components\/ui\/(?:button|toggle|checkbox|select|slider)\.tsx$/.test(relativePath) &&
    hasClosedPrimitiveOverride(source)
  )
    violations.push("closed primitives must not receive caller className overrides");
  if (
    /src\/components\/(?:PlaybackDock|VolumeControl)\.tsx$/.test(relativePath) &&
    /(?:-?translate(?:-|\[)|transform|inset-[0-9]|top-[0-9]|bottom-[0-9])/.test(source)
  )
    violations.push("Dock controls must not use geometry correction offsets");
  return violations;
}
