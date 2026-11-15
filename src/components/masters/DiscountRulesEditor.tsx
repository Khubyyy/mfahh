import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCategoryOptions } from "./CategoryManager";
import type { DiscountRule } from "@/shared/documents";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Parses the rules a customer row carries (JSON text from the list, or an array). */
export function parseRules(v: unknown): DiscountRule[] {
  if (Array.isArray(v)) return v as DiscountRule[];
  if (typeof v === "string" && v.startsWith("[")) {
    try {
      return JSON.parse(v) as DiscountRule[];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Customer discounts: a default for all books plus optional rules per book category
 * (copies, practical journals, brochures…). % or rupees per item; Fixed rules are enforced on
 * invoices, Editable rules only pre-fill the line.
 */
export function DiscountRulesEditor({
  value,
  onChange,
}: {
  value: DiscountRule[];
  onChange: (rules: DiscountRule[]) => void;
}) {
  const cats = useCategoryOptions("product");
  const rules = value.length
    ? value
    : [{ category: "", kind: "pct" as const, value: 0, mode: "editable" as const }];
  const set = (i: number, patch: Partial<DiscountRule>) =>
    onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const used = new Set(rules.map((r) => r.category.toLowerCase()));
  const nextCat = cats.find((c) => !used.has(c.toLowerCase()));
  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-end justify-between">
        <div>
          <p className="text-sm font-medium">Customer discounts</p>
          <p className="text-[11px] text-muted-foreground">
            Filled into invoice and order lines automatically. <b>Fixed</b> cannot be changed on the
            invoice; <b>Editable</b> can. Rupee discounts are per item.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!nextCat}
          onClick={() =>
            onChange([
              ...rules,
              { category: nextCat ?? "", kind: "pct", value: 0, mode: "editable" },
            ])
          }
        >
          <Plus />
          Category rule
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5">Applies to</th>
              <th className="w-36 px-2 py-1.5">Type</th>
              <th className="w-28 px-2 py-1.5">Discount</th>
              <th className="w-32 px-2 py-1.5">Rule</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">
                  {r.category === "" && i === 0 ? (
                    <span className="text-sm font-medium">All books (default)</span>
                  ) : (
                    <select
                      aria-label={`Rule ${i + 1} category`}
                      className={sel}
                      value={r.category}
                      onChange={(e) => set(i, { category: e.target.value })}
                    >
                      {[r.category, ...cats.filter((c) => !used.has(c.toLowerCase()))].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label={`Rule ${i + 1} type`}
                    className={sel}
                    value={r.kind}
                    onChange={(e) => set(i, { kind: e.target.value as "pct" | "rs" })}
                  >
                    <option value="pct">Percent %</option>
                    <option value="rs">Rupees per item</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    min={0}
                    max={r.kind === "pct" ? 100 : undefined}
                    step="0.01"
                    aria-label={`Rule ${i + 1} discount`}
                    value={r.value || ""}
                    placeholder="0"
                    onChange={(e) => set(i, { value: Number(e.target.value || 0) })}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label={`Rule ${i + 1} mode`}
                    className={sel}
                    value={r.mode}
                    onChange={(e) => set(i, { mode: e.target.value as "fixed" | "editable" })}
                  >
                    <option value="editable">Editable</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </td>
                <td className="px-1 py-1">
                  {!(r.category === "" && i === 0) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove rule ${i + 1}`}
                      onClick={() => onChange(rules.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
