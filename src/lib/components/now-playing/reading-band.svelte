<script lang="ts" module>
  const BAND =
    "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--artwork-accent) 8%, transparent), transparent)";
</script>

<!--
  A soft band of the artwork's colour at the anchor line (40% from the top), behind a scrolling
  column. It never moves: lyrics and tracks pass through it, so the present is always in the
  same place. Place it inside a `relative` parent that is the column's height.
-->
<div
  aria-hidden="true"
  data-slot="reading-band"
  class="pointer-events-none absolute inset-x-0 top-[40%] h-28 -translate-y-1/2 forced-colors:hidden"
  style:background={BAND}
></div>
