import { useMemo, useState, type ReactNode } from "react";
import {
  Plus,
  ClipboardList,
  Clock,
  Wallet,
  AlertTriangle,
  Eye,
  Pencil,
  Printer,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DateRangeInputs } from "@/components/shared/Field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useLookups } from "@/lib/lookups";
import { formatDate, formatPKR, formatQty } from "@/lib/format";
import { listDocuments } from "@/server/functions/documents";
import { DOC_DEFS, type DocType, todayISO } from "@/shared/documents";
import type { DocInput } from "@/server/posting/prepare";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentView } from "./DocumentView";

type Row = Record<string, string | number | boolean | null>;
const s = (r: Row, k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));

export type ColKey =
  | "docNo"
  | "date"
  | "party"
  | "reference"
  | "total"
  | "outstanding"
  | "progress"
  | "status"
  | "dueDate"
  | "method"
  | "head"
  | "issuedTo"
  | "purpose"
  | "month"
  | "createdBy"
  | "type"
  | "kind"
  | "reason"
  | "qty"
  | "narration"
  | "condition"
  | "loanType"
  | "paidTo"
  | "fromInvoice"
  | "receivedAs"
  | "billNo";

const COLS: Record<ColKey, Column<Row>> = {
  docNo: {
    key: "docNo",
    header: "Number",
    value: (r) => s(r, "docNo"),
    render: (r) => <span className="font-semibold text-primary">{s(r, "docNo")}</span>,
  },
  date: {
    key: "date",
    header: "Date",
    value: (r) => s(r, "date"),
    render: (r) => <span className="whitespace-nowrap">{formatDate(s(r, "date"))}</span>,
  },
  party: { key: "party", header: "Party", value: (r) => s(r, "partyName") },
  reference: { key: "reference", header: "Reference", value: (r) => s(r, "reference") },
  total: {
    key: "total",
    header: "Amount",
    value: (r) => Number(r["total"] ?? 0),
    render: (r) => (
      <span className="whitespace-nowrap tabular-nums">{formatPKR(Number(r["total"]))}</span>
    ),
    align: "right",
  },
  outstanding: {
    key: "outstanding",
    header: "Outstanding",
    value: (r) => Number(r["outstanding"] ?? 0),
    render: (r) => (
      <span className="whitespace-nowrap tabular-nums">{formatPKR(Number(r["outstanding"]))}</span>
    ),
    align: "right",
  },
  progress: {
    key: "progress",
    header: "Status",
    value: (r) => s(r, "progress"),
    render: (r) => <StatusBadge status={s(r, "progress")} />,
  },
  status: {
    key: "status",
    header: "Approval",
    value: (r) => s(r, "status"),
    render: (r) => <StatusBadge status={s(r, "status")} />,
  },
  dueDate: {
    key: "dueDate",
    header: "Due",
    value: (r) => s(r, "dueDate"),
    render: (r) => <span className="whitespace-nowrap">{formatDate(s(r, "dueDate"))}</span>,
  },
  method: { key: "method", header: "Method", value: (r) => s(r, "method") },
  head: { key: "head", header: "Expense head", value: (r) => s(r, "expenseHead") },
  issuedTo: { key: "issuedTo", header: "Issued to", value: (r) => s(r, "issuedTo") },
  purpose: { key: "purpose", header: "Purpose", value: (r) => s(r, "purpose") },
  month: { key: "month", header: "Month", value: (r) => s(r, "month") },
  createdBy: { key: "createdBy", header: "Entered by", value: (r) => s(r, "createdByName") },
  type: {
    key: "type",
    header: "Type",
    value: (r) => DOC_DEFS[s(r, "type") as DocType]?.label ?? s(r, "type"),
  },
  kind: { key: "kind", header: "Kind", value: (r) => s(r, "kind") },
  reason: { key: "reason", header: "Reason", value: (r) => s(r, "reason") },
  qty: {
    key: "qty",
    header: "Qty",
    value: (r) => Number(r["qty"] ?? 0),
    render: (r) => `${formatQty(Number(r["doneQty"] ?? 0))} / ${formatQty(Number(r["qty"] ?? 0))}`,
    align: "right",
  },
  narration: {
    key: "narration",
    header: "Narration",
    value: (r) => s(r, "narration"),
    render: (r) => <span className="line-clamp-1 max-w-xs">{s(r, "narration")}</span>,
  },
  condition: { key: "condition", header: "Condition", value: (r) => s(r, "condition") },
  loanType: { key: "loanType", header: "Type", value: (r) => s(r, "loanType") },
  paidTo: { key: "paidTo", header: "Paid to", value: (r) => s(r, "paidTo") },
  billNo: { key: "billNo", header: "Bill / inv. no.", value: (r) => s(r, "reference") },
  fromInvoice: { key: "fromInvoice", header: "From invoice", value: (r) => s(r, "fromInvoice") },
  receivedAs: {
    key: "receivedAs",
    header: "Description",
    value: (r) => receiptDescription(r),
  },
};

/** "Cash Received", "Online Received", "Cheque Received # 00154054" — as on the receipts register. */
export function receiptDescription(r: Row) {
  const m = s(r, "method");
  if (m === "Cheque") return `Cheque Received${r["chequeNo"] ? ` # ${s(r, "chequeNo")}` : ""}`;
  if (m === "Online") return "Online Received";
  if (m === "Bank") return "Bank Deposit Received";
  return m ? `${m} Received` : "";
}

export interface DocumentListProps {
  title: string;
  section: string;
  types: DocType[];
  /** Types the "New" button can create (first is the default). */
  create?: DocInput["type"][];
  columns: ColKey[];
  extraHeader?: ReactNode;
  initialFrom?: string;
  /** Dropdown filters on row fields, e.g. [{ key: "expenseHead", label: "Expense heads" }]. */
  filters?: { key: string; label: string }[];
  /** Extra buttons in the page header. */
  headerActions?: ReactNode;
}

export function DocumentListPage({
  title,
  section,
  types,
  create = [],
  columns,
  extraHeader,
  initialFrom,
  filters = [],
  headerActions,
}: DocumentListProps) {
  const { can } = useSession();
  const { data: lk } = useLookups();
  const today = lk?.today ?? todayISO();
  const fyStart =
    lk?.financialYears.find((f) => f.startDate <= today && f.endDate >= today)?.startDate ??
    `${today.slice(0, 4)}-01-01`;
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const from = range?.from ?? initialFrom ?? fyStart;
  const to = range?.to ?? today;
  const [filter, setFilter] = useState("All");
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [newType, setNewType] = useState<DocInput["type"] | null>(null);

  const q = useApi(
    ["documents", types, from, to],
    () => listDocuments({ data: { types, from, to } }),
    { enabled: Boolean(lk) },
  );
  const all = q.data ?? [];
  const statuses = useMemo(
    () => ["All", ...new Set(all.map((r) => s(r, "progress")).filter(Boolean))],
    [all],
  );
  const rows = all.filter(
    (r) =>
      (filter === "All" || s(r, "progress") === filter) &&
      filters.every(
        (f) =>
          !filterValues[f.key] ||
          filterValues[f.key] === "All" ||
          s(r, f.key) === filterValues[f.key],
      ),
  );
  const actionCol: Column<Row> = {
    key: "actions",
    header: "Actions",
    value: () => "",
    render: (r) => {
      const t = s(r, "type") as DocType;
      const editable =
        (r["status"] === "Draft" || r["status"] === "Pending") && can(DOC_DEFS[t].createPerm);
      return (
        <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Review"
            aria-label={`Review ${s(r, "docNo")}`}
            onClick={() => setViewId(s(r, "id"))}
          >
            <Eye className="size-4" />
          </Button>
          {editable && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={r["status"] === "Pending" ? "Edit (returns it to draft)" : "Edit"}
              aria-label={`Edit ${s(r, "docNo")}`}
              onClick={() => setEditId(s(r, "id"))}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Print / PDF"
            aria-label={`Print ${s(r, "docNo")}`}
            onClick={() => window.open(`/print/${s(r, "id")}`, "_blank", "noopener")}
          >
            <Printer className="size-4" />
          </Button>
        </div>
      );
    },
  };
  const creatable = create.filter((t) => can(DOC_DEFS[t].createPerm));
  const active = all.filter((r) => r["status"] !== "Cancelled");
  const totalValue = active
    .filter((r) => r["status"] === "Approved")
    .reduce((sum, r) => sum + Number(r["total"] ?? 0), 0);
  const outstanding = active.reduce((sum, r) => sum + Number(r["outstanding"] ?? 0), 0);
  const pending = active.filter((r) => r["status"] === "Pending" || r["status"] === "Draft").length;
  const overdue = active.filter(
    (r) => r["progress"] === "Overdue" || r["progress"] === "Outstanding",
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        crumbs={["Home", section, ...(section !== title ? [title] : [])]}
        actions={
          <>
            {headerActions}
            {creatable.map((t) => (
              <Button
                key={t}
                onClick={() => setNewType(t)}
                variant={t === creatable[0] ? "default" : "outline"}
              >
                <Plus />
                New {DOC_DEFS[t].label}
              </Button>
            ))}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Documents in period"
          value={String(active.length)}
          icon={ClipboardList}
          tint="blue"
        />
        <KpiCard title="Approved value" value={formatPKR(totalValue)} icon={Wallet} tint="green" />
        <KpiCard
          title="Draft / awaiting approval"
          value={String(pending)}
          icon={Clock}
          tint="orange"
        />
        {columns.includes("outstanding") ? (
          <KpiCard
            title="Outstanding"
            value={formatPKR(outstanding)}
            sub={`${overdue} overdue`}
            subTone={overdue ? "danger" : "muted"}
            icon={AlertTriangle}
            tint="pink"
          />
        ) : columns.includes("issuedTo") ? (
          <KpiCard
            title="Not fully returned"
            value={String(
              active.filter((r) =>
                ["Issued", "Partially Returned", "Outstanding"].includes(s(r, "progress")),
              ).length,
            )}
            sub={`${overdue} past expected return`}
            subTone={overdue ? "danger" : "muted"}
            icon={AlertTriangle}
            tint="pink"
          />
        ) : (
          <KpiCard
            title="Cancelled"
            value={String(all.length - active.length)}
            icon={AlertTriangle}
            tint="pink"
          />
        )}
      </div>
      {extraHeader}
      <section className="card-surface space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <DateRangeInputs
            from={from}
            to={to}
            onChange={(f, t2) => setRange({ from: f, to: t2 })}
          />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((x) => (
                <SelectItem key={x} value={x}>
                  {x === "All" ? "All statuses" : x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.map((f) => (
            <Select
              key={f.key}
              value={filterValues[f.key] ?? "All"}
              onValueChange={(v) => setFilterValues({ ...filterValues, [f.key]: v })}
            >
              <SelectTrigger className="w-52" aria-label={f.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["All", ...[...new Set(all.map((r) => s(r, f.key)).filter(Boolean))].sort()].map(
                  (x) => (
                    <SelectItem key={x} value={x}>
                      {x === "All" ? `All ${f.label.toLowerCase()}` : x}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          ))}
        </div>
        {q.isLoading ? (
          <p className="py-8 text-center text-muted-foreground">Loading…</p>
        ) : (
          <DataTable
            rows={rows}
            exportName={title.toLowerCase().replace(/\W+/g, "-")}
            onRowClick={(r) => setViewId(s(r, "id"))}
            columns={[...columns.map((c) => COLS[c]), actionCol]}
            footer={
              rows.length > 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="py-2 text-right text-sm">
                    Total of {rows.filter((r) => r["status"] !== "Cancelled").length} shown (excl.
                    cancelled):{" "}
                    <b className="tabular-nums">
                      {formatPKR(
                        rows
                          .filter((r) => r["status"] !== "Cancelled")
                          .reduce((x, r) => x + Number(r["total"] ?? 0), 0),
                      )}
                    </b>
                  </td>
                </tr>
              ) : undefined
            }
          />
        )}
      </section>
      {viewId && <DocumentView id={viewId} onClose={() => setViewId(null)} />}
      {editId && <DocumentView id={editId} startEditing onClose={() => setEditId(null)} />}
      {newType && (
        <DocumentEditor
          type={newType}
          onClose={() => setNewType(null)}
          onSaved={(r) => setViewId(r.id)}
        />
      )}
    </div>
  );
}
