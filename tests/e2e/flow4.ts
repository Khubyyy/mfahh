/**
 * Manual-edition features in the browser:
 *   customer with default + fixed category discount rules and an opening balance →
 *   book with opening stock → invoice applies and locks the fixed rule →
 *   dashboard shortcut opens a cash receipt → record delivery on an order →
 *   logo upload → data backup download.
 *
 *   npx tsx tests/e2e/flow4.ts   (server running; admin credentials in .e2e-secrets.json)
 */
import { join } from "node:path";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { savedPassword, shot, signIn } from "./smoke";
import { expectToast, pickSearch, pickSelect, step } from "./helpers";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = process.env.E2E_SHOTS ?? "./e2e-shots";
mkdirSync(OUT, { recursive: true });
const run = Date.now().toString(36).slice(-5).toUpperCase();
const CUSTOMER = `Rules School ${run}`;
const BOOK = `Practical Copy ${run}`;

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await step("admin signs in", async () => {
      await signIn(page, "admin@turnkey.local", savedPassword("admin@turnkey.local")!);
    });

    await step("book with opening stock posts an opening entry", async () => {
      await page.goto(`${BASE}/inventory/books`);
      await page.getByRole("button", { name: "New Book / Product" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByLabel("Title *").fill(BOOK);
      await pickSelect(page, "Category *", "Copies");
      await dlg.getByLabel("Standard cost price (Rs)").fill("40");
      await dlg.getByLabel("Sale / retail price (Rs)").fill("100");
      await dlg.getByLabel("Opening stock (qty)").fill("30");
      await dlg.getByRole("button", { name: "Save" }).click();
      await expectToast(page, /Opening entry OB-\d{4}-\d{4} posted/);
      const row = page.getByRole("row").filter({ hasText: BOOK });
      await row.waitFor();
      if (!(await row.innerText()).includes("30")) throw new Error("Opening stock not shown");
    });

    await step(
      "customer with default 10% + fixed Rs 15/item on Copies, opening balance",
      async () => {
        await page.goto(`${BASE}/customers`);
        await page.getByRole("button", { name: "New Customer" }).click();
        const dlg = page.getByRole("dialog");
        await dlg.getByLabel("Name *").fill(CUSTOMER);
        await dlg.getByLabel("Opening balance receivable (Rs)").fill("5000");
        await dlg.getByLabel("Rule 1 discount").fill("10");
        await dlg.getByRole("button", { name: "Category rule" }).click();
        await dlg.getByLabel("Rule 2 category").selectOption("Copies");
        await dlg.getByLabel("Rule 2 type").selectOption("rs");
        await dlg.getByLabel("Rule 2 discount").fill("15");
        await dlg.getByLabel("Rule 2 mode").selectOption("fixed");
        await dlg.getByRole("button", { name: "Save" }).click();
        await expectToast(page, /Opening entry OB-\d{4}-\d{4} posted/);
        const row = page.getByRole("row").filter({ hasText: CUSTOMER });
        await row.waitFor();
        const t = await row.innerText();
        if (!t.includes("5,000") || !t.includes("Copies: Rs 15/item (fixed)"))
          throw new Error(`Customer row: ${t}`);
      },
    );

    await step("invoice applies the fixed rupee rule and locks it", async () => {
      await page.goto(`${BASE}/sales/invoices`);
      await page.getByRole("button", { name: "New Sales Invoice" }).click();
      const dlg = page.getByRole("dialog");
      await pickSearch(page, dlg.getByLabel("Party"), CUSTOMER);
      await pickSearch(page, dlg.getByLabel("Book"), BOOK);
      const rs = dlg.getByLabel("Discount Rs per item").first();
      if ((await rs.inputValue()) !== "15") throw new Error("Rs 15 rule not applied");
      if (!(await rs.isDisabled())) throw new Error("Fixed rule should lock the discount");
      await dlg.getByLabel("Quantity").first().fill("10");
      await dlg.getByText("850.00").first().waitFor();
      await shot(page, "flow4-fixed-rule");
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(page, /saved as draft/);
      await page.keyboard.press("Escape");
    });

    await step("dashboard 'Cash receipt' opens a receipt with Cash selected", async () => {
      await page.goto(`${BASE}/`);
      await page.getByRole("link", { name: "Cash receipt" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByText("New Customer Receipt").waitFor();
      await dlg.getByLabel("Received into").getByText("Cash in hand").waitFor();
      await page.keyboard.press("Escape");
    });

    await step("record delivery on an approved order", async () => {
      await page.goto(`${BASE}/sales/orders`);
      const rows = page.getByRole("row").filter({ hasText: "Approved" });
      await rows.first().waitFor();
      await rows.first().click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("button", { name: "Record delivery" }).click();
      await page.getByRole("dialog").getByLabel("Note (vehicle, courier, DC no.)").fill("Van 2");
      await page.getByRole("dialog").getByRole("button", { name: "Save delivery" }).click();
      await expectToast(page, /Delivery recorded/);
    });

    await step("upload a company logo", async () => {
      const png = join(OUT, `logo-${run}.png`);
      // 2×2 blue PNG
      writeFileSync(
        png,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYPjPwMDAxMDAwMDAAAAOYgEEyWt6DwAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      await page.goto(`${BASE}/settings/company`);
      await page.getByLabel("Logo file").setInputFiles(png);
      await expectToast(page, /Logo uploaded/);
      await page.getByRole("button", { name: "Use default" }).click();
      await expectToast(page, /Logo removed/);
    });

    await step("download a data backup", async () => {
      await page.goto(`${BASE}/settings/backup-and-restore`);
      const [dl] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download data backup" }).click(),
      ]);
      const file = join(OUT, `backup-${run}.json`);
      await dl.saveAs(file);
      const data = JSON.parse(readFileSync(file, "utf8")) as { tables: Record<string, unknown[]> };
      if (!data.tables["documents"]?.length || !data.tables["customers"]?.length)
        throw new Error("Backup is missing records");
    });

    if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
    console.log("\nFLOW4 OK. Browser errors: none");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FLOW4 FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
