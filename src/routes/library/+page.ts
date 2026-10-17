import { redirect } from "@sveltejs/kit";

export function load(): void {
  redirect(307, "/library/albums");
}
