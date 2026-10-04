import { ESLint } from "eslint";
import { expect, test } from "vitest";

const lint = new ESLint();
test("standard diagnostics reject native controls and private presentation imports", async () => {
  const [result] = await lint.lintText(
    `<script lang="ts">import { Dialog } from "bits-ui";</script><button>Bypass</button>`,
    { filePath: "src/routes/presentation-probe.svelte" },
  );
  expect(result?.messages.map((message) => message.ruleId)).toEqual(
    expect.arrayContaining(["no-restricted-imports", "svelte/no-restricted-html-elements"]),
  );
});

test("standard diagnostics accept owned controls and ordinary layout", async () => {
  const [result] = await lint.lintText(
    `<script lang="ts">import { Button } from "$lib/ui/shadcn/button";</script><div style:height="100px"><Button aria-label="Open" density="compact">Open</Button></div>`,
    { filePath: "src/routes/presentation-probe.svelte" },
  );
  expect(result?.errorCount).toBe(0);
});
