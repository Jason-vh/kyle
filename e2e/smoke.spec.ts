import { readFile } from "node:fs/promises";
import { expect, test, type BrowserContext } from "@playwright/test";

async function signIn(context: BrowserContext, account: string) {
  const sessions = JSON.parse(await readFile(".e2e/sessions.json", "utf8")) as Record<
    string,
    string
  >;
  await context.addCookies([
    {
      name: "kyle_auth",
      value: sessions[account]!,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

test("anonymous browsers cannot enter protected pages or APIs", async ({ page }) => {
  await page.goto("/library");
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/library")).status()).toBe(401);
  expect((await page.request.post("/chat", { data: { message: "hello" } })).status()).toBe(503);
});

test("a real passkey can register and sign in, and logout revokes the old cookie", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await signIn(context, "member");
  await page.goto("/account");
  await page.getByRole("button", { name: "Add passkey", exact: true }).click();
  await expect(page.getByText("Passkey added.", { exact: true })).toBeVisible();
  const old = (await context.cookies()).find((cookie) => cookie.name === "kyle_auth")!;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await page.request.get("/api/library", { headers: { cookie: `kyle_auth=${old.value}` } })
    ).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/threads");
  await expect(page).toHaveURL(/\/home$/);
  expect((await page.request.get("/api/threads")).status()).toBe(403);
});

test("members can request media, and only whoever asked can remove it", async ({
  page,
  context,
}) => {
  await signIn(context, "requester");
  await page.goto("/discover");
  await page.getByPlaceholder("Search for a movie or series…").fill("Arrival");
  await expect(page.getByRole("link", { name: "Arrival", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Request", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Requested", exact: true })).toBeVisible();
  await page.goto("/requests");
  await expect(page.getByRole("link", { name: "Arrival", exact: true })).toBeVisible();

  await signIn(context, "bystander");
  expect((await page.request.delete("/api/library/movie/7")).status()).toBe(403);
  await page.goto("/media/movie/329865");
  await expect(page.getByRole("heading", { name: "Arrival", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /^Remove/ })).toHaveCount(0);

  await signIn(context, "requester");
  await page.reload();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Remove/ })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Removed by you", { exact: true })).toBeVisible();
});

test("a series asks which seasons to download before it is requested", async ({
  page,
  context,
}) => {
  await signIn(context, "requester");
  await page.goto("/discover");
  await page.getByPlaceholder("Search for a movie or series…").fill("Severance");
  await expect(page.getByRole("link", { name: "Severance", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Request", exact: true }).nth(1).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("checkbox", { name: "Season 1" })).toBeChecked();
  await expect(sheet.getByRole("checkbox", { name: "Specials" })).not.toBeChecked();
  await expect(sheet.getByText("9 episodes · 2022")).toBeVisible();

  await sheet.getByRole("button", { name: "Latest", exact: true }).click();
  await sheet.getByRole("switch", { name: "Follow new seasons" }).click();
  await sheet.getByRole("button", { name: "Request Season 2", exact: true }).click();

  await expect(page.getByRole("button", { name: "Requested", exact: true })).toBeVisible();
  await page.goto("/requests");
  await expect(page.getByText(/Season 2/)).toBeVisible();
});
