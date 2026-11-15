import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";
import { StockMovement } from "@/components/reports/Ledger";
import { PriceHistory } from "@/components/masters/PriceHistory";
import { formatPKR } from "@/lib/format";
import { ManageCategoriesButton } from "@/components/masters/CategoryManager";

export const Route = createFileRoute("/_authenticated/inventory/books")({
  head: () => ({ meta: [{ title: "Books & Products – MFAHH" }] }),
  component: () => (
    <MasterPage
      entity="products"
      title="Books & Products"
      section="Inventory"
      singular="Book / Product"
      editPerm="books.manage"
      fields={[
        {
          key: "code",
          label: "Book code / SKU",
          placeholder: "Auto",
          help: "Leave blank: generated automatically",
        },
        { key: "name", label: "Title", required: true },
        {
          key: "category",
          label: "Category",
          type: "category",
          categoryKind: "product",
          required: true,
        },
        { key: "subject", label: "Subject" },
        { key: "className", label: "Class / grade" },
        { key: "series", label: "Series" },
        { key: "edition", label: "Edition" },
        { key: "minStock", label: "Minimum stock level", type: "number" },
        { key: "costPrice", label: "Standard cost price (Rs)", type: "number" },
        { key: "salePrice", label: "Sale / retail price (Rs)", type: "number" },
        {
          key: "openingQty",
          label: "Opening stock (qty)",
          type: "number",
          help: "Only when adding: books already in hand, valued at the cost price above.",
          showWhen: (v) => !v["id"],
        },
      ]}
      columns={[
        { key: "code", header: "Code" },
        { key: "name", header: "Title" },
        { key: "category", header: "Category" },
        { key: "className", header: "Class" },
        { key: "subject", header: "Subject" },
        { key: "edition", header: "Edition" },
        { key: "salePrice", header: "Sale price", kind: "money" },
        { key: "stockQty", header: "In stock", kind: "qty" },
        { key: "stockValue", header: "Stock value", kind: "money" },
        { key: "stockStatus", header: "Stock", kind: "badge" },
      ]}
      headerActions={<ManageCategoriesButton kinds={["product"]} />}
      filters={[
        { key: "category", label: "Categories" },
        { key: "className", label: "Classes" },
        { key: "subject", label: "Subjects" },
        { key: "series", label: "Series" },
        { key: "stockStatus", label: "Stock levels" },
      ]}
      kpis={(rows) => {
        const active = rows.filter((r) => r["status"] === "Active");
        return [
          { title: "Active titles", value: String(active.length) },
          {
            title: "Stock value (weighted avg.)",
            value: formatPKR(active.reduce((s, r) => s + Number(r["stockValue"] ?? 0), 0)),
          },
          {
            title: "Low stock",
            value: String(active.filter((r) => r["stockStatus"] === "Low Stock").length),
            danger: true,
          },
          {
            title: "Out of stock",
            value: String(active.filter((r) => r["stockStatus"] === "Out of Stock").length),
            danger: true,
          },
        ];
      }}
      tabs={(r) => [
        {
          id: "moves",
          label: "Stock movement",
          content: <StockMovement productId={String(r["id"])} />,
        },
        {
          id: "prices",
          label: "Price history",
          content: <PriceHistory productId={String(r["id"])} />,
        },
      ]}
    />
  ),
});
