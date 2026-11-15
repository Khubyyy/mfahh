import { createFileRoute } from "@tanstack/react-router";
import { MasterPage } from "@/components/masters/MasterPage";

export const Route = createFileRoute("/_authenticated/transactions/expense-heads")({
  head: () => ({ meta: [{ title: "Expense Heads – MFAHH" }] }),
  component: () => (
    <MasterPage
      entity="expenseHeads"
      title="Expense Heads / Categories"
      section="Expenses"
      singular="Expense Head"
      headerExtra={
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-muted-foreground">
          Add, rename or deactivate expense heads here. Each head posts to its ledger account, so
          the head chosen on a voucher flows straight into the expense reports and the accounts.
        </p>
      }
      editPerm="accounts.manage"
      fields={[
        { key: "name", label: "Expense head", required: true },
        {
          key: "accountId",
          label: "Posts to expense account",
          type: "account",
          accountType: "Expense",
          required: true,
        },
      ]}
      columns={[
        { key: "name", header: "Expense head" },
        { key: "account", header: "Ledger account" },
        { key: "status", header: "Status", kind: "status" },
      ]}
    />
  ),
});
