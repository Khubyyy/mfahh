import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { getAuthState } from "@/server/functions/auth";
import { getLookups } from "@/server/functions/masters";
import {
  getAgeing,
  getExpenseReport,
  getReceiptsReport,
  getSalesReport,
  getStockStatement,
} from "@/server/functions/reports";
import { ContactFooter, LIGHT, LINE, NAVY, PrintSheet } from "@/components/print/PrintShell";
import { ItemsTable, type ItemCol } from "@/components/print/Blocks";
import { PACK_SECTIONS } from "@/components/reports/MonthlyPackLauncher";
import { formatAmount, formatQty } from "@/lib/format";

/** Printable monthly report pack (cover + six reports), each report starting on a new page. */
export const Route = createFileRoute("/print/monthly")({
  ssr: false,
  validateSearch: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage !== "signedIn") throw redirect({ to: "/auth" });
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const from = `${deps.month}-01`;
    const end = new Date(Date.UTC(Number(deps.month.slice(0, 4)), Number(deps.month.slice(5)), 0));
    const to = end.toISOString().slice(0, 10);
    const [lookups, receipts, byProduct, byCustomer, receivables, expenses, expenseHeads, stock] =
      await Promise.all([
        getLookups(),
        getReceiptsReport({ data: { from, to, groupBy: "detail" } }),
        getSalesReport({ data: { from, to, groupBy: "product" } }),
        getSalesReport({ data: { from, to, groupBy: "customer" } }),
        getAgeing({ data: { partyType: "customer", asOf: to } }),
        getExpenseReport({ data: { from, to, groupBy: "detail" } }),
        getExpenseReport({ data: { from, to, groupBy: "head" } }),
        getStockStatement({ data: { from, to } }),
      ]);
    return {
      month: deps.month,
      from,
      to,
      lookups,
      receipts,
      byProduct,
      byCustomer,
      receivables,
      expenses,
      expenseHeads,
      stock,
    };
  },
  head: () => ({ meta: [{ title: "Monthly Reports – MFAHH" }] }),
  component: MonthlyPack,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
const sum = (rows: Row[], k: string) => rows.reduce((x, r) => x + Number(r[k] ?? 0), 0);
/** dd-mm-yyyy, as on the existing monthly registers. */
const dmy = (iso: string) =>
  iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : "";
const amt = (v: number) => formatAmount(v);

function TotalRow({ label, cells }: { label: string; cells: (string | number)[] }) {
  return (
    <div
      className="mt-2 flex items-center justify-between rounded-lg px-4 py-2 text-[12.5px] font-bold"
      style={{ background: LIGHT, border: `1.5px solid ${LINE}`, color: NAVY }}
    >
      <span>{label}</span>
      <span className="flex gap-8 tabular-nums">
        {cells.map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </span>
    </div>
  );
}

function MonthlyPack() {
  const d = Route.useLoaderData();
  const company = d.lookups.company;
  const monthName = new Date(`${d.month}-01T00:00:00Z`).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const period = `${dmy(d.from)} – ${dmy(d.to)}`;
  const generated = new Date().toLocaleString("en-GB");
  useEffect(() => {
    const t = setTimeout(() => window.print(), 900);
    return () => clearTimeout(t);
  }, []);

  const section = (
    n: number,
    rows: Row[],
    cols: ItemCol[],
    cells: (r: Row, i: number) => (string | number)[],
    total?: { label: string; cells: (string | number)[] },
    last = false,
  ) => (
    <PrintSheet
      company={company}
      title={PACK_SECTIONS[n - 1]!}
      sub={`${period} · Generated on ${generated}`}
      breakAfter={!last}
    >
      {rows.length ? (
        <ItemsTable cols={cols} rows={rows.map((r, i) => cells(r, i))} minRows={0} />
      ) : (
        <p className="mt-6 text-center text-gray-500">Nothing recorded for {monthName}.</p>
      )}
      {total && rows.length > 0 && <TotalRow label={total.label} cells={total.cells} />}
    </PrintSheet>
  );

  const stock = d.stock as Row[];
  return (
    <div className="bg-gray-100 print:bg-white">
      <style>{`@page { size: A4; margin: 0; }`}</style>
      <div className="no-print flex justify-center gap-2 p-3">
        <button
          className="rounded-md px-4 py-2 text-sm text-white"
          style={{ background: NAVY }}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
        <button
          className="rounded-md border bg-white px-4 py-2 text-sm"
          onClick={() => window.close()}
        >
          Close
        </button>
      </div>

      {/* Cover */}
      <PrintSheet company={company} title="Monthly Reports" sub={monthName} breakAfter>
        <div className="flex flex-col items-center pt-16 text-center">
          <p className="text-[34px] font-extrabold" style={{ color: NAVY }}>
            {company?.name ?? "Turnkey Publishers"}
          </p>
          <p className="mt-2 text-[24px] font-bold" style={{ color: NAVY }}>
            Monthly Reports
          </p>
          <p className="mt-1 text-[22px] font-semibold text-gray-700">{monthName}</p>
          <ol
            className="mt-14 w-80 space-y-2 rounded-xl p-6 text-left text-[15px] font-semibold"
            style={{ background: LIGHT, border: `1.5px solid ${LINE}`, color: NAVY }}
          >
            {PACK_SECTIONS.map((x, i) => (
              <li key={x}>
                {i + 1}. {x}
              </li>
            ))}
          </ol>
          <div className="mt-14 grid w-full grid-cols-4 gap-3 text-[12px]">
            {[
              ["Received", sum(d.receipts as Row[], "amount")],
              ["Net sales", sum(d.byCustomer as Row[], "net")],
              ["Expenses", sum(d.expenses as Row[], "amount")],
              ["Receivable", sum(d.receivables as Row[], "balance")],
            ].map(([k, v]) => (
              <div
                key={String(k)}
                className="rounded-lg p-3"
                style={{ border: `1.5px solid ${LINE}` }}
              >
                <p className="text-gray-500">{k}</p>
                <p className="text-[15px] font-extrabold tabular-nums" style={{ color: NAVY }}>
                  Rs {amt(Number(v))}
                </p>
              </div>
            ))}
          </div>
        </div>
      </PrintSheet>

      {section(
        1,
        d.receipts as Row[],
        [
          { header: "Date", width: "88px", nowrap: true },
          { header: "Customer" },
          { header: "Description" },
          { header: "Amount", align: "right", width: "100px" },
        ],
        (r) => [dmy(s(r, "date")), s(r, "customer"), s(r, "description"), amt(Number(r["amount"]))],
        {
          label: `Total received (${(d.receipts as Row[]).length} receipts)`,
          cells: [amt(sum(d.receipts as Row[], "amount"))],
        },
      )}
      {section(
        2,
        d.byProduct as Row[],
        [
          { header: "#", align: "center", width: "32px" },
          { header: "Book / Product" },
          { header: "Qty sold", align: "right", width: "70px" },
          { header: "Returned", align: "right", width: "70px" },
          { header: "Net qty", align: "right", width: "64px" },
          { header: "Net sales", align: "right", width: "100px" },
        ],
        (r, i) => [
          i + 1,
          s(r, "group"),
          formatQty(Number(r["soldQty"])),
          formatQty(Number(r["returnedQty"])),
          formatQty(Number(r["netQty"])),
          amt(Number(r["net"])),
        ],
        {
          label: "Total",
          cells: [
            formatQty(sum(d.byProduct as Row[], "netQty")),
            amt(sum(d.byProduct as Row[], "net")),
          ],
        },
      )}
      {section(
        3,
        d.byCustomer as Row[],
        [
          { header: "#", align: "center", width: "32px" },
          { header: "Customer" },
          { header: "Invoices", align: "right", width: "62px" },
          { header: "Net qty", align: "right", width: "62px" },
          { header: "Net sales", align: "right", width: "96px" },
          { header: "Outstanding", align: "right", width: "96px" },
        ],
        (r, i) => [
          i + 1,
          s(r, "group"),
          formatQty(Number(r["invoices"])),
          formatQty(Number(r["netQty"])),
          amt(Number(r["net"])),
          amt(Number(r["outstanding"])),
        ],
        { label: "Total", cells: [amt(sum(d.byCustomer as Row[], "net"))] },
      )}
      {section(
        4,
        d.receivables as Row[],
        [
          { header: "#", align: "center", width: "32px" },
          { header: "Customer" },
          { header: "Not due", align: "right", width: "78px" },
          { header: "1–30", align: "right", width: "70px" },
          { header: "31–60", align: "right", width: "70px" },
          { header: "60+", align: "right", width: "70px" },
          { header: "Balance", align: "right", width: "90px" },
        ],
        (r, i) => [
          i + 1,
          s(r, "name"),
          amt(Number(r["current"])),
          amt(Number(r["d1_30"])),
          amt(Number(r["d31_60"])),
          amt(Number(r["d61_90"]) + Number(r["d90plus"])),
          amt(Number(r["balance"])),
        ],
        {
          label: `Total receivable as at ${dmy(d.to)}`,
          cells: [amt(sum(d.receivables as Row[], "balance"))],
        },
      )}
      <PrintSheet
        company={company}
        title={PACK_SECTIONS[4]}
        sub={`${period} · Generated on ${generated}`}
        breakAfter
      >
        {(d.expenses as Row[]).length ? (
          <>
            <ItemsTable
              cols={[
                { header: "Expense head" },
                { header: "Vouchers", align: "right", width: "80px" },
                { header: "Amount", align: "right", width: "110px" },
              ]}
              rows={(d.expenseHeads as Row[]).map((r) => [
                s(r, "group"),
                formatQty(Number(r["vouchers"])),
                amt(Number(r["amount"])),
              ])}
              minRows={0}
            />
            <ItemsTable
              cols={[
                { header: "Date", width: "88px", nowrap: true },
                { header: "Voucher", width: "96px" },
                { header: "Head", width: "110px" },
                { header: "Description" },
                { header: "Amount", align: "right", width: "96px" },
              ]}
              rows={(d.expenses as Row[]).map((r) => [
                dmy(s(r, "date")),
                s(r, "docNo"),
                s(r, "head"),
                [s(r, "paidTo"), s(r, "narration")].filter(Boolean).join(" — "),
                amt(Number(r["amount"])),
              ])}
              minRows={0}
            />
            <TotalRow label="Total expenses" cells={[amt(sum(d.expenses as Row[], "amount"))]} />
          </>
        ) : (
          <p className="mt-6 text-center text-gray-500">No expenses recorded for {monthName}.</p>
        )}
      </PrintSheet>
      {section(
        6,
        stock,
        [
          { header: "Book / Product" },
          { header: "Opening", align: "right", width: "54px" },
          { header: "Purch.", align: "right", width: "50px" },
          { header: "Sales", align: "right", width: "48px" },
          { header: "S.Ret", align: "right", width: "44px" },
          { header: "Sup.Ret", align: "right", width: "50px" },
          { header: "Samp.", align: "right", width: "46px" },
          { header: "Adj/Dmg", align: "right", width: "54px" },
          { header: "Closing", align: "right", width: "54px" },
          { header: "Value", align: "right", width: "80px" },
        ],
        (r) => [
          s(r, "name"),
          formatQty(Number(r["openingQty"])),
          formatQty(Number(r["purchases"])),
          formatQty(Number(r["sales"])),
          formatQty(Number(r["salesReturns"])),
          formatQty(Number(r["supplierReturns"])),
          formatQty(Number(r["samples"])),
          formatQty(Number(r["adjustments"]) - Number(r["damaged"])),
          formatQty(Number(r["closingQty"])),
          amt(Number(r["closingValue"])),
        ],
        {
          label: "Closing stock value",
          cells: [formatQty(sum(stock, "closingQty")), amt(sum(stock, "closingValue"))],
        },
        true,
      )}
      <div className="hidden">
        <ContactFooter company={company} />
      </div>
    </div>
  );
}
