import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProductMovementReport, StockStatementReport } from "@/components/reports/Reports";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/inventory/stock")({
  head: () => ({ meta: [{ title: "Stock – MFAHH" }] }),
  component: StockPage,
});

function StockPage() {
  const [tab, setTab] = useState("summary");
  const [productId, setProductId] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <PageHeader title="Stock" crumbs={["Home", "Inventory", "Stock"]} />
      <p className="text-sm text-muted-foreground">
        Stock moves only through approved documents: purchases, sales, returns, samples, adjustments
        and damaged-stock write-offs. Click any book in the summary to see its own movement.
      </p>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print">
          <TabsTrigger value="summary">Stock summary</TabsTrigger>
          <TabsTrigger value="product">Product-wise movement</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <section className="card-surface p-4">
            <StockStatementReport
              title="Stock position"
              onProduct={(id) => {
                setProductId(id);
                setTab("product");
              }}
            />
          </section>
        </TabsContent>
        <TabsContent value="product">
          <section className="card-surface p-4">
            <ProductMovementReport key={productId ?? "none"} initialId={productId} />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
