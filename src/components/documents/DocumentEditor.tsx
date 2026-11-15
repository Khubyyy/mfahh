import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, SelectField, TextAreaField, TextField } from "@/components/shared/Field";
import { SearchSelect, type Option } from "@/components/shared/SearchSelect";
import { useLookups, type Lookups } from "@/lib/lookups";
import { errorText, useApi } from "@/lib/api";
import { formatAmount, formatDate, formatPKR } from "@/lib/format";
import {
  addDays,
  DOC_DEFS,
  docTotals,
  lineAmount,
  round2,
  ruleDiscount,
  ruleFor,
  type DiscountRule,
  type DocType,
  todayISO,
} from "@/shared/documents";
import {
  openInvoices,
  payrollTemplate,
  saveDocument,
  sourceDocuments,
  unpaidSalaries,
} from "@/server/functions/documents";
import type { DocInput, LineInput } from "@/server/posting/prepare";

type EditableType = DocInput["type"];
type Header = Omit<DocInput, "type" | "lines" | "allocations">;
export interface EditorLine extends LineInput {
  key: string;
  remaining?: number;
  label?: string;
  kind?: "product" | "party" | "account";
}
const key = () => Math.random().toString(36).slice(2);

export interface EditorProps {
  type: EditableType;
  id?: string | null;
  initial?: Partial<DocInput>;
  onClose: () => void;
  onSaved?: (res: { id: string; docNo: string }) => void;
}

const num = (v: string) => (v === "" ? 0 : Number(v));

export function DocumentEditor({ type, id, initial, onClose, onSaved }: EditorProps) {
  const def = DOC_DEFS[type];
  const { data: lk } = useLookups();
  const qc = useQueryClient();
  const today = lk?.today ?? todayISO();
  const [h, setH] = useState<Header>(() => ({
    date: today,
    discount: 0,
    taxPct: 0,
    extra: {},
    // Money is entered by hand and is usually cash; a bank / cheque / online can still be chosen.
    ...(def.money && !id ? { method: "Cash" as const } : {}),
    ...stripType(initial),
  }));
  const [lines, setLines] = useState<EditorLine[]>(() => {
    const given = (initial?.lines ?? []).map((l) => ({ ...l, key: key() }));
    if (given.length) return given;
    // Start with one empty line (two for journals) so the form is ready to type into.
    const blank = { qty: 1, rate: 0, discountPct: 0 };
    if (type === "JV")
      return [
        { key: key(), debit: 0, credit: 0 },
        { key: key(), debit: 0, credit: 0 },
      ];
    if (["SO", "SI", "PI", "SMP", "ADJ", "DMG"].includes(type) && !initial?.refDocId)
      return [{ key: key(), ...blank }];
    return [];
  });
  const [alloc, setAlloc] = useState<Record<string, number>>(() =>
    Object.fromEntries((initial?.allocations ?? []).map((a) => [a.invoiceId, a.amount])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Header>(k: K, v: Header[K]) => setH((x) => ({ ...x, [k]: v }));
  const setExtra = (k: string, v: string | number | null) =>
    setH((x) => ({ ...x, extra: { ...(x.extra ?? {}), [k]: v } }));
  const extra = (k: string) => (h.extra?.[k] ?? "") as string | number;
  const setLine = (k: string, patch: Partial<EditorLine>) =>
    setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  /** Customer discount rules (sales invoices and orders only). */
  const rulesOf = (partyId: string | null | undefined): DiscountRule[] =>
    type === "SI" || type === "SO"
      ? (lk?.discountRules ?? []).filter((r) => r.customerId === partyId)
      : [];
  /** Discount for a book under a customer's rules; `fixed` locks it on the line. */
  const discountFor = (
    partyId: string | null | undefined,
    productId: string | null | undefined,
  ) => {
    const p = lk?.products.find((x) => x.id === productId);
    const rule = ruleFor(rulesOf(partyId), p?.category);
    return { ...ruleDiscount(rule), fixed: rule?.mode === "fixed" };
  };
  const addLine = (l: Partial<EditorLine> = {}) =>
    setLines((ls) => [...ls, { key: key(), qty: 1, rate: 0, discountPct: 0, discountRs: 0, ...l }]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const input = {
        ...h,
        type,
        lines: lines.map(({ key: _k, remaining: _r, label: _l, kind: _kind, ...l }) => l),
        allocations: Object.entries(alloc)
          .filter(([, a]) => a > 0)
          .map(([invoiceId, amount]) => ({ invoiceId, amount })),
      } as DocInput;
      const res = await saveDocument({ data: { id: id ?? null, input } });
      for (const w of res.warnings ?? []) toast.warning(w);
      toast.success(
        def.autoApprove ? `${res.docNo} saved and posted` : `${res.docNo} saved as draft`,
      );
      await qc.invalidateQueries();
      onSaved?.(res);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!lk) return null;
  const products = lk.products.filter((p) => p.status === "Active");
  const productOptions: Option[] = products.map((p) => ({
    value: p.id,
    label: p.name,
    hint: `${p.code} · Stock ${p.stockQty}`,
  }));
  const partyList =
    def.partyType === "customer"
      ? lk.customers
      : def.partyType === "supplier"
        ? lk.suppliers
        : def.partyType === "staff"
          ? lk.staff
          : [];
  const partyOptions: Option[] = partyList
    .filter((p) => p.status === "Active")
    .map((p) => {
      const phone = (p as { phone?: string }).phone;
      return { value: p.id, label: p.name, hint: [p.code, phone].filter(Boolean).join(" · ") };
    });
  const selectedCustomer =
    def.partyType === "customer" ? lk.customers.find((c) => c.id === h.partyId) : undefined;

  const totals = docTotals(
    lines as { qty: number; rate: number; discountPct: number; discountRs?: number }[],
    h.discount ?? 0,
    h.taxPct ?? 0,
  );
  const isInvoiceLike = ["SO", "SI", "PI"].includes(type);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {id ? "Edit" : "New"} {def.label}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {type === "PAYROLL" ? (
              <TextField
                label="Payroll month"
                type="month"
                required
                value={String(extra("month"))}
                onChange={(v) => {
                  setExtra("month", v);
                  if (v) set("date", lastDay(v));
                }}
              />
            ) : (
              <TextField
                label="Date"
                type="date"
                required
                value={h.date}
                onChange={(v) => set("date", v)}
              />
            )}
            {def.partyType && (
              <Field
                label={`${def.partyType === "customer" ? (type.startsWith("SM") ? "Customer / institution" : "Customer") : def.partyType === "supplier" ? "Supplier / vendor" : "Staff member"} *`}
              >
                <SearchSelect
                  options={partyOptions}
                  value={h.partyId}
                  ariaLabel="Party"
                  placeholder={
                    def.partyType === "customer" ? "Search name, code or phone…" : "Select…"
                  }
                  onChange={(v) => {
                    const party = partyList.find((p) => p.id === v) as
                      { creditDays?: number } | undefined;
                    setH((x) => ({
                      ...x,
                      partyId: v,
                      refDocId: ["SR", "PR", "SMR"].includes(type) ? null : x.refDocId,
                      ...(type === "SI" || type === "PI"
                        ? { dueDate: addDays(x.date, party?.creditDays ?? 0) }
                        : {}),
                    }));
                    if (["SR", "PR", "SMR"].includes(type)) setLines([]);
                    if ((type === "SI" || type === "SO") && !h.refDocId) {
                      // Customer discount rules fill every book line for the new customer.
                      setLines((ls) =>
                        ls.map((l) => {
                          if (!l.productId) return l;
                          const d = discountFor(v, l.productId);
                          return { ...l, discountPct: d.discountPct, discountRs: d.discountRs };
                        }),
                      );
                      if (rulesOf(v).some((r) => r.value > 0))
                        toast.info(
                          "Customer discounts applied to the lines. Review before saving.",
                        );
                    }
                    setAlloc({});
                  }}
                />
              </Field>
            )}
            {(type === "SI" || type === "PI") && (
              <TextField
                label="Due date"
                type="date"
                value={h.dueDate ?? ""}
                onChange={(v) => set("dueDate", v)}
              />
            )}
            {type === "PI" && (
              <SelectField
                label="Purchase of"
                required
                value={h.kind ?? ""}
                options={["Books", "Material", "Service"]}
                onChange={(v) => {
                  set("kind", v as Header["kind"]);
                  setLines([{ key: key(), qty: 1, rate: 0, discountPct: 0 }]);
                }}
              />
            )}
            {!["PAYROLL", "SMR", "OB"].includes(type) && (
              <TextField
                label={
                  type === "PI"
                    ? "Supplier invoice no."
                    : type === "ADJ"
                      ? "Reference (count sheet no.)"
                      : type === "EXP"
                        ? "Supporting bill / invoice no."
                        : type === "RV" || type === "PV"
                          ? "Invoice no. (optional)"
                          : "Reference"
                }
                placeholder={type === "EXP" ? "Vendor's bill no., if any" : undefined}
                required={type === "ADJ"}
                value={h.reference ?? ""}
                onChange={(v) => set("reference", v)}
              />
            )}
          </div>

          {selectedCustomer && (
            <p className="-mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                <b className="text-foreground">{selectedCustomer.name}</b> · {selectedCustomer.code}
              </span>
              {selectedCustomer.phone && <span>☎ {selectedCustomer.phone}</span>}
              <span>
                {selectedCustomer.location}
                {selectedCustomer.city && selectedCustomer.city !== selectedCustomer.location
                  ? ` · ${selectedCustomer.city}`
                  : ""}
              </span>
              <span>{selectedCustomer.category}</span>
              {(type === "SI" || type === "SO") &&
                rulesOf(selectedCustomer.id)
                  .filter((r) => r.value > 0)
                  .map((r) => (
                    <span key={r.category} className="font-semibold text-primary">
                      {r.category || "All books"}:{" "}
                      {r.kind === "pct" ? `${r.value}%` : `Rs ${r.value}/item`}
                      {r.mode === "fixed" ? " (fixed)" : ""}
                    </span>
                  ))}
            </p>
          )}

          {/* Source documents for returns and order → invoice */}
          {type === "SI" && h.partyId && !id && (
            <OrderPicker
              partyId={h.partyId}
              value={h.refDocId ?? null}
              onPick={(docId, ls) => {
                set("refDocId", docId);
                setLines(ls.length ? ls : [{ key: key(), qty: 1, rate: 0, discountPct: 0 }]);
              }}
            />
          )}
          {(type === "SR" || type === "PR" || type === "SMR") && h.partyId && (
            <ReturnSource
              type={type}
              partyId={h.partyId}
              value={h.refDocId ?? null}
              onPick={(docId, ls) => {
                set("refDocId", docId);
                setLines(ls);
              }}
            />
          )}

          {/* Money documents */}
          {def.money && (
            <MoneyFields
              h={h}
              set={set}
              lk={lk}
              extraFields={
                type === "LOAN" ? (
                  <>
                    <SelectField
                      label="Type"
                      required
                      value={String(extra("loanType"))}
                      options={["Advance", "Loan"]}
                      onChange={(v) => setExtra("loanType", v)}
                    />
                    <TextField
                      label="Monthly recovery"
                      type="number"
                      required
                      min={0}
                      value={extra("installment")}
                      onChange={(v) => setExtra("installment", num(v))}
                    />
                  </>
                ) : type === "EXP" ? (
                  <Field label="Expense head *">
                    <SearchSelect
                      ariaLabel="Expense head"
                      options={lk.expenseHeads
                        .filter((x) => x.status === "Active")
                        .map((x) => ({ value: x.id, label: x.name }))}
                      value={h.expenseHeadId}
                      onChange={(v) => set("expenseHeadId", v)}
                    />
                  </Field>
                ) : null
              }
              showAmount={type !== "SALPAY"}
              incoming={type === "RV"}
              amountLocked={type === "EXP" && lines.some((l) => (l.rate ?? 0) > 0)}
            />
          )}
          {type === "EXP" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Paid to"
                  value={String(extra("paidTo"))}
                  placeholder="Person or vendor receiving the money"
                  onChange={(v) => setExtra("paidTo", v)}
                />
                <TextField
                  label="Department"
                  value={String(extra("department"))}
                  placeholder="e.g. Accounts, Production, Admin"
                  list="departments"
                  onChange={(v) => setExtra("department", v)}
                />
                <datalist id="departments">
                  {[...new Set(lk.staff.map((x) => x.department).filter(Boolean))].map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <ExpenseItems
                lines={lines}
                setLine={setLine}
                addLine={() => addLine({ qty: 1, rate: 0, description: "" })}
                remove={(k) => setLines((ls) => ls.filter((l) => l.key !== k))}
                onTotal={(t2) => set("amount", t2)}
              />
            </>
          )}

          {type === "SMP" && (
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                label="Issued to (person)"
                required
                value={String(extra("issuedTo"))}
                onChange={(v) => setExtra("issuedTo", v)}
              />
              <TextField
                label="Purpose"
                required
                value={String(extra("purpose"))}
                onChange={(v) => setExtra("purpose", v)}
                placeholder="e.g. adoption for 2026 session"
              />
              <TextField
                label="Expected return"
                type="date"
                value={String(extra("expectedReturn"))}
                onChange={(v) => setExtra("expectedReturn", v)}
              />
            </div>
          )}
          {type === "DMG" && (
            <SelectField
              label="Condition"
              required
              className="max-w-xs"
              value={String(extra("condition"))}
              options={["Damaged", "Defective", "Obsolete", "Written-off"]}
              onChange={(v) => setExtra("condition", v)}
            />
          )}
          {["SR", "PR", "ADJ", "DMG"].includes(type) && (
            <TextField
              label="Reason"
              required
              value={String(extra("reason"))}
              onChange={(v) => setExtra("reason", v)}
            />
          )}

          {/* Line grids */}
          {(["SO", "SI", "SMP"].includes(type) || (type === "PI" && h.kind === "Books")) && (
            <ProductLines
              lines={lines}
              setLine={setLine}
              addLine={addLine}
              remove={(k) => setLines((ls) => ls.filter((l) => l.key !== k))}
              options={productOptions}
              products={products}
              priced={type !== "SMP"}
              costBased={type === "PI"}
              fromOrder={Boolean(h.refDocId)}
              discountFor={
                type === "SI" || type === "SO"
                  ? (productId: string) => discountFor(h.partyId, productId)
                  : undefined
              }
            />
          )}
          {type === "PI" && (h.kind === "Material" || h.kind === "Service") && (
            <AccountLines
              lines={lines}
              setLine={setLine}
              addLine={addLine}
              remove={(k) => setLines((ls) => ls.filter((l) => l.key !== k))}
              lk={lk}
            />
          )}
          {(type === "SR" || type === "PR" || type === "SMR") && h.refDocId && (
            <ReturnLines
              lines={lines}
              setLine={setLine}
              priced={type !== "SMR"}
              withCondition={type === "SR"}
            />
          )}
          {(type === "ADJ" || type === "DMG") && (
            <StockLines
              type={type}
              lines={lines}
              setLine={setLine}
              addLine={addLine}
              remove={(k) => setLines((ls) => ls.filter((l) => l.key !== k))}
              options={productOptions}
              products={products}
            />
          )}
          {type === "JV" && (
            <JournalLines
              lines={lines}
              setLine={setLine}
              addLine={addLine}
              remove={(k) => setLines((ls) => ls.filter((l) => l.key !== k))}
              lk={lk}
            />
          )}
          {type === "OB" && (
            <OpeningLines
              lines={lines}
              setLine={setLine}
              addLine={addLine}
              remove={(k) => setLines((ls) => ls.filter((l) => l.key !== k))}
              lk={lk}
              options={productOptions}
            />
          )}
          {type === "PAYROLL" && (
            <PayrollLines month={String(extra("month"))} lines={lines} setLines={setLines} />
          )}
          {type === "SALPAY" && <SalaryLines h={h} set={set} lines={lines} setLines={setLines} />}

          {/* Totals */}
          {(isInvoiceLike || type === "SR" || type === "PR") && (
            <div className="ml-auto grid max-w-sm gap-2 text-sm">
              {isInvoiceLike && (
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    label="Document discount (Rs)"
                    type="number"
                    min={0}
                    value={h.discount ?? 0}
                    onChange={(v) => set("discount", num(v))}
                  />
                  <TextField
                    label="Sales tax %"
                    type="number"
                    min={0}
                    step="0.01"
                    value={h.taxPct ?? 0}
                    onChange={(v) => set("taxPct", num(v))}
                  />
                </div>
              )}
              <Totals
                rows={[
                  ["Subtotal", totals.subtotal],
                  ...(isInvoiceLike
                    ? ([
                        ["Discount", -(h.discount ?? 0)],
                        ["Tax", totals.taxAmount],
                      ] as [string, number][])
                    : []),
                  ["Total", isInvoiceLike ? totals.total : totals.subtotal],
                ]}
              />
              {(type === "SR" || type === "PR") && (
                <p className="text-xs text-muted-foreground">
                  Discount and tax are applied in the same proportion as the original invoice.
                </p>
              )}
            </div>
          )}

          {(type === "RV" || type === "PV") && h.partyId && (
            <Allocations
              type={type === "RV" ? "SI" : "PI"}
              partyId={h.partyId}
              amount={h.amount ?? 0}
              alloc={alloc}
              setAlloc={setAlloc}
            />
          )}

          <TextAreaField
            label={type === "EXP" ? "Remarks" : type === "JV" ? "Narration" : "Remarks"}
            required={(type === "EXP" && !lines.some((l) => (l.rate ?? 0) > 0)) || type === "JV"}
            value={h.narration ?? ""}
            onChange={(v) => set("narration", v)}
          />

          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : def.autoApprove ? "Save & post" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function stripType(initial?: Partial<DocInput>): Partial<Header> {
  if (!initial) return {};
  const { type: _t, lines: _l, allocations: _a, ...rest } = initial;
  return rest;
}

function lastDay(month: string) {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
}

function Totals({ rows }: { rows: [string, number][] }) {
  return (
    <dl className="rounded-lg border bg-muted/40 p-3">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={`flex justify-between py-0.5 ${i === rows.length - 1 ? "mt-1 border-t pt-2 text-base font-bold text-navy" : ""}`}
        >
          <dt>{k}</dt>
          <dd className="tabular-nums">{formatPKR(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {action}
      </div>
      <div className="overflow-x-auto rounded-lg border">{children}</div>
    </section>
  );
}

const th = "px-2 py-2 text-left text-xs font-semibold text-muted-foreground";
const td = "px-2 py-1.5 align-top";

function MoneyFields({
  h,
  set,
  lk,
  extraFields,
  showAmount,
  incoming,
  amountLocked,
}: {
  h: Header;
  set: <K extends keyof Header>(k: K, v: Header[K]) => void;
  lk: Lookups;
  extraFields: ReactNode;
  showAmount: boolean;
  incoming?: boolean;
  amountLocked?: boolean;
}) {
  const banks = lk.bankAccounts.filter((b) => b.status === "Active");
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {showAmount && (
        <TextField
          label={amountLocked ? "Amount (Rs) — sum of items" : "Amount (Rs)"}
          type="number"
          required
          min={0}
          step="0.01"
          disabled={amountLocked}
          value={h.amount ?? ""}
          onChange={(v) => set("amount", num(v))}
        />
      )}
      <SelectField
        label={incoming ? "Received by" : "Paid by"}
        required
        value={h.method ?? ""}
        options={[
          { value: "Cash", label: "Cash" },
          { value: "Online", label: "Online transfer" },
          { value: "Cheque", label: "Cheque" },
          { value: "Bank", label: "Bank deposit" },
        ]}
        onChange={(v) => {
          set("method", v as Header["method"]);
          if (v !== "Cash" && !h.bankAccountId && banks.length === 1)
            set("bankAccountId", banks[0]!.id);
        }}
      />
      <Field label={`${incoming ? "Received into" : "Paid from"} *`}>
        <SearchSelect
          ariaLabel={incoming ? "Received into" : "Paid from"}
          options={[
            ...(h.method === "Cash" || !h.method ? [{ value: "cash", label: "Cash in hand" }] : []),
            ...(h.method && h.method !== "Cash"
              ? banks.map((b) => ({ value: b.id, label: b.name, hint: b.accountNo }))
              : []),
          ]}
          value={h.method === "Cash" ? "cash" : h.bankAccountId}
          disabled={!h.method}
          placeholder={h.method ? "Select…" : "Choose the method first"}
          onChange={(v) => {
            if (v === "cash") {
              set("method", "Cash");
              set("bankAccountId", null);
            } else set("bankAccountId", v);
          }}
        />
        {h.method && h.method !== "Cash" && !banks.length && (
          <p className="mt-1 text-[11px] text-destructive">
            Add your bank account (e.g. Turnkey Publishers) under Accounts → Bank Accounts first.
          </p>
        )}
      </Field>
      {h.method === "Cheque" && (
        <TextField
          label="Cheque no."
          required
          value={h.chequeNo ?? ""}
          onChange={(v) => set("chequeNo", v)}
        />
      )}
      {extraFields}
    </div>
  );
}

/** Itemised expense voucher (#, description, amount); optional — leave empty for a single amount. */
function ExpenseItems({
  lines,
  setLine,
  addLine,
  remove,
  onTotal,
}: {
  lines: EditorLine[];
  setLine: (k: string, p: Partial<EditorLine>) => void;
  addLine: () => void;
  remove: (k: string) => void;
  onTotal: (total: number) => void;
}) {
  const total = round2(lines.reduce((x, l) => x + (l.rate ?? 0), 0));
  useEffect(() => {
    if (lines.some((l) => (l.rate ?? 0) > 0)) onTotal(total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  return (
    <Section
      title="Expense details (optional)"
      action={
        <Button type="button" size="sm" variant="outline" onClick={addLine}>
          <Plus />
          Add item
        </Button>
      }
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={`${th} w-10`}>#</th>
            <th className={th}>Description</th>
            <th className={`${th} w-40 text-right`}>Amount (PKR)</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key} className="border-t">
              <td className={`${td} pt-3`}>{i + 1}</td>
              <td className={td}>
                <Input
                  aria-label={`Item ${i + 1} description`}
                  value={l.description ?? ""}
                  onChange={(e) => setLine(l.key, { description: e.target.value })}
                />
              </td>
              <td className={td}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="text-right"
                  aria-label={`Item ${i + 1} amount`}
                  value={l.rate || ""}
                  onChange={(e) => setLine(l.key, { rate: num(e.target.value), qty: 1 })}
                />
              </td>
              <td className={td}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove item"
                  onClick={() => remove(l.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </td>
            </tr>
          ))}
          {!lines.length && (
            <tr>
              <td colSpan={4} className="p-3 text-center text-xs text-muted-foreground">
                One amount is enough for a simple expense. Add items to break it down on the
                voucher.
              </td>
            </tr>
          )}
          {lines.length > 0 && (
            <tr className="border-t font-semibold">
              <td />
              <td className={`${td} text-right`}>Total</td>
              <td className={`${td} text-right tabular-nums`}>{formatAmount(total)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function ProductLines({
  lines,
  setLine,
  addLine,
  remove,
  options,
  products,
  priced,
  costBased,
  fromOrder,
  discountFor,
}: {
  lines: EditorLine[];
  setLine: (k: string, p: Partial<EditorLine>) => void;
  addLine: () => void;
  remove: (k: string) => void;
  options: Option[];
  products: Lookups["products"];
  priced: boolean;
  costBased: boolean;
  fromOrder: boolean;
  /** Sales: the customer's discount for a book (fixed = locked). */
  discountFor?: (productId: string) => { discountPct: number; discountRs: number; fixed: boolean };
}) {
  return (
    <Section
      title="Books / products"
      action={
        !fromOrder && (
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus />
            Add line
          </Button>
        )
      }
    >
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Book</th>
            <th className={`${th} w-24`}>Qty</th>
            {priced && (
              <>
                <th className={`${th} w-28`}>Rate</th>
                {discountFor && <th className={`${th} w-24`}>Disc Rs/item</th>}
                <th className={`${th} w-24`}>Disc %</th>
                <th className={`${th} w-32 text-right`}>Amount</th>
              </>
            )}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const p = products.find((x) => x.id === l.productId);
            const locked = Boolean(l.productId && discountFor?.(l.productId).fixed);
            return (
              <tr key={l.key} className="border-t">
                <td className={td}>
                  {fromOrder ? (
                    <span className="font-medium">{l.label}</span>
                  ) : (
                    <SearchSelect
                      options={options}
                      value={l.productId}
                      ariaLabel="Book"
                      onChange={(v) => {
                        const prod = products.find((x) => x.id === v);
                        const d = discountFor?.(v);
                        setLine(l.key, {
                          productId: v,
                          rate: costBased ? (prod?.costPrice ?? 0) : (prod?.salePrice ?? 0),
                          ...(d ? { discountPct: d.discountPct, discountRs: d.discountRs } : {}),
                        });
                      }}
                    />
                  )}
                  {p && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      In stock: {p.stockQty}
                      {l.remaining !== undefined ? ` · remaining on order: ${l.remaining}` : ""}
                    </p>
                  )}
                </td>
                <td className={td}>
                  <Input
                    type="number"
                    min={1}
                    max={l.remaining}
                    aria-label="Quantity"
                    value={l.qty ?? ""}
                    onChange={(e) => setLine(l.key, { qty: Math.trunc(num(e.target.value)) })}
                  />
                </td>
                {priced && (
                  <>
                    <td className={td}>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        aria-label="Rate"
                        value={l.rate ?? ""}
                        onChange={(e) => setLine(l.key, { rate: num(e.target.value) })}
                      />
                    </td>
                    {discountFor && (
                      <td className={td}>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          aria-label="Discount Rs per item"
                          disabled={locked}
                          value={l.discountRs || ""}
                          placeholder="0"
                          onChange={(e) => setLine(l.key, { discountRs: num(e.target.value) })}
                        />
                      </td>
                    )}
                    <td className={td}>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        aria-label="Discount %"
                        disabled={locked}
                        title={locked ? "Fixed customer discount" : undefined}
                        value={l.discountPct ?? ""}
                        onChange={(e) => setLine(l.key, { discountPct: num(e.target.value) })}
                      />
                      {locked && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Fixed rule</p>
                      )}
                    </td>
                    <td className={`${td} pt-3 text-right tabular-nums`}>
                      {formatAmount(lineAmount(l))}
                    </td>
                  </>
                )}
                <td className={td}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove line"
                    onClick={() => remove(l.key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function AccountLines({
  lines,
  setLine,
  addLine,
  remove,
  lk,
}: {
  lines: EditorLine[];
  setLine: (k: string, p: Partial<EditorLine>) => void;
  addLine: () => void;
  remove: (k: string) => void;
  lk: Lookups;
}) {
  const accounts = lk.accounts.filter(
    (a) =>
      !a.isGroup &&
      a.status === "Active" &&
      (a.type === "Expense" || a.type === "Asset") &&
      !["AR", "AP", "INVENTORY", "CASH"].includes(a.systemKey ?? ""),
  );
  return (
    <Section
      title="Items / services"
      action={
        <Button type="button" size="sm" variant="outline" onClick={addLine}>
          <Plus />
          Add line
        </Button>
      }
    >
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Charge to account</th>
            <th className={th}>Description</th>
            <th className={`${th} w-20`}>Qty</th>
            <th className={`${th} w-28`}>Rate</th>
            <th className={`${th} w-20`}>Disc %</th>
            <th className={`${th} w-28 text-right`}>Amount</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-t">
              <td className={`${td} w-64`}>
                <SearchSelect
                  options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
                  value={l.accountId}
                  onChange={(v) => setLine(l.key, { accountId: v })}
                  ariaLabel="Account"
                />
              </td>
              <td className={td}>
                <Input
                  aria-label="Description"
                  value={l.description ?? ""}
                  onChange={(e) => setLine(l.key, { description: e.target.value })}
                  placeholder="e.g. 80gsm paper, 20 reams"
                />
              </td>
              <td className={td}>
                <Input
                  type="number"
                  min={1}
                  aria-label="Quantity"
                  value={l.qty ?? ""}
                  onChange={(e) => setLine(l.key, { qty: Math.trunc(num(e.target.value)) })}
                />
              </td>
              <td className={td}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Rate"
                  value={l.rate ?? ""}
                  onChange={(e) => setLine(l.key, { rate: num(e.target.value) })}
                />
              </td>
              <td className={td}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  aria-label="Discount %"
                  value={l.discountPct ?? ""}
                  onChange={(e) => setLine(l.key, { discountPct: num(e.target.value) })}
                />
              </td>
              <td className={`${td} pt-3 text-right tabular-nums`}>
                {formatAmount(lineAmount(l))}
              </td>
              <td className={td}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove line"
                  onClick={() => remove(l.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function ReturnLines({
  lines,
  setLine,
  priced,
  withCondition,
}: {
  lines: EditorLine[];
  setLine: (k: string, p: Partial<EditorLine>) => void;
  priced: boolean;
  withCondition?: boolean;
}) {
  return (
    <Section title="Quantities returned">
      {withCondition && (
        <p className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Mark each returned book as <b>Saleable</b> (goes back into stock) or <b>Damaged</b>{" "}
          (customer is credited, but the books go to the Damaged Stock register, not saleable
          stock).
        </p>
      )}
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Item</th>
            <th className={`${th} w-28`}>Can return</th>
            <th className={`${th} w-28`}>Return qty</th>
            {withCondition && <th className={`${th} w-36`}>Condition</th>}
            {priced && (
              <>
                <th className={`${th} w-28`}>Rate</th>
                <th className={`${th} w-28 text-right`}>Amount</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-t">
              <td className={`${td} pt-3`}>{l.label}</td>
              <td className={`${td} pt-3`}>{l.remaining}</td>
              <td className={td}>
                <Input
                  type="number"
                  min={0}
                  max={l.remaining}
                  aria-label="Return quantity"
                  value={l.qty ?? 0}
                  onChange={(e) =>
                    setLine(l.key, {
                      qty: Math.min(l.remaining ?? 0, Math.max(0, Math.trunc(num(e.target.value)))),
                    })
                  }
                />
              </td>
              {withCondition && (
                <td className={td}>
                  <select
                    aria-label="Condition"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={String(l.extra?.["condition"] ?? "Saleable")}
                    onChange={(e) =>
                      setLine(l.key, { extra: { ...(l.extra ?? {}), condition: e.target.value } })
                    }
                  >
                    <option>Saleable</option>
                    <option>Damaged</option>
                  </select>
                </td>
              )}
              {priced && (
                <>
                  <td className={`${td} pt-3 tabular-nums`}>
                    {formatAmount(l.rate)}
                    {l.discountRs ? ` less Rs ${l.discountRs}` : ""}
                    {l.discountPct ? ` less ${l.discountPct}%` : ""}
                  </td>
                  <td className={`${td} pt-3 text-right tabular-nums`}>
                    {formatAmount(lineAmount(l))}
                  </td>
                </>
              )}
            </tr>
          ))}
          {!lines.length && (
            <tr>
              <td colSpan={5} className="p-4 text-center text-muted-foreground">
                Nothing left to return on this document.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function StockLines({
  type,
  lines,
  setLine,
  addLine,
  remove,
  options,
  products,
}: {
  type: "ADJ" | "DMG";
  lines: EditorLine[];
  setLine: (k: string, p: Partial<EditorLine>) => void;
  addLine: () => void;
  remove: (k: string) => void;
  options: Option[];
  products: Lookups["products"];
}) {
  return (
    <Section
      title={
        type === "ADJ"
          ? "Adjust quantities (+ to add, − to remove)"
          : "Damaged / written-off quantities"
      }
      action={
        <Button type="button" size="sm" variant="outline" onClick={addLine}>
          <Plus />
          Add line
        </Button>
      }
    >
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Book</th>
            <th className={`${th} w-28`}>In stock</th>
            <th className={`${th} w-28`}>Quantity</th>
            {type === "ADJ" && <th className={`${th} w-36`}>Unit cost (for +)</th>}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const p = products.find((x) => x.id === l.productId);
            return (
              <tr key={l.key} className="border-t">
                <td className={td}>
                  <SearchSelect
                    options={options}
                    value={l.productId}
                    onChange={(v) => setLine(l.key, { productId: v })}
                    ariaLabel="Book"
                  />
                </td>
                <td className={`${td} pt-3`}>{p?.stockQty ?? "—"}</td>
                <td className={td}>
                  <Input
                    type="number"
                    aria-label="Quantity"
                    value={l.qty ?? ""}
                    onChange={(e) => setLine(l.key, { qty: Math.trunc(num(e.target.value)) })}
                  />
                </td>
                {type === "ADJ" && (
                  <td className={td}>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label="Unit cost"
                      placeholder={p ? `avg ${formatAmount(p.avgCost)}` : ""}
                      value={l.rate || ""}
                      onChange={(e) => setLine(l.key, { rate: num(e.target.value) })}
                      disabled={(l.qty ?? 0) < 0}
                    />
                  </td>
                )}
                <td className={td}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove line"
                    onClick={() => remove(l.key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

function partyPicker(lk: Lookups, type: string | null | undefined): Option[] {
  const list =
    type === "customer"
      ? lk.customers
      : type === "supplier"
        ? lk.suppliers
        : type === "staff"
          ? lk.staff
          : [];
  return list.map((p) => ({ value: p.id, label: p.name, hint: p.code }));
}

function JournalLines({
  lines,
  setLine,
  addLine,
  remove,
  lk,
}: {
  lines: EditorLine[];
  setLine: (k: string, p: Partial<EditorLine>) => void;
  addLine: (l?: Partial<EditorLine>) => void;
  remove: (k: string) => void;
  lk: Lookups;
}) {
  const accounts = lk.accounts
    .filter((a) => !a.isGroup && a.status === "Active")
    .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const dr = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0)),
    cr = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  return (
    <Section
      title="Journal lines"
      action={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => addLine({ debit: 0, credit: 0 })}
        >
          <Plus />
          Add line
        </Button>
      }
    >
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Account</th>
            <th className={`${th} w-32`}>Party type</th>
            <th className={`${th} w-48`}>Party</th>
            <th className={th}>Line note</th>
            <th className={`${th} w-32`}>Debit</th>
            <th className={`${th} w-32`}>Credit</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-t">
              <td className={`${td} w-64`}>
                <SearchSelect
                  options={accounts}
                  value={l.accountId}
                  onChange={(v) => setLine(l.key, { accountId: v })}
                  ariaLabel="Account"
                />
              </td>
              <td className={td}>
                <select
                  aria-label="Party type"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={l.partyType ?? ""}
                  onChange={(e) =>
                    setLine(l.key, {
                      partyType: (e.target.value || null) as EditorLine["partyType"],
                      partyId: null,
                    })
                  }
                >
                  <option value="">—</option>
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                  <option value="staff">Staff</option>
                </select>
              </td>
              <td className={td}>
                {l.partyType ? (
                  <SearchSelect
                    options={partyPicker(lk, l.partyType)}
                    value={l.partyId}
                    onChange={(v) => setLine(l.key, { partyId: v })}
                    ariaLabel="Party"
                  />
                ) : null}
              </td>
              <td className={td}>
                <Input
                  aria-label="Line note"
                  value={l.description ?? ""}
                  onChange={(e) => setLine(l.key, { description: e.target.value })}
                />
              </td>
              <td className={td}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Debit"
                  value={l.debit || ""}
                  onChange={(e) => setLine(l.key, { debit: num(e.target.value), credit: 0 })}
                />
              </td>
              <td className={td}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Credit"
                  value={l.credit || ""}
                  onChange={(e) => setLine(l.key, { credit: num(e.target.value), debit: 0 })}
                />
              </td>
              <td className={td}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove line"
                  onClick={() => remove(l.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </td>
            </tr>
          ))}
          <tr className={`border-t font-semibold ${dr === cr ? "" : "text-destructive"}`}>
            <td colSpan={4} className="px-2 py-2 text-right">
              {dr === cr ? "Balanced" : `Difference ${formatAmount(dr - cr)}`}
            </td>
            <td className="px-2 tabular-nums">{formatAmount(dr)}</td>
            <td className="px-2 tabular-nums">{formatAmount(cr)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

function OpeningLines({
  lines,
  setLine,
  addLine,
  remove,
  lk,
  options,
}: {
  lines: EditorLine[];
  setLine: (k: string, p: Partial<EditorLine>) => void;
  addLine: (l?: Partial<EditorLine>) => void;
  remove: (k: string) => void;
  lk: Lookups;
  options: Option[];
}) {
  const accounts = lk.accounts
    .filter(
      (a) =>
        !a.isGroup &&
        a.status === "Active" &&
        !["AR", "AP", "INVENTORY", "STAFF_ADV", "OPENING"].includes(a.systemKey ?? ""),
    )
    .map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  const kindOf = (l: EditorLine) =>
    l.kind ?? (l.productId ? "product" : l.partyType ? "party" : "account");
  return (
    <Section
      title="Opening balances (the difference goes to Opening Balance Equity)"
      action={
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => addLine({ kind: "product", qty: 0, rate: 0 })}
          >
            <Plus />
            Stock
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              addLine({ kind: "party", partyType: "customer", debit: 0, credit: 0, qty: 0 })
            }
          >
            <Plus />
            Party
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => addLine({ kind: "account", debit: 0, credit: 0, qty: 0 })}
          >
            <Plus />
            Account
          </Button>
        </div>
      }
    >
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={`${th} w-28`}>Kind</th>
            <th className={th}>Item</th>
            <th className={`${th} w-28`}>Qty</th>
            <th className={`${th} w-32`}>Cost / Debit</th>
            <th className={`${th} w-32`}>Credit</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const kind = kindOf(l);
            return (
              <tr key={l.key} className="border-t">
                <td className={`${td} pt-3 capitalize`}>
                  {kind === "party" ? (
                    <select
                      aria-label="Party type"
                      className="h-9 w-full rounded-md border bg-background px-1 text-sm"
                      value={l.partyType ?? "customer"}
                      onChange={(e) =>
                        setLine(l.key, {
                          partyType: e.target.value as EditorLine["partyType"],
                          partyId: null,
                        })
                      }
                    >
                      <option value="customer">Customer</option>
                      <option value="supplier">Supplier</option>
                      <option value="staff">Staff advance</option>
                    </select>
                  ) : kind === "product" ? (
                    "Stock"
                  ) : (
                    "Account"
                  )}
                </td>
                <td className={td}>
                  {kind === "product" && (
                    <SearchSelect
                      options={options}
                      value={l.productId}
                      onChange={(v) => setLine(l.key, { productId: v })}
                      ariaLabel="Book"
                    />
                  )}
                  {kind === "party" && (
                    <SearchSelect
                      options={partyPicker(lk, l.partyType ?? "customer")}
                      value={l.partyId}
                      onChange={(v) =>
                        setLine(l.key, { partyId: v, partyType: l.partyType ?? "customer" })
                      }
                      ariaLabel="Party"
                    />
                  )}
                  {kind === "account" && (
                    <SearchSelect
                      options={accounts}
                      value={l.accountId}
                      onChange={(v) => setLine(l.key, { accountId: v })}
                      ariaLabel="Account"
                    />
                  )}
                </td>
                <td className={td}>
                  {kind === "product" && (
                    <Input
                      type="number"
                      min={0}
                      aria-label="Quantity"
                      value={l.qty || ""}
                      onChange={(e) => setLine(l.key, { qty: Math.trunc(num(e.target.value)) })}
                    />
                  )}
                </td>
                <td className={td}>
                  {kind === "product" ? (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label="Unit cost"
                      value={l.rate || ""}
                      onChange={(e) => setLine(l.key, { rate: num(e.target.value) })}
                    />
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label="Debit"
                      value={l.debit || ""}
                      onChange={(e) => setLine(l.key, { debit: num(e.target.value), credit: 0 })}
                    />
                  )}
                </td>
                <td className={td}>
                  {kind !== "product" && (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label="Credit"
                      value={l.credit || ""}
                      onChange={(e) => setLine(l.key, { credit: num(e.target.value), debit: 0 })}
                    />
                  )}
                </td>
                <td className={td}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove line"
                    onClick={() => remove(l.key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
          {!lines.length && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-muted-foreground">
                Add opening stock, customer/supplier balances, cash, bank and other account
                balances. Customers owing you = Debit; suppliers you owe = Credit.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function PayrollLines({
  month,
  lines,
  setLines,
}: {
  month: string;
  lines: EditorLine[];
  setLines: (ls: EditorLine[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!month) {
      toast.error("Choose the payroll month first.");
      return;
    }
    setLoading(true);
    try {
      const t = await payrollTemplate({ data: { month } });
      setLines(
        t.lines.map((r) => ({
          key: key(),
          partyType: "staff",
          partyId: String(r["staffId"]),
          label: `${String(r["empId"])} · ${String(r["name"])}`,
          extra: {
            basic: Number(r["basic"]),
            allowances: Number(r["allowances"]),
            deductions: Number(r["deductions"]),
            recovery: Number(r["recovery"]),
            absentDays: Number(r["absentDays"]),
          },
        })),
      );
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setLoading(false);
    }
  };
  const upd = (k: string, f: string, v: number) =>
    setLines(lines.map((l) => (l.key === k ? { ...l, extra: { ...l.extra, [f]: v } } : l)));
  const net = (l: EditorLine) =>
    round2(
      ["basic", "allowances"].reduce((s, f) => s + Number(l.extra?.[f] ?? 0), 0) -
        Number(l.extra?.["deductions"] ?? 0) -
        Number(l.extra?.["recovery"] ?? 0),
    );
  return (
    <Section
      title="Payroll register"
      action={
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={load}>
          <Wand2 />
          Load active staff
        </Button>
      }
    >
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Employee</th>
            {["Basic", "Allowances", "Deductions", "Advance recovery"].map((x) => (
              <th key={x} className={`${th} w-32`}>
                {x}
              </th>
            ))}
            <th className={`${th} w-32 text-right`}>Net pay</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-t">
              <td className={`${td} pt-3`}>
                {l.label ?? l.partyId}
                {Number(l.extra?.["absentDays"] ?? 0) > 0 && (
                  <span className="ml-1 text-[11px] text-warning">
                    ({String(l.extra?.["absentDays"])} absent)
                  </span>
                )}
              </td>
              {["basic", "allowances", "deductions", "recovery"].map((f) => (
                <td key={f} className={td}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label={f}
                    value={Number(l.extra?.[f] ?? 0)}
                    onChange={(e) => upd(l.key, f, num(e.target.value))}
                  />
                </td>
              ))}
              <td className={`${td} pt-3 text-right font-semibold tabular-nums`}>
                {formatAmount(net(l))}
              </td>
              <td className={td}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove"
                  onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </td>
            </tr>
          ))}
          {lines.length > 0 && (
            <tr className="border-t font-bold">
              <td className="px-2 py-2" colSpan={5}>
                Total net pay
              </td>
              <td className="px-2 text-right tabular-nums">
                {formatAmount(lines.reduce((s, l) => s + net(l), 0))}
              </td>
              <td />
            </tr>
          )}
          {!lines.length && (
            <tr>
              <td colSpan={7} className="p-4 text-center text-muted-foreground">
                Choose the month and load active staff.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function SalaryLines({
  h,
  set,
  lines,
  setLines,
}: {
  h: Header;
  set: <K extends keyof Header>(k: K, v: Header[K]) => void;
  lines: EditorLine[];
  setLines: (ls: EditorLine[]) => void;
}) {
  const payrolls = useApi(["source", "PAYROLL"], () =>
    sourceDocuments({ data: { type: "PAYROLL" } }),
  );
  const unpaid = useApi(["unpaid-salaries"], () => unpaidSalaries());
  useEffect(() => {
    if (unpaid.data && !lines.length) {
      setLines(
        unpaid.data.map((r) => ({
          key: key(),
          partyType: "staff",
          partyId: String(r["staffId"]),
          label: `${String(r["empId"])} · ${String(r["name"])}`,
          remaining: Number(r["balance"]),
          rate: Number(r["balance"]),
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unpaid.data]);
  return (
    <div className="space-y-3">
      <SelectField
        label="Payroll"
        required
        className="max-w-sm"
        value={h.refDocId ?? ""}
        onChange={(v) => set("refDocId", v)}
        options={(payrolls.data?.docs ?? []).map((d) => ({
          value: String(d["id"]),
          label: `${String(d["docNo"])} · ${String(d["month"] ?? "")}`,
        }))}
      />
      <Section title="Unpaid salaries">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Employee</th>
              <th className={`${th} w-36`}>Unpaid</th>
              <th className={`${th} w-40`}>Pay now</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-t">
                <td className={`${td} pt-3`}>{l.label}</td>
                <td className={`${td} pt-3 tabular-nums`}>{formatAmount(l.remaining)}</td>
                <td className={td}>
                  <Input
                    type="number"
                    min={0}
                    max={l.remaining}
                    step="0.01"
                    aria-label="Pay now"
                    value={l.rate ?? 0}
                    onChange={(e) =>
                      setLines(
                        lines.map((x) =>
                          x.key === l.key
                            ? { ...x, rate: Math.min(l.remaining ?? 0, num(e.target.value)) }
                            : x,
                        ),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-muted-foreground">
                  No unpaid salaries.
                </td>
              </tr>
            )}
            {lines.length > 0 && (
              <tr className="border-t font-bold">
                <td className="px-2 py-2" colSpan={2}>
                  Total
                </td>
                <td className="px-2 tabular-nums">
                  {formatAmount(lines.reduce((s, l) => s + (l.rate ?? 0), 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function OrderPicker({
  partyId,
  value,
  onPick,
}: {
  partyId: string;
  value: string | null;
  onPick: (docId: string | null, lines: EditorLine[]) => void;
}) {
  const src = useApi(["source", "SO", partyId], () =>
    sourceDocuments({ data: { type: "SO", partyId } }),
  );
  const docs = src.data?.docs ?? [];
  if (!docs.length) return null;
  return (
    <SelectField
      label="Deliver against sales order (optional)"
      className="max-w-md"
      value={value ?? "none"}
      options={[
        { value: "none", label: "— No order —" },
        ...docs.map((d) => ({
          value: String(d["id"]),
          label: `${String(d["docNo"])} · ${formatDate(String(d["date"]))}`,
        })),
      ]}
      onChange={(v) => {
        if (v === "none") return onPick(null, []);
        const ls = (src.data?.lines ?? []).filter(
          (l) => l["documentId"] === v && Number(l["remaining"]) > 0,
        );
        onPick(
          v,
          ls.map((l) => ({
            key: key(),
            productId: String(l["productId"]),
            refLineId: String(l["id"]),
            label: String(l["product"]),
            qty: Number(l["remaining"]),
            remaining: Number(l["remaining"]),
            rate: Number(l["rate"]),
            discountPct: Number(l["discountPct"]),
            discountRs: Number(l["discountRs"] ?? 0),
          })),
        );
      }}
    />
  );
}

function ReturnSource({
  type,
  partyId,
  value,
  onPick,
}: {
  type: "SR" | "PR" | "SMR";
  partyId: string;
  value: string | null;
  onPick: (docId: string, lines: EditorLine[]) => void;
}) {
  const srcType = type === "SR" ? "SI" : type === "PR" ? "PI" : "SMP";
  const src = useApi(["source", srcType, partyId], () =>
    sourceDocuments({ data: { type: srcType, partyId } }),
  );
  const docs = src.data?.docs ?? [];
  const label = type === "SMR" ? "Sample slip" : "Original invoice";
  return (
    <SelectField
      label={`${label} *`}
      className="max-w-md"
      value={value ?? ""}
      options={docs.map((d) => ({
        value: String(d["id"]),
        label: `${String(d["docNo"])} · ${formatDate(String(d["date"]))} · ${formatPKR(Number(d["total"]))}`,
      }))}
      onChange={(v) => {
        const ls = (src.data?.lines ?? []).filter(
          (l) => l["documentId"] === v && Number(l["remaining"]) > 0,
        );
        onPick(
          v,
          ls.map((l) => ({
            key: key(),
            refLineId: String(l["id"]),
            label: String(l["product"]),
            qty: 0,
            remaining: Number(l["remaining"]),
            rate: Number(l["rate"]),
            discountPct: Number(l["discountPct"]),
            discountRs: Number(l["discountRs"] ?? 0),
          })),
        );
      }}
    />
  );
}

function Allocations({
  type,
  partyId,
  amount,
  alloc,
  setAlloc,
}: {
  type: "SI" | "PI";
  partyId: string;
  amount: number;
  alloc: Record<string, number>;
  setAlloc: (a: Record<string, number>) => void;
}) {
  const inv = useApi(["open-invoices", type, partyId], () =>
    openInvoices({ data: { type, partyId } }),
  );
  const rows = inv.data ?? [];
  const allocated = round2(Object.values(alloc).reduce((s, a) => s + a, 0));
  const auto = () => {
    let left = amount;
    const next: Record<string, number> = {};
    for (const r of rows) {
      if (left <= 0) break;
      const take = Math.min(left, Number(r["outstanding"]));
      next[String(r["id"])] = round2(take);
      left = round2(left - take);
    }
    setAlloc(next);
  };
  const totalsRow = useMemo(
    () => round2(rows.reduce((s, r) => s + Number(r["outstanding"]), 0)),
    [rows],
  );
  return (
    <Section
      title={`Allocate against open invoices (unallocated stays on account: ${formatPKR(round2(amount - allocated))})`}
      action={
        <Button type="button" size="sm" variant="outline" onClick={auto} disabled={!rows.length}>
          <Wand2 />
          Oldest first
        </Button>
      }
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className={th}>Invoice</th>
            <th className={th}>Date</th>
            <th className={th}>Due</th>
            <th className={`${th} text-right`}>Outstanding</th>
            <th className={`${th} w-40`}>Allocate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = String(r["id"]);
            const overdue = r["dueDate"] && String(r["dueDate"]) < todayISO();
            return (
              <tr key={id} className="border-t">
                <td className={`${td} pt-3 font-medium`}>{String(r["docNo"])}</td>
                <td className={`${td} pt-3`}>{formatDate(String(r["date"]))}</td>
                <td className={`${td} pt-3 ${overdue ? "text-destructive" : ""}`}>
                  {formatDate(String(r["dueDate"] ?? ""))}
                </td>
                <td className={`${td} pt-3 text-right tabular-nums`}>
                  {formatAmount(Number(r["outstanding"]))}
                </td>
                <td className={td}>
                  <Input
                    type="number"
                    min={0}
                    max={Number(r["outstanding"])}
                    step="0.01"
                    aria-label={`Allocate to ${String(r["docNo"])}`}
                    value={alloc[id] ?? ""}
                    onChange={(e) =>
                      setAlloc({
                        ...alloc,
                        [id]: Math.min(Number(r["outstanding"]), num(e.target.value)),
                      })
                    }
                  />
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="p-4 text-center text-muted-foreground">
                {inv.isLoading ? "Loading…" : "No open invoices; the full amount stays on account."}
              </td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="border-t font-semibold">
              <td colSpan={3} className="px-2 py-2">
                Totals
              </td>
              <td className="px-2 text-right tabular-nums">{formatAmount(totalsRow)}</td>
              <td className={`px-2 tabular-nums ${allocated > amount ? "text-destructive" : ""}`}>
                {formatAmount(allocated)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

export type { DocType };
