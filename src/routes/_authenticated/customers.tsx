import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";
import { customerFields } from "@/components/masters/partyFields";
import { ManageCategoriesButton } from "@/components/masters/CategoryManager";
import { PartyStatement } from "@/components/reports/Ledger";
import { DocumentListInline } from "@/components/documents/DocumentListInline";
import { formatPKR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "Customers – MFAHH" }] }),
  component: () => (
    <MasterPage
      entity="customers"
      title="Customers"
      section="Customers"
      singular="Customer"
      editPerm="customers.manage"
      fields={customerFields}
      headerActions={<ManageCategoriesButton kinds={["customer", "customerLocation"]} />}
      columns={[
        { key: "code", header: "Code" },
        { key: "name", header: "Name" },
        { key: "category", header: "Type" },
        { key: "location", header: "Location" },
        { key: "city", header: "City" },
        { key: "phone", header: "Phone" },
        { key: "balance", header: "Balance", kind: "money" },
        { key: "overdue", header: "Overdue", kind: "money" },
        { key: "discountSummary", header: "Discounts" },
        { key: "status", header: "Status", kind: "status" },
      ]}
      filters={[
        { key: "category", label: "Customer types" },
        { key: "location", label: "Locations" },
        { key: "city", label: "Cities" },
      ]}
      kpis={(rows) => {
        const active = rows.filter((r) => r["status"] === "Active");
        const bal = rows.reduce((s, r) => s + Number(r["balance"] ?? 0), 0);
        const od = rows.reduce((s, r) => s + Number(r["overdue"] ?? 0), 0);
        const over = rows.filter(
          (r) => Number(r["creditLimit"]) > 0 && Number(r["balance"]) > Number(r["creditLimit"]),
        ).length;
        return [
          {
            title: "Active customers",
            value: String(active.length),
            sub: `${rows.length - active.length} inactive`,
          },
          { title: "Total receivable", value: formatPKR(bal) },
          { title: "Overdue", value: formatPKR(od), danger: od > 0 },
          { title: "Over credit limit", value: String(over), danger: over > 0 },
        ];
      }}
      tabs={(r) => [
        {
          id: "statement",
          label: "Statement",
          content: (
            <PartyStatement
              partyType="customer"
              partyId={String(r["id"])}
              partyName={String(r["name"])}
            />
          ),
        },
        {
          id: "documents",
          label: "Invoices & orders",
          content: (
            <DocumentListInline types={["SI", "SO", "SR", "RV", "SMP"]} partyId={String(r["id"])} />
          ),
        },
      ]}
    />
  ),
});
