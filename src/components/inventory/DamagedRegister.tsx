import { useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangeInputs } from "@/components/shared/Field";
import { useApi } from "@/lib/api";
import { useLookups } from "@/lib/lookups";
import { formatAmount, formatDate, formatPKR, formatQty } from "@/lib/format";
import { damagedRegister } from "@/server/functions/documents";
import { todayISO } from "@/shared/documents";

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

/** Everything that left saleable stock as damaged: write-offs and damaged customer returns. */
export function DamagedRegister() {
  const { data: lk } = useLookups();
  const today = lk?.today ?? todayISO();
  const fyStart =
    lk?.financialYears.find((f) => f.startDate <= today && f.endDate >= today)?.startDate ??
    `${today.slice(0, 4)}-01-01`;
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const from = range?.from ?? fyStart;
  const to = range?.to ?? today;
  const q = useApi(["damaged-register", from, to], () => damagedRegister({ data: { from, to } }), {
    enabled: Boolean(lk),
  });
  const rows = q.data ?? [];
  const qty = rows.reduce((x, r) => x + Number(r["qty"] ?? 0), 0);
  const value = rows.reduce((x, r) => x + Number(r["value"] ?? 0), 0);
  const fromReturns = rows.filter((r) => r["type"] === "SR");
  return (
    <section className="card-surface space-y-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-navy">Damaged stock register</h2>
          <p className="text-xs text-muted-foreground">
            Kept apart from saleable stock: write-offs below, plus books customers returned as
            damaged (from approved sales returns).
          </p>
        </div>
        <DateRangeInputs from={from} to={to} onChange={(f, t2) => setRange({ from: f, to: t2 })} />
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg border bg-muted/30 px-3 py-1.5">
          Damaged qty <b className="text-navy">{formatQty(qty)}</b>
        </span>
        <span className="rounded-lg border bg-muted/30 px-3 py-1.5">
          Value at cost <b className="text-navy">{formatPKR(value)}</b>
        </span>
        <span className="rounded-lg border bg-muted/30 px-3 py-1.5">
          From customer returns{" "}
          <b className="text-navy">
            {formatQty(fromReturns.reduce((x, r) => x + Number(r["qty"] ?? 0), 0))}
          </b>
        </span>
      </div>
      <DataTable
        rows={rows}
        exportName="damaged-stock-register"
        exportTitle="Damaged Stock Register"
        columns={[
          {
            key: "date",
            header: "Date",
            value: (r) => s(r, "date"),
            render: (r) => formatDate(s(r, "date")),
          },
          { key: "docNo", header: "Document", value: (r) => s(r, "docNo") },
          { key: "product", header: "Book / product", value: (r) => s(r, "product") },
          { key: "code", header: "Code", value: (r) => s(r, "code") },
          { key: "source", header: "Source", value: (r) => s(r, "source") },
          { key: "customer", header: "Customer", value: (r) => s(r, "customer") },
          { key: "reason", header: "Reason", value: (r) => s(r, "reason") },
          { key: "qty", header: "Qty", value: (r) => Number(r["qty"]), align: "right" },
          {
            key: "value",
            header: "Value",
            value: (r) => Number(r["value"]),
            render: (r) => formatAmount(Number(r["value"])),
            align: "right",
          },
        ]}
      />
    </section>
  );
}
