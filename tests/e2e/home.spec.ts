import { expect, test } from "@playwright/test";

test("la page d'accueil s'affiche avec le bon titre", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Mercaflow/);
  await expect(
    page.getByRole("heading", { name: "Mercaflow" }),
  ).toBeVisible();
});

test("expose robots.txt et sitemap.xml (SEO)", async ({ request }) => {
  expect((await request.get("/robots.txt")).ok()).toBeTruthy();
  expect((await request.get("/sitemap.xml")).ok()).toBeTruthy();
});
