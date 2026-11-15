import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/shared/Field";
import { useLookups } from "@/lib/lookups";
import { todayISO } from "@/shared/documents";

export const PACK_SECTIONS = [
  "Receiving",
  "Sales Report Product Wise",
  "Sales Report Customer Wise",
  "Receivables",
  "Expense Report",
  "Inventory Report",
] as const;

/** Picks a month and opens the printable monthly report pack in a new tab. */
export function MonthlyPackLauncher() {
  const { data: lk } = useLookups();
  const today = lk?.today ?? todayISO();
  const prev = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const [month, setMonth] = useState(prev.toISOString().slice(0, 7));
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-navy">Monthly Report Pack</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        One printable document for the month, in the same blue-and-white format as invoices: a cover
        page followed by each report on its own page. Use “Save as PDF” in the print dialog to keep
        or email it.
      </p>
      <ol className="list-decimal space-y-0.5 pl-6 text-sm">
        {PACK_SECTIONS.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="Month" type="month" value={month} onChange={setMonth} />
        <Button
          disabled={!month}
          onClick={() => window.open(`/print/monthly?month=${month}`, "_blank", "noopener")}
        >
          <Printer />
          Open printable pack
        </Button>
      </div>
    </div>
  );
}
