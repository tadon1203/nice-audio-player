<script lang="ts" generics="Item">
  import type { Snippet } from "svelte";
  import { type ArtworkRef } from "#lib/native/bindings";
  import RovingGlow from "#lib/ui/artwork-glow/roving-glow.svelte";
  import {
    MediaGridController,
    TILE_HEIGHT_REM,
    TILE_WIDTH_REM,
  } from "./media-grid-controller.svelte";

  let {
    items,
    itemKey,
    artworkAt,
    sortSignature,
    ontopindexchange,
    tile,
  }: {
    items: readonly Item[];
    itemKey: (item: Item) => string;
    /**
     * The artwork of the item at `index`. With it, hovering or focusing a tile lets a faint
     * Artwork glow from that artwork fall behind the grid.
     */
    artworkAt?: (index: number) => ArtworkRef | null | undefined;
    /** Changes when the sort does: tiles then slide (or fade) to their new places. */
    sortSignature: string;
    /** Told the index of the first tile in view, for the letter index label. */
    ontopindexchange?: (index: number) => void;
    tile: Snippet<[Item, number]>;
  } = $props();

  const grid = new MediaGridController<Item>(() => ({
    items,
    itemKey,
    artworkAt,
    sortSignature,
    ontopindexchange,
  }));
  const fadeIn = grid.fadeIn;
</script>

<!--
  Mounts only the rows near the view, so a library of any size keeps the same number of tiles in
  the DOM. Rows are padding and mounted tiles; the browser must not "anchor" the scroll position
  to a tile that is about to be replaced.
-->
<!-- The wrapper only watches the pointer and focus leaving, for the Artwork glow; it is not interactive. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  {@attach grid.attach}
  class="relative [overflow-anchor:none] [overflow-clip-margin:0.5rem] overflow-clip"
  onpointerleave={grid.onPointerLeave}
  onfocusout={grid.onFocusOut}
>
  {#if grid.glowTarget !== null}
    <RovingGlow target={grid.glowTarget} />
  {/if}
  <!-- Keys bubble up from the tiles, which hold the focus; the list itself is not interactive. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ul
    {@attach grid.attachList}
    onkeydown={grid.onKeydown}
    class="relative grid justify-start gap-x-5 gap-y-8"
    style:grid-template-columns="repeat({grid.columns}, {TILE_WIDTH_REM}rem)"
    style:grid-auto-rows="{TILE_HEIGHT_REM}rem"
    style:padding-top="{grid.topSpacer}px"
    style:padding-bottom="{grid.bottomSpacer}px"
    style:box-sizing="content-box"
  >
    {#each grid.tiles as entry (entry.key)}
      <li
        data-index={entry.index}
        data-key={entry.key}
        in:fadeIn
        onpointerenter={(event) => grid.onPointerEnter(entry.index, event.currentTarget)}
        onfocusin={(event) => grid.onFocusIn(entry.index, event.currentTarget)}
      >
        {@render tile(entry.item, entry.index)}
      </li>
    {/each}
  </ul>
</div>
