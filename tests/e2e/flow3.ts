/**
 * Client feedback features, end to end in the browser:
 *   managed categories (add + rename) → book and customer with automatic codes →
 *   customer location / optional city → customer found by phone, discount applied to the invoice →
 *   itemised expense voucher → sales order recorded from an approved invoice.
 *
 *   npx tsx tests/e2e/flow3.ts   (server running; admin credentials in .e2e-secrets.json)
 */
import { chromium } from "playwright-core";
import { savedPassword, shot, signIn } from "./smoke";
import { expectToast, pickSearch, pickSelect, step } from "./helpers";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const CHROME = process.env.E2E_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const run = Date.now().toString(36).slice(-5).toUpperCase();
const digits = String(Date.now()).slice(-7);
const CATEGORY = `Brochure Pack ${run}`;
const BOOK = `Prospectus Booklet ${run}`;
const CUSTOMER = `Hilltop School ${run}`;
const PHONE = `0399-${digits}`;

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await (
    await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  ).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await step("admin signs in", async () => {
      await signIn(page, "admin@turnkey.local", savedPassword("admin@turnkey.local")!);
    });

    await step("adds a book category, then renames it", async () => {
      await page.goto(`${BASE}/inventory/books`);
      await page.getByRole("button", { name: "Manage categories" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByLabel("New Product category").fill(`Brochures ${run}`);
      await dlg.getByRole("button", { name: "Add" }).click();
      await expectToast(page, /added/);
      await dlg.getByRole("button", { name: `Rename Brochures ${run}` }).click();
      await dlg.getByLabel("Category name").fill(CATEGORY);
      await dlg.getByLabel("Category name").press("Enter");
      await expectToast(page, /Renamed/);
      await dlg.getByText(CATEGORY).waitFor();
      await dlg.getByRole("button", { name: "Done" }).click();
    });

    await step("creates a book with a blank code (auto BK-) in the new category", async () => {
      await page.getByRole("button", { name: "New Book / Product" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByLabel("Title *").fill(BOOK);
      await pickSelect(page, "Category *", CATEGORY);
      await dlg.getByLabel("Sale / retail price (Rs)").fill("250");
      await dlg.getByRole("button", { name: "Save" }).click();
      await expectToast(page, /Book \/ Product saved/);
      const row = page.getByRole("row").filter({ hasText: BOOK });
      await row.waitFor();
      const text = await row.innerText();
      if (!/BK-\d{4}/.test(text) || !text.includes(CATEGORY))
        throw new Error(`Expected auto code and category, got: ${text}`);
    });

    await step("creates an out-of-Karachi customer with a discount and auto code", async () => {
      await page.goto(`${BASE}/customers`);
      await page.getByRole("button", { name: "New Customer" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByLabel("Name *").fill(CUSTOMER);
      await pickSelect(page, "Location *", "Outside Karachi");
      await dlg.getByLabel("City / town (optional)").fill("Multan");
      await dlg.getByLabel("Phone").fill(PHONE);
      await dlg.getByLabel("Rule 1 discount").fill("12");
      await dlg.getByRole("button", { name: "Save" }).click();
      await expectToast(page, /Customer saved/);
      const row = page.getByRole("row").filter({ hasText: CUSTOMER });
      await row.waitFor();
      const text = await row.innerText();
      if (!/CUST-\d{4}/.test(text) || !text.includes("Outside Karachi") || !text.includes("Multan"))
        throw new Error(`Customer row wrong: ${text}`);
    });

    await step("invoice: finds the customer by phone and applies the 12% discount", async () => {
      await page.goto(`${BASE}/sales/invoices`);
      await page.getByRole("button", { name: "New Sales Invoice" }).click();
      const dlg = page.getByRole("dialog");
      await pickSearch(page, dlg.getByLabel("Book"), BOOK);
      await pickSearch(page, dlg.getByLabel("Party"), digits);
      await dlg.getByText("All books: 12%").waitFor();
      const disc = await dlg.getByLabel("Discount %").first().inputValue();
      if (disc !== "12") throw new Error(`Line discount should be 12, got ${disc}`);
      await dlg.getByLabel("Quantity").first().fill("10");
      await dlg.getByText("2,200.00").first().waitFor(); // 10 × 250 less 12%
      await shot(page, "flow3-invoice-discount");
      await page.keyboard.press("Escape");
    });

    await step("itemised expense voucher totals its items", async () => {
      await page.goto(`${BASE}/transactions/expenses`);
      await page.getByRole("button", { name: "New Expense" }).click();
      const dlg = page.getByRole("dialog");
      await pickSearch(page, dlg.getByLabel("Expense head"), "");
      await pickSelect(page, "Paid by", "Cash");
      await dlg.getByLabel("Paid to").fill("Courier");
      await dlg.getByRole("button", { name: "Add item" }).click();
      await dlg.getByLabel("Item 1 description").fill("Parcel to Multan");
      await dlg.getByLabel("Item 1 amount").fill("1000");
      await dlg.getByRole("button", { name: "Add item" }).click();
      await dlg.getByLabel("Item 2 description").fill("Packing");
      await dlg.getByLabel("Item 2 amount").fill("250");
      const total = await dlg.getByLabel(/Amount \(Rs\) — sum of items/).inputValue();
      if (Number(total) !== 1250) throw new Error(`Expense total should be 1250, got ${total}`);
      await dlg.getByRole("button", { name: "Save draft" }).click();
      await expectToast(page, /saved as draft/);
      await page.keyboard.press("Escape");
    });

    await step("records a sales order from an approved invoice (once only)", async () => {
      await page.goto(`${BASE}/sales/invoices`);
      const rows = page.getByRole("row").filter({ hasText: "Approved" });
      await rows.first().waitFor();
      const n = await rows.count();
      let done = false;
      for (let i = 0; i < n && !done; i++) {
        await rows.nth(i).click();
        const dlg = page.getByRole("dialog");
        await dlg.getByRole("button", { name: "Print / PDF" }).waitFor({ timeout: 15_000 });
        const btn = dlg.getByRole("button", { name: "Create sales order" });
        if (await btn.isVisible()) {
          await btn.click();
          await expectToast(page, /Sales order SO-\d{4}-\d{4} recorded/);
          await btn.waitFor({ state: "detached", timeout: 10_000 });
          done = true;
        }
        await page.keyboard.press("Escape");
      }
      if (!done) throw new Error("No approved invoice offered 'Create sales order'.");
    });

    if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
    console.log("\nFLOW3 OK. Browser errors: none");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("FLOW3 FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
