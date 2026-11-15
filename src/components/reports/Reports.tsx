import { useState, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { DateRangeInputs, Field, SelectField, TextField } from "@/components/shared/Field";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { useApi } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { formatAmount, formatDate, formatPKR, formatQty } from "@/lib/format";
import {
  getAgeing,
  getBalanceSheet,
  getBankFinancePack,
  getCashBankSummary,
  getComparative,
  getExpenseReport,
  getMonthlyManagement,
  getProductReport,
  getProfitLoss,
  getPurchaseReport,
  getReceiptsReport,
  getSalesReport,
  getSamplesReport,
  getStockStatement,
  getTrialBalance,
} from "@/server/functions/reports";
import { useCategoryOptions } from "@/components/masters/CategoryManager";
import { PartyStatement, StockMovement, usePeriod } from "./Ledger";
import { ContactFooter, Letterhead, TitlePill } from "@/components/print/PrintShell";
import { getCompanyLogo } from "@/server/functions/admin";

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
const money = (key: string, header: string): Column<Row> => ({
  key,
  header,
  value: (r) => Number(r[key] ?? 0),
  render: (r) => formatAmount(Number(r[key] ?? 0), true),
  align: "right",
});
const qty = (key: string, header: string): Column<Row> => ({
  key,
  header,
  value: (r) => Number(r[key] ?? 0),
  render: (r) => (Number(r[key]) ? formatQty(Number(r[key])) : ""),
  align: "right",
});
const text = (key: string, header: string): Column<Row> => ({
  key,
  header,
  value: (r) => s(r, key),
});
const sum = (rows: Row[], k: string) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);

function Loading({ error }: { error?: unknown }) {
  return (
    <p className="py-8 text-center text-muted-foreground">
      {error ? String((error as Error).message) : "Preparing report…"}
    </p>
  );
}

function ReportFrame({
  title,
  period,
  controls,
  children,
}: {
  title: string;
  period?: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const { data: lk } = useLookups();
  const logo = useApi(["company-logo"], () => getCompanyLogo(), { staleTime: 300_000 });
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end gap-3">{controls}</div>
      <div
        className="print-area space-y-3"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        <div className="hidden print:block">
          <Letterhead compact logo={logo.data?.logo} />
          <TitlePill title={title} sub={period} />
        </div>
        <h2 className="text-xl font-bold text-navy print:hidden">{title}</h2>
        {period && <p className="text-sm text-muted-foreground print:hidden">{period}</p>}
        {children}
        <div className="hidden print:block">
          <ContactFooter company={lk?.company ?? null} />
        </div>
      </div>
    </div>
  );
}

function TotalsBar({ items }: { items: [string, number][] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg border bg-muted/30 px-4 py-2">
          <p className="text-xs text-muted-foreground">{k}</p>
          <p className="font-bold tabular-nums text-navy">{formatPKR(v)}</p>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- P&L etc */

export function ProfitLossReport() {
  const p = usePeriod();
  const q = useApi(
    ["pl", p.from, p.to],
    () => getProfitLoss({ data: { from: p.from, to: p.to } }),
    { enabled: p.ready },
  );
  const d = q.data;
  const sections = d ? [...new Set(d.lines.map((l) => s(l, "section")))] : [];
  return (
    <ReportFrame
      title="Profit & Loss Statement"
      period={`${formatDate(p.from)} to ${formatDate(p.to)}`}
      controls={<DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />}
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <TotalsBar
            items={[
              ["Revenue", d.revenue],
              ["Cost of sales", d.costOfSales],
              ["Gross profit", d.grossProfit],
              ["Operating expenses", d.expenses],
              ["Net profit", d.netProfit],
            ]}
          />
          <table className="w-full max-w-3xl text-sm">
            <tbody>
              {["Revenue", "Cost of Sales"].map((sec) => (
                <SectionRows
                  key={sec}
                  title={sec}
                  rows={d.lines.filter((l) => l["section"] === sec)}
                  total={sec === "Revenue" ? d.revenue : d.costOfSales}
                />
              ))}
              <tr className="border-y-2 font-bold text-navy">
                <td className="py-2">Gross profit</td>
                <td className="text-right tabular-nums">{formatAmount(d.grossProfit)}</td>
              </tr>
              {sections
                .filter((x) => x !== "Revenue" && x !== "Cost of Sales")
                .map((sec) => (
                  <SectionRows
                    key={sec}
                    title={sec}
                    rows={d.lines.filter((l) => l["section"] === sec)}
                    total={sum(
                      d.lines.filter((l) => l["section"] === sec),
                      "amount",
                    )}
                  />
                ))}
              <tr className="border-y-2 text-base font-bold text-navy">
                <td className="py-2">Net profit / (loss)</td>
                <td className="text-right tabular-nums">{formatAmount(d.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </ReportFrame>
  );
}

function SectionRows({ title, rows, total }: { title: string; rows: Row[]; total: number }) {
  return (
    <>
      <tr>
        <td colSpan={2} className="pt-4 font-semibold text-navy">
          {title}
        </td>
      </tr>
      {rows.map((l) => (
        <tr key={s(l, "code") + s(l, "name")} className="border-b border-border/50">
          <td className="py-1 pl-4">
            {s(l, "code")} {s(l, "name")}
          </td>
          <td className="text-right tabular-nums">{formatAmount(Number(l["amount"]))}</td>
        </tr>
      ))}
      <tr className="font-semibold">
        <td className="py-1 pl-4">Total {title.toLowerCase()}</td>
        <td className="text-right tabular-nums">{formatAmount(total)}</td>
      </tr>
    </>
  );
}

export function BalanceSheetReport() {
  const p = usePeriod();
  const [asOf, setAsOf] = useState<string | null>(null);
  const date = asOf ?? p.to;
  const q = useApi(["bs", date], () => getBalanceSheet({ data: { asOf: date } }), {
    enabled: p.ready,
  });
  const d = q.data;
  return (
    <ReportFrame
      title="Balance Sheet"
      period={`As at ${formatDate(date)}`}
      controls={<TextField label="As at" type="date" value={date} onChange={setAsOf} />}
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          {!d.balanced && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              Assets do not equal liabilities + equity. Check unapproved opening balances.
            </p>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              ["Assets", d.assets],
              ["Liabilities", d.liabilities],
              ["Equity", d.equity],
            ].map(([sec, total]) => (
              <table key={String(sec)} className="w-full text-sm">
                <tbody>
                  <SectionRows
                    title={String(sec)}
                    rows={d.lines.filter((l) => l["section"] === sec)}
                    total={Number(total)}
                  />
                </tbody>
              </table>
            ))}
            <div className="space-y-1 self-end rounded-lg border p-3 text-sm font-semibold">
              <div className="flex justify-between">
                <span>Total assets</span>
                <span className="tabular-nums">{formatAmount(d.assets)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total liabilities + equity</span>
                <span className="tabular-nums">{formatAmount(d.liabilities + d.equity)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </ReportFrame>
  );
}

export function TrialBalanceReport() {
  const p = usePeriod();
  const q = useApi(
    ["tb", p.from, p.to],
    () => getTrialBalance({ data: { from: p.from, to: p.to } }),
    { enabled: p.ready },
  );
  return (
    <ReportFrame
      title="Trial Balance"
      period={`${formatDate(p.from)} to ${formatDate(p.to)}`}
      controls={<DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />}
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <p
            className={`text-sm font-semibold ${Math.abs(q.data.totals.debit - q.data.totals.credit) < 0.01 ? "text-success" : "text-destructive"}`}
          >
            Closing debits {formatAmount(q.data.totals.debit)} · credits{" "}
            {formatAmount(q.data.totals.credit)}{" "}
            {Math.abs(q.data.totals.debit - q.data.totals.credit) < 0.01
              ? "— balanced"
              : "— NOT balanced"}
          </p>
          <DataTable
            rows={q.data.rows}
            pageSize={200}
            exportName="trial-balance"
            exportTitle={`Trial balance ${p.from} to ${p.to}`}
            columns={[
              text("code", "Code"),
              text("name", "Account"),
              text("type", "Type"),
              money("openingDr", "Opening Dr"),
              money("openingCr", "Opening Cr"),
              money("debit", "Period Dr"),
              money("credit", "Period Cr"),
              money("closingDr", "Closing Dr"),
              money("closingCr", "Closing Cr"),
            ]}
            footer={
              <tr>
                <td colSpan={7} className="py-2 text-right">
                  Totals
                </td>
                <td className="text-right tabular-nums">{formatAmount(q.data.totals.debit)}</td>
                <td className="text-right tabular-nums">{formatAmount(q.data.totals.credit)}</td>
              </tr>
            }
          />
        </>
      )}
    </ReportFrame>
  );
}

export function CashBankReport() {
  const p = usePeriod();
  const q = useApi(
    ["cashbank", p.from, p.to],
    () => getCashBankSummary({ data: { from: p.from, to: p.to } }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  return (
    <ReportFrame
      title="Cash & Bank Report"
      period={`${formatDate(p.from)} to ${formatDate(p.to)}`}
      controls={<DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />}
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <DataTable
          rows={rows}
          exportName="cash-bank"
          columns={[
            text("name", "Account"),
            text("status", "Status"),
            money("opening", "Opening"),
            money("receipts", "Receipts"),
            money("payments", "Payments"),
            money("closing", "Closing"),
          ]}
          footer={
            <tr>
              <td colSpan={2} className="py-2">
                Totals
              </td>
              {["opening", "receipts", "payments", "closing"].map((k) => (
                <td key={k} className="text-right tabular-nums">
                  {formatAmount(sum(rows, k))}
                </td>
              ))}
            </tr>
          }
        />
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------- parties */

export function AgeingReport({ partyType }: { partyType: "customer" | "supplier" }) {
  const p = usePeriod();
  const [asOf, setAsOf] = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const date = asOf ?? p.to;
  const q = useApi(
    ["ageing", partyType, date, category],
    () =>
      getAgeing({ data: { partyType, asOf: date, ...(category !== "All" ? { category } : {}) } }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  const cats = useCategoryOptions(partyType === "customer" ? "customer" : "supplier");
  const title =
    partyType === "customer"
      ? "Customer Outstanding & Ageing"
      : "Supplier / Vendor Outstanding & Ageing";
  return (
    <ReportFrame
      title={title}
      period={`As at ${formatDate(date)}${category !== "All" ? ` · ${category}` : ""}`}
      controls={
        <>
          <TextField label="As at" type="date" value={date} onChange={setAsOf} />
          <SelectField
            label="Category"
            className="w-56"
            value={category}
            onChange={setCategory}
            options={["All", ...cats]}
          />
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <TotalsBar
            items={[
              ["Total outstanding", sum(rows, "balance")],
              ["Overdue", sum(rows, "overdue")],
              ["Over 90 days", sum(rows, "d90plus")],
            ]}
          />
          <DataTable
            rows={rows}
            pageSize={100}
            exportName={`${partyType}-ageing`}
            exportTitle={`${title} as at ${date}`}
            columns={[
              text("code", "Code"),
              text("name", "Name"),
              text("category", "Category"),
              money("current", "Not due"),
              money("d1_30", "1–30 days"),
              money("d31_60", "31–60"),
              money("d61_90", "61–90"),
              money("d90plus", "90+"),
              money("onAccount", "Unapplied / advance"),
              money("balance", "Balance"),
            ]}
            footer={
              <tr>
                <td colSpan={3} className="py-2">
                  Totals
                </td>
                {["current", "d1_30", "d31_60", "d61_90", "d90plus", "onAccount", "balance"].map(
                  (k) => (
                    <td key={k} className="text-right tabular-nums">
                      {formatAmount(sum(rows, k))}
                    </td>
                  ),
                )}
              </tr>
            }
          />
        </>
      )}
    </ReportFrame>
  );
}

export function StatementReport({ partyType }: { partyType: "customer" | "supplier" }) {
  const { data: lk } = useLookups();
  const [partyId, setPartyId] = useState<string | null>(null);
  const list = partyType === "customer" ? (lk?.customers ?? []) : (lk?.suppliers ?? []);
  const party = list.find((x) => x.id === partyId);
  return (
    <ReportFrame
      title={`${partyType === "customer" ? "Customer" : "Supplier / Vendor"} Statement`}
      period={party ? `${party.name} (${party.code})` : undefined}
      controls={
        <Field label={partyType === "customer" ? "Customer" : "Supplier"} className="w-80">
          <SearchSelect
            options={list.map((x) => ({ value: x.id, label: x.name, hint: x.code }))}
            value={partyId}
            onChange={setPartyId}
          />
        </Field>
      }
    >
      {partyId && party ? (
        <PartyStatement
          key={partyId}
          partyType={partyType}
          partyId={partyId}
          partyName={party.name}
        />
      ) : (
        <p className="py-8 text-center text-muted-foreground">Choose a {partyType}.</p>
      )}
    </ReportFrame>
  );
}

/* --------------------------------------------------------------- stock */

const STOCK_COLS: [string, string][] = [
  ["openingQty", "Opening"],
  ["purchases", "Purchases"],
  ["sales", "Sales"],
  ["salesReturns", "Sales returns"],
  ["supplierReturns", "Supplier returns"],
  ["samples", "Samples (net)"],
  ["adjustments", "Adjust­ments"],
  ["damaged", "Damaged"],
  ["closingQty", "Closing"],
];

export function StockStatementReport({
  title = "Stock Statement",
  onProduct,
}: {
  title?: string;
  /** Clicking a row opens that book's movement. */
  onProduct?: (id: string) => void;
}) {
  const p = usePeriod();
  const [category, setCategory] = useState("All");
  const productCats = useCategoryOptions("product");
  const q = useApi(
    ["stock-statement", p.from, p.to, category],
    () =>
      getStockStatement({
        data: { from: p.from, to: p.to, ...(category !== "All" ? { category } : {}) },
      }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  return (
    <ReportFrame
      title={title}
      period={`${formatDate(p.from)} to ${formatDate(p.to)} · valued at weighted average cost`}
      controls={
        <>
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
          <SelectField
            label="Category"
            className="w-48"
            value={category}
            onChange={setCategory}
            options={["All", ...productCats]}
          />
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <TotalsBar
            items={[
              ["Opening value", sum(rows, "openingValue")],
              ["Closing value", sum(rows, "closingValue")],
            ]}
          />
          <DataTable
            rows={rows}
            pageSize={100}
            exportName="stock-statement"
            exportTitle={`${title} ${p.from} to ${p.to}`}
            {...(onProduct ? { onRowClick: (r: Row) => onProduct(s(r, "id")) } : {})}
            columns={[
              text("name", "Book / product"),
              text("code", "Code"),
              ...STOCK_COLS.map(([k, h]) => qty(k, h)),
              money("unitCost", "Unit cost"),
              money("closingValue", "Closing value"),
            ]}
            footer={
              <tr>
                <td colSpan={2} className="py-2">
                  Totals
                </td>
                {STOCK_COLS.map(([k]) => (
                  <td key={k} className="text-right tabular-nums">
                    {formatQty(sum(rows, k))}
                  </td>
                ))}
                <td />
                <td className="text-right tabular-nums">
                  {formatAmount(sum(rows, "closingValue"))}
                </td>
              </tr>
            }
          />
        </>
      )}
    </ReportFrame>
  );
}

/* --------------------------------------------------- transaction reports */

const SALES_GROUPS = [
  ["date", "Date"],
  ["month", "Month"],
  ["customer", "Customer"],
  ["customerCategory", "Customer type"],
  ["customerLocation", "Customer location"],
  ["product", "Book / product"],
  ["className", "Class"],
  ["subject", "Subject"],
  ["category", "Product category"],
] as const;
const PURCHASE_GROUPS = [
  ["date", "Date"],
  ["month", "Month"],
  ["supplier", "Supplier / vendor"],
  ["supplierCategory", "Supplier category"],
  ["product", "Item"],
  ["kind", "Purchase type"],
] as const;

export function SalesReport() {
  const p = usePeriod();
  const [groupBy, setGroupBy] = useState<(typeof SALES_GROUPS)[number][0]>("month");
  const q = useApi(
    ["sales-report", p.from, p.to, groupBy],
    () => getSalesReport({ data: { from: p.from, to: p.to, groupBy } }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  const label = SALES_GROUPS.find((g) => g[0] === groupBy)![1];
  return (
    <ReportFrame
      title={`Sales Report by ${label}`}
      period={`${formatDate(p.from)} to ${formatDate(p.to)} · approved invoices net of returns`}
      controls={
        <>
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
          <SelectField
            label="Group by"
            className="w-52"
            value={groupBy}
            onChange={(v) => setGroupBy(v as typeof groupBy)}
            options={SALES_GROUPS.map(([value, l]) => ({ value, label: l }))}
          />
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <TotalsBar
            items={[
              ["Gross sales", sum(rows, "gross")],
              ["Returns", sum(rows, "returns")],
              ["Net sales", sum(rows, "net")],
              ["Cost of sales", sum(rows, "cost")],
              ["Gross margin", sum(rows, "margin")],
            ]}
          />
          <DataTable
            rows={rows}
            pageSize={100}
            exportName={`sales-by-${groupBy}`}
            exportTitle={`Sales by ${label} ${p.from} to ${p.to}`}
            columns={[
              {
                key: "group",
                header: label,
                value: (r) => s(r, "group"),
                render: (r) => (groupBy === "date" ? formatDate(s(r, "group")) : s(r, "group")),
              },
              qty("invoices", "Invoices"),
              qty("soldQty", "Qty sold"),
              qty("returnedQty", "Qty returned"),
              money("gross", "Gross"),
              money("returns", "Returns"),
              money("net", "Net sales"),
              money("cost", "Cost"),
              money("margin", "Margin"),
              ...(groupBy === "customer" ? [money("outstanding", "Outstanding balance")] : []),
            ]}
          />
        </>
      )}
    </ReportFrame>
  );
}

export function PurchaseReport() {
  const p = usePeriod();
  const [groupBy, setGroupBy] = useState<(typeof PURCHASE_GROUPS)[number][0]>("supplier");
  const q = useApi(
    ["purchase-report", p.from, p.to, groupBy],
    () => getPurchaseReport({ data: { from: p.from, to: p.to, groupBy } }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  const label = PURCHASE_GROUPS.find((g) => g[0] === groupBy)![1];
  return (
    <ReportFrame
      title={`Purchase Report by ${label}`}
      period={`${formatDate(p.from)} to ${formatDate(p.to)}`}
      controls={
        <>
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
          <SelectField
            label="Group by"
            className="w-52"
            value={groupBy}
            onChange={(v) => setGroupBy(v as typeof groupBy)}
            options={PURCHASE_GROUPS.map(([value, l]) => ({ value, label: l }))}
          />
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <TotalsBar
            items={[
              ["Gross purchases", sum(rows, "gross")],
              ["Returns", sum(rows, "returns")],
              ["Net purchases", sum(rows, "net")],
            ]}
          />
          <DataTable
            rows={rows}
            pageSize={100}
            exportName={`purchases-by-${groupBy}`}
            columns={[
              {
                key: "group",
                header: label,
                value: (r) => s(r, "group"),
                render: (r) => (groupBy === "date" ? formatDate(s(r, "group")) : s(r, "group")),
              },
              qty("invoices", "Invoices"),
              qty("qty", "Qty"),
              qty("returnedQty", "Returned"),
              money("gross", "Gross"),
              money("returns", "Returns"),
              money("net", "Net"),
            ]}
          />
        </>
      )}
    </ReportFrame>
  );
}

export function ExpenseReport() {
  const p = usePeriod();
  const { data: lk } = useLookups();
  const [groupBy, setGroupBy] = useState<"detail" | "date" | "month" | "head" | "method">("head");
  const [headId, setHeadId] = useState("all");
  const q = useApi(
    ["expense-report", p.from, p.to, groupBy, headId],
    () =>
      getExpenseReport({
        data: { from: p.from, to: p.to, groupBy, ...(headId !== "all" ? { headId } : {}) },
      }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  const headName = lk?.expenseHeads.find((h) => h.id === headId)?.name;
  return (
    <ReportFrame
      title={headName ? `Expense Report – ${headName}` : "Expense Report"}
      period={`${formatDate(p.from)} to ${formatDate(p.to)}`}
      controls={
        <>
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
          <SelectField
            label="Group by"
            className="w-48"
            value={groupBy}
            onChange={(v) => setGroupBy(v as typeof groupBy)}
            options={[
              { value: "head", label: "Expense head" },
              { value: "detail", label: "Voucher list (detail)" },
              { value: "month", label: "Month" },
              { value: "date", label: "Date" },
              { value: "method", label: "Payment method" },
            ]}
          />
          <SelectField
            label="Expense head"
            className="w-56"
            value={headId}
            onChange={setHeadId}
            options={[
              { value: "all", label: "All heads" },
              ...(lk?.expenseHeads ?? []).map((h) => ({ value: h.id, label: h.name })),
            ]}
          />
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : groupBy === "detail" ? (
        <DataTable
          rows={rows}
          pageSize={100}
          exportName="expense-vouchers"
          exportTitle={`Expense vouchers ${p.from} to ${p.to}`}
          columns={[
            {
              key: "date",
              header: "Date",
              value: (r) => s(r, "date"),
              render: (r) => formatDate(s(r, "date")),
            },
            text("docNo", "Voucher"),
            text("head", "Expense head"),
            text("paidTo", "Paid to"),
            text("narration", "Description"),
            text("reference", "Bill no."),
            text("method", "Method"),
            money("amount", "Amount"),
          ]}
          footer={
            <tr>
              <td colSpan={7} className="py-2">
                Total ({rows.length} vouchers)
              </td>
              <td className="text-right tabular-nums">{formatAmount(sum(rows, "amount"))}</td>
            </tr>
          }
        />
      ) : (
        <DataTable
          rows={rows}
          pageSize={100}
          exportName={`expenses-by-${groupBy}`}
          columns={[
            {
              key: "group",
              header: "Group",
              value: (r) => s(r, "group"),
              render: (r) => (groupBy === "date" ? formatDate(s(r, "group")) : s(r, "group")),
            },
            qty("vouchers", "Vouchers"),
            money("amount", "Amount"),
          ]}
          footer={
            <tr>
              <td className="py-2">Total</td>
              <td className="text-right">{formatQty(sum(rows, "vouchers"))}</td>
              <td className="text-right tabular-nums">{formatAmount(sum(rows, "amount"))}</td>
            </tr>
          }
        />
      )}
    </ReportFrame>
  );
}

export function SamplesReport() {
  const p = usePeriod();
  const [groupBy, setGroupBy] = useState<"date" | "month" | "person" | "customer" | "product">(
    "customer",
  );
  const q = useApi(
    ["samples-report", p.from, p.to, groupBy],
    () => getSamplesReport({ data: { from: p.from, to: p.to, groupBy } }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  return (
    <ReportFrame
      title="Samples Report"
      period={`${formatDate(p.from)} to ${formatDate(p.to)}`}
      controls={
        <>
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
          <SelectField
            label="Group by"
            className="w-48"
            value={groupBy}
            onChange={(v) => setGroupBy(v as typeof groupBy)}
            options={[
              { value: "customer", label: "Customer / institution" },
              { value: "person", label: "Person issued to" },
              { value: "product", label: "Book" },
              { value: "month", label: "Month" },
              { value: "date", label: "Date" },
            ]}
          />
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <DataTable
          rows={rows}
          pageSize={100}
          exportName={`samples-by-${groupBy}`}
          columns={[
            {
              key: "group",
              header: "Group",
              value: (r) => s(r, "group"),
              render: (r) => (groupBy === "date" ? formatDate(s(r, "group")) : s(r, "group")),
            },
            qty("slips", "Slips"),
            qty("issued", "Issued"),
            qty("returned", "Returned"),
            qty("outstanding", "Outstanding"),
            money("outstandingValue", "Outstanding value (cost)"),
          ]}
        />
      )}
    </ReportFrame>
  );
}

export function ProductReport() {
  const p = usePeriod();
  const { data: lk } = useLookups();
  const [productId, setProductId] = useState<string | null>(null);
  const q = useApi(
    ["product-report", productId, p.from, p.to],
    () => getProductReport({ data: { productId: productId!, from: p.from, to: p.to } }),
    { enabled: Boolean(productId) && p.ready },
  );
  const prod = lk?.products.find((x) => x.id === productId);
  return (
    <ReportFrame
      title="Book / Product Report"
      period={
        prod
          ? `${prod.code} · ${prod.name} · ${formatDate(p.from)} to ${formatDate(p.to)}`
          : undefined
      }
      controls={
        <>
          <Field label="Book" className="w-80">
            <SearchSelect
              options={(lk?.products ?? []).map((x) => ({
                value: x.id,
                label: `${x.code} · ${x.name}`,
              }))}
              value={productId}
              onChange={setProductId}
            />
          </Field>
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
        </>
      }
    >
      {!productId ? (
        <p className="py-8 text-center text-muted-foreground">Choose a book.</p>
      ) : !q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <TotalsBar
            items={[
              ["Net sales", q.data.netSales],
              ["Cost of sales", q.data.costOfSales],
              ["Gross margin", q.data.grossMargin],
            ]}
          />
          {prod && (
            <p className="text-sm">
              Current stock: <b>{formatQty(prod.stockQty)}</b> · Weighted average cost:{" "}
              <b>{formatPKR(prod.avgCost)}</b> · Sale price: <b>{formatPKR(prod.salePrice)}</b>
            </p>
          )}
          <DataTable
            rows={q.data.summary}
            compact
            columns={[
              text("item", "Activity"),
              qty("qty", "Quantity"),
              money("value", "Value"),
              qty("documents", "Documents"),
            ]}
          />
        </>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------- management packs */

export function MonthlyManagementReport() {
  const p = usePeriod();
  const [month, setMonth] = useState<string | null>(null);
  const m = month ?? p.to.slice(0, 7);
  const q = useApi(["mma", m], () => getMonthlyManagement({ data: { month: m } }), {
    enabled: p.ready,
  });
  return (
    <ReportFrame
      title="Monthly Management Accounts"
      period={
        q.data ? `Month ${m} · year to date from ${formatDate(q.data.period.ytdFrom)}` : undefined
      }
      controls={<TextField label="Month" type="month" value={m} onChange={setMonth} />}
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <DataTable
            rows={q.data.rows}
            compact
            columns={[
              text("item", "Performance"),
              money("month", "This month"),
              money("ytd", "Year to date"),
            ]}
          />
          <DataTable
            rows={q.data.position}
            compact
            columns={[
              text("item", `Position at ${formatDate(q.data.period.to)}`),
              money("amount", "Amount"),
            ]}
          />
        </div>
      )}
    </ReportFrame>
  );
}

export function ComparativeReport() {
  const p = usePeriod();
  const [mode, setMode] = useState<"month" | "year" | "custom">("month");
  const [custom, setCustom] = useState({ aFrom: p.from, aTo: p.to, bFrom: p.from, bTo: p.to });
  const shift = (iso: string, months: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  };
  const monthStart = `${p.to.slice(0, 7)}-01`;
  const a =
    mode === "custom"
      ? { from: custom.aFrom, to: custom.aTo }
      : mode === "month"
        ? { from: monthStart, to: p.to }
        : { from: p.from, to: p.to };
  const b =
    mode === "custom"
      ? { from: custom.bFrom, to: custom.bTo }
      : mode === "month"
        ? { from: shift(a.from, -1), to: shift(a.to, -1) }
        : { from: shift(a.from, -12), to: shift(a.to, -12) };
  const q = useApi(["comparative", a, b], () => getComparative({ data: { a, b } }), {
    enabled: p.ready,
  });
  const cols = (first: string): Column<Row>[] => [
    text(first, first === "section" ? "Section" : "Item"),
    ...(first === "section" ? [text("item", "Account")] : []),
    money("current", "Current period"),
    money("previous", "Comparison period"),
    money("change", "Change"),
    {
      key: "changePct",
      header: "Change %",
      value: (r) => Number(r["changePct"] ?? 0),
      render: (r) => (r["changePct"] === null ? "—" : `${s(r, "changePct")}%`),
      align: "right",
    },
  ];
  return (
    <ReportFrame
      title="Comparative Report"
      period={`${formatDate(a.from)}–${formatDate(a.to)} vs ${formatDate(b.from)}–${formatDate(b.to)}`}
      controls={
        <>
          <SelectField
            label="Compare"
            className="w-64"
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[
              { value: "month", label: "This month vs last month" },
              { value: "year", label: "This year vs last year" },
              { value: "custom", label: "Custom periods" },
            ]}
          />
          {mode === "custom" && (
            <>
              <TextField
                label="Current from"
                type="date"
                value={custom.aFrom}
                onChange={(v) => setCustom({ ...custom, aFrom: v })}
              />
              <TextField
                label="Current to"
                type="date"
                value={custom.aTo}
                onChange={(v) => setCustom({ ...custom, aTo: v })}
              />
              <TextField
                label="Compare from"
                type="date"
                value={custom.bFrom}
                onChange={(v) => setCustom({ ...custom, bFrom: v })}
              />
              <TextField
                label="Compare to"
                type="date"
                value={custom.bTo}
                onChange={(v) => setCustom({ ...custom, bTo: v })}
              />
            </>
          )}
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <DataTable rows={q.data.summary} compact columns={cols("item")} />
          <h3 className="pt-2 font-semibold text-navy">Account detail</h3>
          <DataTable
            rows={q.data.detail}
            pageSize={100}
            exportName="comparative"
            columns={cols("section")}
          />
        </>
      )}
    </ReportFrame>
  );
}

export function BankFinanceReport() {
  const p = usePeriod();
  const [asOf, setAsOf] = useState<string | null>(null);
  const date = asOf ?? p.to;
  const q = useApi(["bank-pack", date], () => getBankFinancePack({ data: { asOf: date } }), {
    enabled: p.ready,
  });
  const d = q.data;
  return (
    <ReportFrame
      title="Bank Finance Report"
      period={`As at ${formatDate(date)}`}
      controls={
        <>
          <TextField label="As at" type="date" value={date} onChange={setAsOf} />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print pack
          </Button>
        </>
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <div className="space-y-6">
          <TotalsBar
            items={[
              ["Total assets", d.balanceSheet.assets],
              ["Total liabilities", d.balanceSheet.liabilities],
              ["Equity", d.balanceSheet.equity],
              [`Net profit (from ${formatDate(d.profitLoss.from)})`, d.profitLoss.netProfit],
            ]}
          />
          <section>
            <h3 className="mb-2 font-semibold text-navy">1. Stock by category (at cost)</h3>
            <DataTable
              rows={d.stock}
              compact
              columns={[
                text("category", "Category"),
                qty("qty", "Quantity"),
                money("value", "Value"),
              ]}
            />
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-navy">2. Receivables and payables by age</h3>
            <DataTable
              rows={d.ageing}
              compact
              columns={[
                text("kind", ""),
                money("current", "Not due"),
                money("d1_90", "1–90 days"),
                money("d90plus", "Over 90 days"),
                money("total", "Total"),
              ]}
            />
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-navy">3. Borrowings</h3>
            <DataTable
              rows={d.borrowings}
              compact
              columns={[
                text("code", "Code"),
                text("name", "Facility"),
                money("amount", "Outstanding"),
              ]}
            />
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-navy">4. Balance sheet</h3>
            <DataTable
              rows={d.balanceSheet.lines}
              compact
              columns={[
                text("section", "Section"),
                text("group", "Group"),
                text("name", "Account"),
                money("amount", "Amount"),
              ]}
            />
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-navy">5. Profit & loss (year to date)</h3>
            <DataTable
              rows={d.profitLoss.lines}
              compact
              columns={[
                text("section", "Section"),
                text("name", "Account"),
                money("amount", "Amount"),
              ]}
            />
          </section>
        </div>
      )}
    </ReportFrame>
  );
}

/* ------------------------------------------------------------- receipts */

export function ReceiptsReport() {
  const p = usePeriod();
  const { data: lk } = useLookups();
  const [groupBy, setGroupBy] = useState<"detail" | "date" | "customer" | "method">("detail");
  const [customerId, setCustomerId] = useState("");
  const q = useApi(
    ["receipts-report", p.from, p.to, groupBy, customerId],
    () =>
      getReceiptsReport({
        data: { from: p.from, to: p.to, groupBy, ...(customerId ? { customerId } : {}) },
      }),
    { enabled: p.ready },
  );
  const rows = q.data ?? [];
  const label = { detail: "Receipts", date: "Date", customer: "Customer", method: "Method" }[
    groupBy
  ];
  return (
    <ReportFrame
      title={groupBy === "detail" ? "Receivings" : `Receipts by ${label}`}
      period={`${formatDate(p.from)} – ${formatDate(p.to)}`}
      controls={
        <>
          <DateRangeInputs from={p.from} to={p.to} onChange={p.setRange} />
          <SelectField
            label="Show"
            className="w-52"
            value={groupBy}
            onChange={(v) => setGroupBy(v as typeof groupBy)}
            options={[
              { value: "detail", label: "Receipts register" },
              { value: "date", label: "Date-wise totals" },
              { value: "customer", label: "Customer-wise totals" },
              { value: "method", label: "Payment-method totals" },
            ]}
          />
          <Field label="Customer" className="w-64">
            <SearchSelect
              options={[
                { value: "", label: "All customers" },
                ...(lk?.customers ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                  hint: [c.code, c.phone].filter(Boolean).join(" · "),
                })),
              ]}
              value={customerId}
              onChange={setCustomerId}
            />
          </Field>
        </>
      }
    >
      {!q.data ? (
        <Loading error={q.error} />
      ) : (
        <>
          <TotalsBar items={[["Total received", sum(rows, "amount")]]} />
          {groupBy === "detail" ? (
            <DataTable
              rows={rows}
              pageSize={200}
              exportName="receivings"
              exportTitle={`Receivings ${p.from} to ${p.to}`}
              columns={[
                {
                  key: "date",
                  header: "Date",
                  value: (r) => s(r, "date"),
                  render: (r) => formatDate(s(r, "date")),
                },
                text("customer", "Customer"),
                text("description", "Description"),
                text("docNo", "Receipt no."),
                text("account", "Received into"),
                money("amount", "Amount"),
              ]}
              footer={
                <tr>
                  <td colSpan={5} className="py-2">
                    Total ({rows.length} receipts)
                  </td>
                  <td className="text-right tabular-nums">{formatAmount(sum(rows, "amount"))}</td>
                </tr>
              }
            />
          ) : (
            <DataTable
              rows={rows}
              pageSize={200}
              exportName={`receipts-by-${groupBy}`}
              columns={[
                {
                  key: "group",
                  header: label,
                  value: (r) => s(r, "group"),
                  render: (r) => (groupBy === "date" ? formatDate(s(r, "group")) : s(r, "group")),
                },
                qty("receipts", "Receipts"),
                money("amount", "Amount"),
              ]}
              footer={
                <tr>
                  <td className="py-2">Total</td>
                  <td className="text-right">{formatQty(sum(rows, "receipts"))}</td>
                  <td className="text-right tabular-nums">{formatAmount(sum(rows, "amount"))}</td>
                </tr>
              }
            />
          )}
        </>
      )}
    </ReportFrame>
  );
}

/* ----------------------------------------------------- product movement */

/** One book: opening, every kind of movement and closing, then the dated movement list. */
export function ProductMovementReport({ initialId }: { initialId?: string | null }) {
  const p = usePeriod();
  const { data: lk } = useLookups();
  const [productId, setProductId] = useState(initialId ?? "");
  const q = useApi(
    ["stock-statement-one", productId, p.from, p.to],
    () => getStockStatement({ data: { from: p.from, to: p.to, productId } }),
    { enabled: p.ready && Boolean(productId) },
  );
  const r = (q.data ?? [])[0];
  const name = lk?.products.find((x) => x.id === productId)?.name ?? "";
  return (
    <ReportFrame
      title={name ? `Stock Movement – ${name}` : "Product-wise Stock Movement"}
      period={`${formatDate(p.from)} – ${formatDate(p.to)}`}
      controls={
        <Field label="Book / product" className="w-80">
          <SearchSelect
            ariaLabel="Book / product"
            placeholder="Search by title or code…"
            options={(lk?.products ?? []).map((x) => ({
              value: x.id,
              label: x.name,
              hint: `${x.code} · Stock ${x.stockQty}`,
            }))}
            value={productId}
            onChange={setProductId}
          />
        </Field>
      }
    >
      {!productId ? (
        <p className="py-8 text-center text-muted-foreground">
          Choose a book to see its opening stock, purchases, sales, returns, samples, adjustments,
          damaged stock and closing stock, with every dated movement.
        </p>
      ) : !r ? (
        <Loading error={q.error} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {STOCK_COLS.map(([k, h]) => (
              <div
                key={k}
                className={`rounded-lg border px-3 py-2 ${k === "closingQty" || k === "openingQty" ? "bg-primary/5" : "bg-muted/30"}`}
              >
                <p className="text-xs text-muted-foreground">{h.replace("\u00ad", "")}</p>
                <p className="text-lg font-bold tabular-nums text-navy">
                  {formatQty(Number(r[k] ?? 0))}
                </p>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Closing value</p>
              <p className="text-lg font-bold tabular-nums text-navy">
                {formatPKR(Number(r["closingValue"] ?? 0))}
              </p>
            </div>
          </div>
          <StockMovement productId={productId} period={p} />
        </>
      )}
    </ReportFrame>
  );
}
