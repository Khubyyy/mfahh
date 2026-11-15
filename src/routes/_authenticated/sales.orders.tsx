import { createFileRoute } from "@tanstack/react-router";
import { DocumentListPage } from "@/components/documents/DocumentListPage";

export const Route = createFileRoute("/_authenticated/sales/orders")({
  head: () => ({ meta: [{ title: "Sales Orders – MFAHH" }] }),
  component: () => (
    <DocumentListPage
      title="Sales Orders"
      section="Sales"
      types={["SO"]}
      create={["SO"]}
      columns={[
        "docNo",
        "date",
        "party",
        "fromInvoice",
        "reference",
        "qty",
        "total",
        "status",
        "progress",
      ]}
      extraHeader={
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-muted-foreground">
          Two ways to work: create the <b>invoice first</b> and use <b>Create sales order</b> on it
          to keep an order record for follow-up (no extra stock or ledger entries), or create an
          order here and deliver it later with <b>Create invoice</b>.
        </p>
      }
    />
  ),
});
