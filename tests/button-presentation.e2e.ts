import { expect, test } from "./fixtures/test";

test("compact settings buttons keep readable type and stable state weight", async ({ page }) => {
  await page.goto("/settings");

  const remove = page.getByRole("button", { name: "Remove C:/Music from library" });
  const deleteMissing = page.getByRole("button", { name: "Delete Missing" });
  await expect(remove).toBeVisible();
  await expect(deleteMissing).toBeDisabled();

  const presentation = async (button: typeof remove) =>
    button.evaluate((element) => ({
      fontSize: getComputedStyle(element).fontSize,
      fontWeight: getComputedStyle(element).fontWeight,
      height: element.getBoundingClientRect().height,
    }));

  const enabled = await presentation(remove);
  const disabled = await presentation(deleteMissing);
  expect(enabled.fontSize).toBe("14px");
  expect(disabled.fontSize).toBe("14px");
  expect(["400", "500"]).toContain(enabled.fontWeight);
  expect(disabled.fontWeight).toBe(enabled.fontWeight);
  expect(enabled.height).toBe(28);

  await remove.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
});

test("the Library sort popup keeps the shared floating surface and readable options", async ({
  page,
}) => {
  await page.goto("/library/albums");
  const trigger = page.getByRole("combobox", { name: "Sort albums" });
  await trigger.click();

  const popup = page.locator('[data-slot="select-content"]');
  const presentation = await popup.evaluate((element) => {
    const style = getComputedStyle(element);
    const option = element.querySelector<HTMLElement>('[role="option"]');
    return {
      backdropFilter: style.backdropFilter,
      shadow: style.boxShadow,
      optionSize: option ? getComputedStyle(option).fontSize : null,
    };
  });

  expect(presentation.backdropFilter).toContain("blur");
  expect(presentation.shadow).not.toBe("none");
  expect(presentation.optionSize).toBe("14px");
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
});
