import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/transactions/expenses")({
  head: () => ({ meta: [{ title: "Expenses – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Expenses"
      section="Expenses"
      types={["EXP"]}
      create={["EXP"]}
      columns={[
        "docNo",
        "date",
        "head",
        "paidTo",
        "narration",
        "billNo",
        "method",
        "total",
        "status",
      ]}
      filters={[
        { key: "expenseHead", label: "Expense heads" },
        { key: "method", label: "Methods" },
      ]}
    />
  ),
});
