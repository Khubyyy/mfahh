import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { getAuthState } from "@/server/functions/auth";
import { getDocument } from "@/server/functions/documents";
import { getLookups } from "@/server/functions/masters";
import { getCompanyLogo } from "@/server/functions/admin";
import { PrintShell } from "@/components/print/PrintShell";
import {
  InfoBox,
  ItemsTable,
  MethodRadios,
  Signatures,
  TotalsPanel,
  type ItemCol,
} from "@/components/print/Blocks";
import { formatAmount, formatDate } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import type { DocType } from "@/shared/documents";

/** Printable invoice / voucher / slip in the house blue-and-white design. "Save as PDF" gives a PDF. */
export const Route = createFileRoute("/print/$id")({
  ssr: false,
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage !== "signedIn") throw redirect({ to: "/auth" });
  },
  loader: async ({ params }) => ({
    detail: await getDocument({ data: { id: params.id } }),
    lookups: await getLookups(),
    logo: (await getCompanyLogo()).logo,
  }),
  head: () => ({ meta: [{ title: "Print – MFAHH" }] }),
  component: PrintDocument,
});

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
const amt = (v: unknown) => formatAmount(Number(v ?? 0));

const TITLES: Partial<Record<DocType, string>> = {
  SI: "Sales Invoice",
  SO: "Sales Order",
  SR: "Sales Return Invoice",
  RV: "Receipt Voucher",
  PI: "Purchase Invoice",
  PR: "Supplier Return Invoice",
  PV: "Payment Voucher",
  EXP: "Voucher",
  JV: "Journal Voucher",
  SMP: "Sample Issue Slip",
  SMR: "Sample Return Note",
  ADJ: "Stock Adjustment",
  DMG: "Damaged Stock Note",
  OB: "Opening Balances",
  PAYROLL: "Salary Sheet",
  SALPAY: "Salary Payment",
  LOAN: "Staff Advance / Loan",
  CLOSE: "Year-end Closing",
};
const SUBTITLES: Partial<Record<DocType, string>> = {
  SR: "Credit note",
  PR: "Debit note",
  EXP: "Expense payment voucher",
};

function PrintDocument() {
  const { detail, lookups, logo } = Route.useLoaderData();
  const d = detail.doc;
  const type = s(d, "type") as DocType;
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  const party =
    lookups.customers.find((c) => c.id === d["partyId"]) ??
    lookups.suppliers.find((c) => c.id === d["partyId"]) ??
    lookups.staff.find((c) => c.id === d["partyId"]);
  const p = (party ?? {}) as {
    name?: string;
    code?: string;
    phone?: string;
    address?: string;
    city?: string;
    location?: string;
  };
  const origin = detail.related.find((r) => r["id"] === d["refDocId"]);
  const signatures = (last: string) => [
    { label: "Prepared By", name: s(d, "createdByName") },
    { label: "Checked By" },
    { label: "Approved By", name: s(d, "approvedByName") },
    { label: last },
  ];
  const words = amountInWords(Number(d["total"]));

  let body: ReactNode;
  if (["SI", "SO", "SR", "PI", "PR"].includes(type)) {
    const supplierSide = type === "PI" || type === "PR";
    const returns = type === "SR" || type === "PR";
    const cols: ItemCol[] = [
      { header: "#", align: "center", width: "32px" },
      { header: supplierSide && s(d, "kind") !== "Books" ? "Description" : "Book / Product" },
      ...(type === "SR" ? [{ header: "Condition", width: "74px" }] : []),
      { header: "Qty", align: "right", width: "52px" },
      { header: "Rate", align: "right", width: "74px" },
      { header: "Disc", align: "right", width: "70px" },
      { header: "Amount (PKR)", align: "right", width: "104px" },
    ];
    const rows = detail.lines.map((l, i) => [
      i + 1,
      l["productName"] ? (
        <>
          <span className="font-semibold">{s(l, "productName")}</span>
          <span className="ml-1 text-[10px] text-gray-500">{s(l, "productCode")}</span>
        </>
      ) : (
        `${s(l, "accountName")}${l["description"] ? `: ${s(l, "description")}` : ""}`
      ),
      ...(type === "SR" ? [s(l, "condition") || "Saleable"] : []),
      s(l, "qty"),
      amt(l["rate"]),
      [
        Number(l["discountRs"]) ? `Rs ${amt(l["discountRs"])}` : "",
        Number(l["discountPct"]) ? `${Number(l["discountPct"])}%` : "",
      ]
        .filter(Boolean)
        .join(" + "),
      amt(l["amount"]),
    ]);
    const settled = Number(d["paidAmount"]) + Number(d["creditedAmount"]);
    const gross = detail.lines.reduce((x, l) => x + Number(l["qty"]) * Number(l["rate"]), 0);
    const discountTotal = gross - Number(d["subtotal"]) + Number(d["discount"]);
    body = (
      <>
        <InfoBox
          left={[
            [type === "SO" ? "Order No" : returns ? "Return No" : "Invoice No", s(d, "docNo")],
            ["Date", formatDate(s(d, "date"))],
            ...(d["dueDate"] && !returns
              ? ([["Due Date", formatDate(s(d, "dueDate"))]] as [string, ReactNode][])
              : []),
            ...(origin
              ? ([
                  [
                    returns ? "Against Invoice" : type === "SO" ? "From Invoice" : "Against Order",
                    `${s(origin, "docNo")} · ${formatDate(s(origin, "date"))}`,
                  ],
                ] as [string, ReactNode][])
              : []),
            [supplierSide && !returns ? "Supplier Inv. No" : "Reference", s(d, "reference")],
          ]}
          right={[
            [supplierSide ? "Supplier" : "Customer", p.name ?? ""],
            ["Code", p.code ?? ""],
            ["Phone", p.phone ?? ""],
            [
              "Address",
              [p.address, p.city && !(p.address ?? "").includes(p.city) ? p.city : ""]
                .filter(Boolean)
                .join(", "),
            ],
            ...(returns && d["reason"]
              ? ([["Reason", s(d, "reason")]] as [string, ReactNode][])
              : []),
          ]}
        />
        <ItemsTable cols={cols} rows={rows} minRows={6} />
        <TotalsPanel
          remarks={s(d, "narration")}
          words={words}
          totals={[
            ["Gross Amount", amt(gross)],
            ...(discountTotal > 0.004
              ? ([["Discount", `(${amt(discountTotal)})`]] as [string, string][])
              : []),
            ...(Number(d["taxAmount"]) > 0
              ? ([[`Sales Tax ${s(d, "taxPct")}%`, amt(d["taxAmount"])]] as [string, string][])
              : []),
            ["Total Amount", amt(d["total"]), true],
            ...((type === "SI" || type === "PI") && settled > 0
              ? ([["Balance Due", amt(d["outstanding"])]] as [string, string][])
              : []),
          ]}
        />
        <Signatures
          boxes={signatures(
            supplierSide
              ? returns
                ? "Supplier Signature"
                : "Received in Store"
              : "Customer Signature",
          )}
        />
      </>
    );
  } else if (type === "EXP") {
    const items = detail.lines.length
      ? detail.lines.map((l, i) => [i + 1, s(l, "description"), amt(l["amount"])])
      : [[1, s(d, "narration"), amt(d["total"])]];
    body = (
      <>
        <InfoBox
          left={[
            ["Voucher No", s(d, "docNo")],
            ["Date", formatDate(s(d, "date"))],
            ["Expense Head", s(d, "expenseHead")],
            ["Bill / Inv. No", s(d, "reference")],
          ]}
          right={[
            ["Paid To", s(d, "paidTo")],
            ["Department", s(d, "department")],
            ["Payment Method", <MethodRadios key="m" value={s(d, "method")} />],
            [
              "Paid From",
              s(d, "method") === "Cash"
                ? "Cash in hand"
                : `${s(d, "bankName")}${d["chequeNo"] ? ` · Chq # ${s(d, "chequeNo")}` : ""}`,
            ],
          ]}
        />
        <ItemsTable
          cols={[
            { header: "#", align: "center", width: "40px" },
            { header: "Description", align: "center" },
            { header: "Amount (PKR)", align: "right", width: "150px" },
          ]}
          rows={items}
          minRows={5}
        />
        <TotalsPanel
          remarks={detail.lines.length ? s(d, "narration") : ""}
          totals={[["Total Amount", amt(d["total"]), true]]}
          words={words}
        />
        <Signatures boxes={signatures("Received By")} />
      </>
    );
  } else if (["RV", "PV", "SALPAY", "LOAN"].includes(type)) {
    const incoming = type === "RV";
    const method = s(d, "method");
    const how =
      method === "Cheque"
        ? `Cheque${d["chequeNo"] ? ` # ${s(d, "chequeNo")}` : ""}`
        : method === "Online"
          ? "Online transfer"
          : method === "Bank"
            ? "Bank deposit"
            : "Cash";
    const allocs = detail.allocations.filter((a) => a["direction"] === "allocated to");
    const rows: ReactNode[][] =
      type === "SALPAY"
        ? detail.lines.map((l, i) => [i + 1, `Salary: ${s(l, "partyName")}`, amt(l["amount"])])
        : allocs.length
          ? [
              ...allocs.map((a, i) => [
                i + 1,
                `${how} ${incoming ? "received" : "paid"} against ${s(a, "docNo")} dated ${formatDate(s(a, "date"))}`,
                amt(a["amount"]),
              ]),
              ...(Number(d["total"]) - allocs.reduce((x, a) => x + Number(a["amount"]), 0) > 0.004
                ? [
                    [
                      allocs.length + 1,
                      `${how} ${incoming ? "received" : "paid"} on account`,
                      amt(Number(d["total"]) - allocs.reduce((x, a) => x + Number(a["amount"]), 0)),
                    ],
                  ]
                : []),
            ]
          : [
              [
                1,
                type === "LOAN"
                  ? `${s(d, "loanType") || "Advance"} to staff`
                  : `${how} ${incoming ? "received" : "paid"}`,
                amt(d["total"]),
              ],
            ];
    body = (
      <>
        <InfoBox
          left={[
            [incoming ? "Receipt No" : "Voucher No", s(d, "docNo")],
            ["Date", formatDate(s(d, "date"))],
            ["Reference", s(d, "reference")],
          ]}
          right={[
            [incoming ? "Received From" : "Paid To", p.name ?? ""],
            [incoming ? "Received Via" : "Payment Method", <MethodRadios key="m" value={method} />],
            [
              incoming ? "Received Into" : "Paid From",
              method === "Cash"
                ? "Cash in hand"
                : `${s(d, "bankName")}${d["chequeNo"] ? ` · Chq # ${s(d, "chequeNo")}` : ""}`,
            ],
          ]}
        />
        <ItemsTable
          cols={[
            { header: "#", align: "center", width: "40px" },
            { header: "Description" },
            { header: "Amount (PKR)", align: "right", width: "150px" },
          ]}
          rows={rows}
          minRows={4}
        />
        <TotalsPanel
          remarks={s(d, "narration")}
          totals={[["Total Amount", amt(d["total"]), true]]}
          words={words}
        />
        <Signatures boxes={signatures(incoming ? "Paid By (Customer)" : "Received By")} />
      </>
    );
  } else {
    body = <GenericBody type={type} d={d} lines={detail.lines} partyName={p.name} />;
  }

  return (
    <PrintShell
      company={lookups.company ? { ...lookups.company, logo } : null}
      title={TITLES[type] ?? s(d, "typeLabel")}
      sub={SUBTITLES[type]}
      status={s(d, "status")}
    >
      {body}
    </PrintShell>
  );
}

/** Journals, stock notes, samples and payroll: same theme, type-specific columns. */
function GenericBody({
  type,
  d,
  lines,
  partyName,
}: {
  type: DocType;
  d: Row;
  lines: Row[];
  partyName?: string;
}) {
  const accounts = type === "JV" || type === "OB" || type === "CLOSE";
  const stock = ["ADJ", "DMG", "SMP", "SMR"].includes(type);
  const cols: ItemCol[] = [
    { header: "#", align: "center", width: "32px" },
    { header: accounts ? "Account / item" : type === "PAYROLL" ? "Employee" : "Book / Product" },
    ...(type === "PAYROLL"
      ? [
          { header: "Gross", align: "right" as const },
          { header: "Deductions", align: "right" as const },
          { header: "Recovery", align: "right" as const },
          { header: "Net", align: "right" as const },
        ]
      : accounts
        ? [
            { header: "Debit", align: "right" as const, width: "110px" },
            { header: "Credit", align: "right" as const, width: "110px" },
          ]
        : [
            { header: "Qty", align: "right" as const, width: "70px" },
            ...(stock ? [{ header: "Unit cost", align: "right" as const, width: "90px" }] : []),
            { header: "Value", align: "right" as const, width: "110px" },
          ]),
  ];
  const rows = lines.map((l, i) => {
    const name = l["productName"]
      ? `${s(l, "productName")} (${s(l, "productCode")})`
      : l["partyName"]
        ? s(l, "partyName")
        : `${s(l, "accountCode")} ${s(l, "accountName")}`;
    const label = `${name}${l["description"] ? ` — ${s(l, "description")}` : ""}`;
    if (type === "PAYROLL")
      return [
        i + 1,
        label,
        amt(Number(l["basic"]) + Number(l["allowances"])),
        amt(l["deductions"]),
        amt(l["recovery"]),
        amt(l["amount"]),
      ];
    if (accounts)
      return [
        i + 1,
        label,
        Number(l["productId"] ? l["amount"] : l["debit"])
          ? amt(l["productId"] ? l["amount"] : l["debit"])
          : "",
        Number(l["credit"]) ? amt(l["credit"]) : "",
      ];
    const unit = Number(l["unitCost"] ?? l["rate"] ?? 0);
    return [
      i + 1,
      label,
      s(l, "qty"),
      ...(stock ? [amt(unit)] : []),
      amt(Math.abs(Number(l["qty"])) * unit || Number(l["amount"])),
    ];
  });
  return (
    <>
      <InfoBox
        left={[
          ["Document No", s(d, "docNo")],
          ["Date", formatDate(s(d, "date"))],
          ["Reference", s(d, "reference") || s(d, "month")],
        ]}
        right={[
          ...(partyName ? ([["Party", partyName]] as [string, ReactNode][]) : []),
          ...(d["issuedTo"]
            ? ([["Issued To", `${s(d, "issuedTo")} · ${s(d, "purpose")}`]] as [string, ReactNode][])
            : []),
          ...(d["condition"] ? ([["Condition", s(d, "condition")]] as [string, ReactNode][]) : []),
          ...(d["reason"] ? ([["Reason", s(d, "reason")]] as [string, ReactNode][]) : []),
        ]}
      />
      <ItemsTable cols={cols} rows={rows} minRows={4} />
      <TotalsPanel
        remarks={s(d, "narration")}
        totals={[
          [
            type === "SMP" || type === "SMR" || stock ? "Value at Cost" : "Total Amount",
            amt(d["total"]),
            true,
          ],
        ]}
        words={type === "PAYROLL" || accounts ? amountInWords(Number(d["total"])) : undefined}
      />
      <Signatures
        boxes={[
          { label: "Prepared By", name: s(d, "createdByName") },
          { label: "Checked By" },
          { label: "Approved By", name: s(d, "approvedByName") },
          { label: stock ? "Store Keeper" : "Received By" },
        ]}
      />
    </>
  );
}
