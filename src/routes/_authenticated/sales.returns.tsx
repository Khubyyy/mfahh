import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/sales/returns")({
  head: () => ({ meta: [{ title: "Sales Returns – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Sales Returns"
      section="Sales"
      types={["SR"]}
      create={["SR"]}
      columns={["docNo", "date", "party", "reason", "total", "status", "progress"]}
      extraHeader={
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-muted-foreground">
          Return workflow: <b>Draft</b> → <b>Submit for approval</b> → <b>Approve</b>. On approval
          the customer ledger is credited and stock updated automatically. Books marked{" "}
          <b>Damaged</b> go to the Damaged Stock register instead of saleable stock.
        </p>
      }
    />
  ),
});
