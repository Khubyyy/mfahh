import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb, type Tx } from "../db/client";
import * as t from "../db/schema";
import { diff, writeAudit } from "../audit";
import { assertPerm, requireUser, type SessionUser } from "../security/session";
import { safe, toRows, type Row } from "./_safe";
import type { Permission } from "@/shared/permissions";
import { todayISO } from "@/shared/documents";
import {
  CATEGORY_KINDS,
  CATEGORY_KIND_KEYS,
  CODE_PREFIX,
  type CategoryKind,
} from "@/shared/masters";

const str = (max = 200) => z.string().trim().max(max).default("");
const req = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max);
const amount = z.coerce.number().finite().min(0).max(1e12).default(0);
const days = z.coerce.number().int().min(0).max(3650).default(0);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .or(z.literal("").transform(() => null));
const email = z.string().trim().max(200).email("Invalid email").or(z.literal("")).default("");

/** Blank on a new record = generate the next code automatically. */
const autoCode = (max: number) => z.string().trim().max(max).default("");

const partyFields = {
  code: autoCode(30),
  name: req("Name"),
  contactPerson: str(),
  phone: str(50),
  email,
  address: str(500),
  city: str(100),
  ntn: str(30),
  creditDays: days,
  notes: str(1000),
};

const ENTITIES = {
  customers: {
    table: t.customers,
    perm: "customers.manage",
    label: "Customer",
    schema: z.object({
      ...partyFields,
      category: req("Customer type", 60),
      location: req("Location", 60),
      creditLimit: amount,
      discountPct: z.coerce
        .number()
        .finite()
        .min(0, "Discount cannot be negative")
        .max(100, "Discount cannot exceed 100%")
        .default(0),
    }),
  },
  suppliers: {
    table: t.suppliers,
    perm: "suppliers.manage",
    label: "Supplier",
    schema: z.object({ ...partyFields, category: req("Category", 60) }),
  },
  products: {
    table: t.products,
    perm: "books.manage",
    label: "Book / Product",
    schema: z.object({
      code: autoCode(40),
      name: req("Name"),
      subject: str(100),
      className: str(50),
      series: str(100),
      edition: str(50),
      category: req("Category", 60),
      costPrice: amount,
      salePrice: amount,
      minStock: z.coerce.number().int().min(0).max(1e7).default(0),
    }),
  },
  accounts: {
    table: t.accounts,
    perm: "accounts.manage",
    label: "Account",
    schema: z.object({
      code: req("Code", 20),
      name: req("Name"),
      type: z.enum(["Asset", "Liability", "Equity", "Income", "Expense"]),
      parentId: z.string().uuid().nullish(),
      isGroup: z.boolean().default(false),
    }),
  },
  bankAccounts: {
    table: t.bankAccounts,
    perm: "accounts.manage",
    label: "Bank Account",
    schema: z.object({
      name: req("Bank name"),
      accountNo: req("Account number", 50),
      branch: str(),
    }),
  },
  expenseHeads: {
    table: t.expenseHeads,
    perm: "accounts.manage",
    label: "Expense Head",
    schema: z.object({
      name: req("Name", 100),
      accountId: z.string().uuid("Choose the expense account"),
    }),
  },
  staff: {
    table: t.staff,
    perm: "staff.manage",
    label: "Staff Member",
    schema: z.object({
      empId: autoCode(30),
      name: req("Name"),
      type: z.enum(["Employee", "Management"]),
      department: str(100),
      designation: str(100),
      responsibilities: str(1000),
      phone: str(50),
      email,
      address: str(500),
      cnic: str(20),
      joiningDate: isoDate,
      leavingDate: isoDate,
      employmentStatus: z.enum(["Active", "Resigned", "Terminated", "Inactive"]),
      basic: amount,
      allowances: amount,
      deductions: amount,
    }),
  },
  leaveTypes: {
    table: t.leaveTypes,
    perm: "staff.manage",
    label: "Leave Type",
    schema: z.object({ name: req("Name", 50), daysPerYear: days }),
  },
} as const;
export type MasterEntity = keyof typeof ENTITIES;
const entityEnum = z.enum(Object.keys(ENTITIES) as [MasterEntity, ...MasterEntity[]]);

const SALARY_FIELDS = ["basic", "allowances", "deductions", "cnic"] as const;
const viewPerm = (entity: MasterEntity): Permission[] =>
  entity === "staff" || entity === "leaveTypes"
    ? ["staff.view", "staff.manage"]
    : [ENTITIES[entity].perm as Permission, "reports.view"];

function maskStaff(user: SessionUser, row: Record<string, unknown>) {
  if (user.permissions.has("hr.salary_view")) return row;
  const copy = { ...row };
  for (const f of SALARY_FIELDS)
    copy[f] =
      f === "cnic" && typeof row["cnic"] === "string" && row["cnic"]
        ? `*****-*******-${String(row["cnic"]).slice(-1)}`
        : null;
  return copy;
}

/** Lists a master with computed balances / stock figures. */
export const listMasters = createServerFn({ method: "GET" })
  .validator(z.object({ entity: entityEnum }))
  .handler(({ data }) => safe(async (): Promise<Row[]> => toRows(await listRaw(data.entity))));

async function listRaw(entity: MasterEntity): Promise<object[]> {
  const user = await requireUser();
  assertPerm(user, ...viewPerm(entity));
  const db = getDb();
  const today = todayISO();
  switch (entity) {
    case "customers":
    case "suppliers": {
      const isCust = entity === "customers";
      const key = isCust ? "AR" : "AP";
      const invType = isCust ? "SI" : "PI";
      const table = isCust ? t.customers : t.suppliers;
      const rows = await db.select().from(table).orderBy(asc(table.code));
      const bal = await db.execute<{ party_id: string; bal: string }>(sql`
          select g.party_id, sum(g.debit - g.credit) bal from gl_entries g join accounts a on a.id = g.account_id
          where a.system_key = ${key} group by g.party_id`);
      const overdue = await db.execute<{ party_id: string; amt: string }>(sql`
          select party_id, sum(total - paid_amount - credited_amount) amt from documents
          where type = ${invType} and status = 'Approved' and due_date < ${today} and total > paid_amount + credited_amount
          group by party_id`);
      const b = new Map(bal.map((r) => [r.party_id, Number(r.bal) * (isCust ? 1 : -1)]));
      const o = new Map(overdue.map((r) => [r.party_id, Number(r.amt)]));
      // Unallocated payments still reduce what is overdue, so overdue never exceeds the balance.
      return rows.map((r) => {
        const balance = b.get(r.id) ?? 0;
        return {
          ...r,
          balance,
          overdue: Math.max(0, Math.min(o.get(r.id) ?? 0, balance)),
        };
      });
    }
    case "products": {
      const rows = await db.select().from(t.products).orderBy(asc(t.products.code));
      return rows.map((p) => ({
        ...p,
        stockValue: Math.round(p.stockQty * p.avgCost * 100) / 100,
        stockStatus:
          p.stockQty <= 0 ? "Out of Stock" : p.stockQty <= p.minStock ? "Low Stock" : "In Stock",
      }));
    }
    case "accounts": {
      const rows = await db.select().from(t.accounts).orderBy(asc(t.accounts.code));
      const bal = await db.execute<{ account_id: string; bal: string }>(
        sql`select account_id, sum(debit - credit) bal from gl_entries group by account_id`,
      );
      const b = new Map(bal.map((r) => [r.account_id, Number(r.bal)]));
      return rows.map((a) => ({ ...a, balance: b.get(a.id) ?? 0 }));
    }
    case "bankAccounts": {
      const rows = await db
        .select({ bank: t.bankAccounts, code: t.accounts.code })
        .from(t.bankAccounts)
        .innerJoin(t.accounts, eq(t.accounts.id, t.bankAccounts.accountId))
        .orderBy(asc(t.bankAccounts.name));
      const bal = await db.execute<{ account_id: string; bal: string }>(
        sql`select account_id, sum(debit - credit) bal from gl_entries group by account_id`,
      );
      const b = new Map(bal.map((r) => [r.account_id, Number(r.bal)]));
      return rows.map((r) => ({
        ...r.bank,
        glCode: r.code,
        balance: b.get(r.bank.accountId) ?? 0,
      }));
    }
    case "expenseHeads": {
      const rows = await db
        .select({ head: t.expenseHeads, code: t.accounts.code, accountName: t.accounts.name })
        .from(t.expenseHeads)
        .innerJoin(t.accounts, eq(t.accounts.id, t.expenseHeads.accountId))
        .orderBy(asc(t.expenseHeads.name));
      return rows.map((r) => ({ ...r.head, account: `${r.code} ${r.accountName}` }));
    }
    case "staff": {
      const rows = await db.select().from(t.staff).orderBy(asc(t.staff.empId));
      const adv = await db.execute<{ party_id: string; bal: string }>(sql`
          select g.party_id, sum(g.debit - g.credit) bal from gl_entries g join accounts a on a.id = g.account_id
          where a.system_key = 'STAFF_ADV' group by g.party_id`);
      const a = new Map(adv.map((r) => [r.party_id, Number(r.bal)]));
      return rows.map((r) =>
        maskStaff(user, {
          ...r,
          status: r.employmentStatus === "Active" ? "Active" : "Inactive",
          advances: user.permissions.has("hr.salary_view") ? (a.get(r.id) ?? 0) : null,
        }),
      );
    }
    case "leaveTypes":
      return db.select().from(t.leaveTypes).orderBy(asc(t.leaveTypes.name));
  }
}

export const saveMaster = createServerFn({ method: "POST" })
  .validator(
    z.object({
      entity: entityEnum,
      id: z.string().uuid().nullish(),
      values: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      const def = ENTITIES[data.entity];
      assertPerm(user, def.perm as Permission);
      const values = def.schema.parse(data.values) as Record<string, unknown>;
      const db = getDb();
      const table = def.table as typeof t.customers; // all share id/status/created columns
      return db.transaction(async (tx) => {
        const existing = data.id
          ? ((await tx.select().from(table).where(eq(table.id, data.id)).for("update"))[0] as
              Record<string, unknown> | undefined)
          : undefined;
        if (data.id && !existing) throw new Error("Record not found.");

        // Category fields must name an active category of the right kind (or keep the current one).
        const catFields: [string, CategoryKind][] =
          data.entity === "customers"
            ? [
                ["category", "customer"],
                ["location", "customerLocation"],
              ]
            : data.entity === "suppliers"
              ? [["category", "supplier"]]
              : data.entity === "products"
                ? [["category", "product"]]
                : [];
        for (const [field, kind] of catFields) {
          const name = String(values[field] ?? "");
          if (existing && String(existing[field] ?? "") === name) continue;
          const [cat] = await tx
            .select()
            .from(t.categories)
            .where(
              and(eq(t.categories.kind, kind), sql`lower(${t.categories.name}) = lower(${name})`),
            );
          if (!cat || cat.status !== "Active")
            throw new Error(
              `"${name}" is not an active ${CATEGORY_KINDS[kind].singular.toLowerCase()}.`,
            );
          values[field] = cat.name;
        }

        if (data.entity === "customers" && !String(values["city"] ?? "").trim())
          values["city"] = String(values["location"]).toLowerCase() === "karachi" ? "Karachi" : "";

        // Codes are generated automatically when left blank on a new record.
        const codeField = data.entity === "staff" ? "empId" : "code";
        if (data.entity in CODE_PREFIX && !String(values[codeField] ?? "")) {
          if (existing) values[codeField] = existing[codeField];
          else values[codeField] = await nextCode(tx, data.entity as keyof typeof CODE_PREFIX);
        }

        // Case-insensitive uniqueness on the business key.
        const keyField =
          "code" in values
            ? "code"
            : "empId" in values
              ? "empId"
              : "accountNo" in values
                ? "accountNo"
                : "name";
        const col = (def.table as unknown as Record<string, Parameters<typeof eq>[0]>)[keyField]!;
        const dup = await tx
          .select({ id: table.id })
          .from(table)
          .where(
            and(
              sql`lower(${col}) = lower(${String(values[keyField])})`,
              data.id ? ne(table.id, data.id) : sql`true`,
            ),
          );
        if (dup.length) throw new Error(`${def.label} ${String(values[keyField])} already exists.`);

        if (data.entity === "products" && existing) {
          const priceChanged =
            values["costPrice"] !== existing["costPrice"] ||
            values["salePrice"] !== existing["salePrice"];
          if (priceChanged) {
            assertPerm(user, "books.price_edit");
            await tx.insert(t.priceHistory).values({
              productId: data.id!,
              oldCost: existing["costPrice"] as number,
              newCost: values["costPrice"] as number,
              oldSale: existing["salePrice"] as number,
              newSale: values["salePrice"] as number,
              changedBy: user.id,
            });
          }
        }
        if (data.entity === "staff") {
          if (!user.permissions.has("hr.salary_view")) {
            for (const f of SALARY_FIELDS)
              values[f] = existing ? existing[f] : f === "cnic" ? "" : 0;
          }
        }
        if (data.entity === "accounts") {
          if (values["parentId"]) {
            const [parent] = await tx
              .select()
              .from(t.accounts)
              .where(eq(t.accounts.id, values["parentId"] as string));
            if (!parent?.isGroup) throw new Error("The parent must be a group account.");
            if (parent.type !== values["type"])
              throw new Error(`The parent is a ${parent.type} group; types must match.`);
            if (parent.id === data.id) throw new Error("An account cannot be its own parent.");
          }
          if (existing?.["systemKey"]) {
            // System accounts: only the name may change.
            for (const f of ["code", "type", "parentId", "isGroup"]) values[f] = existing[f];
          }
          if (existing && values["isGroup"] !== existing["isGroup"]) {
            const [used] = await tx.execute<{ n: string }>(
              sql`select count(*) n from gl_entries where account_id = ${data.id!}`,
            );
            if (Number(used?.n) > 0)
              throw new Error("This account has postings; it cannot become a group.");
          }
        }
        if (data.entity === "expenseHeads") {
          const [acc] = await tx
            .select()
            .from(t.accounts)
            .where(eq(t.accounts.id, values["accountId"] as string));
          if (!acc || acc.type !== "Expense" || acc.isGroup)
            throw new Error("Choose an expense posting account.");
        }
        if (data.entity === "bankAccounts" && !existing) {
          const [group] = await tx
            .select()
            .from(t.accounts)
            .where(eq(t.accounts.systemKey, "BANK_GROUP"));
          if (!group) throw new Error("Bank Accounts group is missing from the chart of accounts.");
          const [last] = await tx.execute<{ code: string | null }>(
            sql`select max(code) code from accounts where parent_id = ${group.id}`,
          );
          const code = String(Number(last?.code ?? group.code) + 1);
          const [acc] = await tx
            .insert(t.accounts)
            .values({
              code,
              name: `${String(values["name"])} – ${String(values["accountNo"])}`,
              type: "Asset",
              parentId: group.id,
              createdBy: user.id,
            })
            .returning();
          values["accountId"] = acc!.id;
        }

        let row: Record<string, unknown>;
        if (existing) {
          [row] = (await tx
            .update(table)
            .set({ ...values, editedBy: user.id, editedAt: new Date() } as never)
            .where(eq(table.id, data.id!))
            .returning()) as Record<string, unknown>[] as [Record<string, unknown>];
          await writeAudit(tx, user, {
            action: "Edited",
            entity: def.label,
            entityId: data.id!,
            ref: String(values["code"] ?? values["empId"] ?? values["name"]),
            details: diff(existing, values),
          });
        } else {
          [row] = (await tx
            .insert(table)
            .values({ ...values, createdBy: user.id } as never)
            .returning()) as Record<string, unknown>[] as [Record<string, unknown>];
          await writeAudit(tx, user, {
            action: "Created",
            entity: def.label,
            entityId: String(row["id"]),
            ref: String(values["code"] ?? values["empId"] ?? values["name"]),
          });
        }
        return { id: String(row["id"]) };
      });
    }),
  );

type CodeEntity = keyof typeof CODE_PREFIX;
const CODE_TABLES = {
  customers: t.customers,
  suppliers: t.suppliers,
  products: t.products,
  staff: t.staff,
} as const;

/** Next free code for a master (CUST-0001...). Skips codes already taken by imported records. */
async function nextCode(tx: Tx, entity: CodeEntity) {
  const prefix = CODE_PREFIX[entity];
  const table = CODE_TABLES[entity];
  const col = entity === "staff" ? t.staff.empId : (table as typeof t.customers).code;
  for (let i = 0; i < 100000; i++) {
    const [r] = await tx.execute<{ n: number }>(sql`
      insert into code_series (prefix, next) values (${prefix}, 2)
      on conflict (prefix) do update set next = code_series.next + 1
      returning next - 1 as n`);
    const code = `${prefix}-${String(Number(r?.n ?? 1)).padStart(4, "0")}`;
    const taken = await tx
      .select({ id: table.id })
      .from(table)
      .where(sql`lower(${col}) = lower(${code})`);
    if (!taken.length) return code;
  }
  throw new Error("Could not generate a free code.");
}

/** Masters are never deleted: they are made Inactive and kept with their history. */
export const setMasterStatus = createServerFn({ method: "POST" })
  .validator(z.object({ entity: entityEnum, id: z.string().uuid(), active: z.boolean() }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      const def = ENTITIES[data.entity];
      assertPerm(user, def.perm as Permission);
      const db = getDb();
      if (data.entity === "staff") {
        await db
          .update(t.staff)
          .set({
            employmentStatus: data.active ? "Active" : "Inactive",
            editedBy: user.id,
            editedAt: new Date(),
          })
          .where(eq(t.staff.id, data.id));
      } else {
        const table = def.table as typeof t.customers;
        if (data.entity === "accounts") {
          const [acc] = await db.select().from(t.accounts).where(eq(t.accounts.id, data.id));
          if (acc?.systemKey) throw new Error("System accounts cannot be deactivated.");
        }
        await db
          .update(table)
          .set({ status: data.active ? "Active" : "Inactive" } as never)
          .where(eq(table.id, data.id));
      }
      await writeAudit(db, user, {
        action: data.active ? "Activated" : "Deactivated",
        entity: def.label,
        entityId: data.id,
      });
      return { ok: true };
    }),
  );

/** Small active lists for dropdowns, limited to what the user may see. */
export const getLookups = createServerFn({ method: "GET" }).handler(() =>
  safe(async () => {
    const user = await requireUser();
    const db = getDb();
    const has = (p: Permission) => user.permissions.has(p);
    const sales =
      has("sales.create") ||
      has("sales.approve") ||
      has("samples.manage") ||
      has("customers.manage") ||
      has("reports.view") ||
      has("accounts.manage");
    const purch =
      has("purchases.create") ||
      has("purchases.approve") ||
      has("suppliers.manage") ||
      has("reports.view") ||
      has("accounts.manage");
    const staffOk = has("staff.view") || has("payroll.manage") || has("accounts.manage");
    return {
      customers: sales
        ? await db
            .select({
              id: t.customers.id,
              code: t.customers.code,
              name: t.customers.name,
              creditDays: t.customers.creditDays,
              discountPct: t.customers.discountPct,
              phone: t.customers.phone,
              city: t.customers.city,
              location: t.customers.location,
              category: t.customers.category,
              address: t.customers.address,
              status: t.customers.status,
            })
            .from(t.customers)
            .orderBy(asc(t.customers.name))
        : [],
      suppliers: purch
        ? await db
            .select({
              id: t.suppliers.id,
              code: t.suppliers.code,
              name: t.suppliers.name,
              creditDays: t.suppliers.creditDays,
              phone: t.suppliers.phone,
              city: t.suppliers.city,
              address: t.suppliers.address,
              status: t.suppliers.status,
            })
            .from(t.suppliers)
            .orderBy(asc(t.suppliers.name))
        : [],
      products: await db
        .select({
          id: t.products.id,
          code: t.products.code,
          name: t.products.name,
          salePrice: t.products.salePrice,
          costPrice: t.products.costPrice,
          avgCost: t.products.avgCost,
          stockQty: t.products.stockQty,
          className: t.products.className,
          subject: t.products.subject,
          category: t.products.category,
          status: t.products.status,
        })
        .from(t.products)
        .orderBy(asc(t.products.name)),
      accounts: await db
        .select({
          id: t.accounts.id,
          code: t.accounts.code,
          name: t.accounts.name,
          type: t.accounts.type,
          isGroup: t.accounts.isGroup,
          systemKey: t.accounts.systemKey,
          parentId: t.accounts.parentId,
          status: t.accounts.status,
        })
        .from(t.accounts)
        .orderBy(asc(t.accounts.code)),
      bankAccounts: await db
        .select({
          id: t.bankAccounts.id,
          name: t.bankAccounts.name,
          accountNo: t.bankAccounts.accountNo,
          status: t.bankAccounts.status,
        })
        .from(t.bankAccounts)
        .orderBy(asc(t.bankAccounts.name)),
      categories: await db
        .select({
          id: t.categories.id,
          kind: t.categories.kind,
          name: t.categories.name,
          status: t.categories.status,
        })
        .from(t.categories)
        .orderBy(asc(t.categories.sortOrder), asc(t.categories.name)),
      expenseHeads: await db
        .select({ id: t.expenseHeads.id, name: t.expenseHeads.name, status: t.expenseHeads.status })
        .from(t.expenseHeads)
        .orderBy(asc(t.expenseHeads.name)),
      staff: staffOk
        ? await db
            .select({
              id: t.staff.id,
              code: t.staff.empId,
              name: t.staff.name,
              department: t.staff.department,
              status: t.staff.employmentStatus,
            })
            .from(t.staff)
            .orderBy(asc(t.staff.name))
        : [],
      leaveTypes: staffOk
        ? await db
            .select({ id: t.leaveTypes.id, name: t.leaveTypes.name, status: t.leaveTypes.status })
            .from(t.leaveTypes)
        : [],
      financialYears: await db
        .select()
        .from(t.financialYears)
        .orderBy(asc(t.financialYears.startDate)),
      company:
        (
          await db
            .select({
              name: t.company.name,
              address: t.company.address,
              phone: t.company.phone,
              email: t.company.email,
              ntn: t.company.ntn,
            })
            .from(t.company)
        )[0] ?? null,
      today: todayISO(),
    };
  }),
);

export const getPriceHistory = createServerFn({ method: "GET" })
  .validator(z.object({ productId: z.string().uuid() }))
  .handler(({ data }) =>
    safe(async () => {
      assertPerm(await requireUser(), "books.manage", "reports.view");
      const rows = await getDb()
        .select({
          at: t.priceHistory.at,
          oldCost: t.priceHistory.oldCost,
          newCost: t.priceHistory.newCost,
          oldSale: t.priceHistory.oldSale,
          newSale: t.priceHistory.newSale,
          by: t.users.name,
        })
        .from(t.priceHistory)
        .leftJoin(t.users, eq(t.users.id, t.priceHistory.changedBy))
        .where(eq(t.priceHistory.productId, data.productId))
        .orderBy(asc(t.priceHistory.at));
      return toRows(rows);
    }),
  );

/* ------------------------------------------------------------ categories */

const kindEnum = z.enum(CATEGORY_KIND_KEYS as [CategoryKind, ...CategoryKind[]]);
/** Where each category kind is used: table and column. */
const CATEGORY_USE = {
  product: { table: t.products, col: t.products.category },
  customer: { table: t.customers, col: t.customers.category },
  customerLocation: { table: t.customers, col: t.customers.location },
  supplier: { table: t.suppliers, col: t.suppliers.category },
} as const;

/** All categories with how many records use each one. */
export const listCategories = createServerFn({ method: "GET" })
  .validator(z.object({ kind: kindEnum }))
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, CATEGORY_KINDS[data.kind].perm, "reports.view");
      const db = getDb();
      const use = CATEGORY_USE[data.kind];
      const counts = await db
        .select({ name: sql<string>`lower(${use.col})`, n: sql<number>`count(*)::int` })
        .from(use.table)
        .groupBy(sql`lower(${use.col})`);
      const used = new Map(counts.map((c) => [c.name, c.n]));
      const rows = await db
        .select()
        .from(t.categories)
        .where(eq(t.categories.kind, data.kind))
        .orderBy(asc(t.categories.sortOrder), asc(t.categories.name));
      return toRows(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          sortOrder: r.sortOrder,
          used: used.get(r.name.toLowerCase()) ?? 0,
        })),
      );
    }),
  );

/** Adds a category, or renames one (records using the old name follow the new name). */
export const saveCategory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: kindEnum,
      id: z.string().uuid().nullish(),
      name: z.string().trim().min(1, "Enter a name").max(60),
      sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, CATEGORY_KINDS[data.kind].perm);
      return getDb().transaction(async (tx) => {
        const dup = await tx
          .select({ id: t.categories.id })
          .from(t.categories)
          .where(
            and(
              eq(t.categories.kind, data.kind),
              sql`lower(${t.categories.name}) = lower(${data.name})`,
              data.id ? ne(t.categories.id, data.id) : sql`true`,
            ),
          );
        if (dup.length) throw new Error(`"${data.name}" already exists.`);
        const label = CATEGORY_KINDS[data.kind].singular;
        if (!data.id) {
          const [row] = await tx
            .insert(t.categories)
            .values({
              kind: data.kind,
              name: data.name,
              sortOrder: data.sortOrder ?? 50,
              createdBy: user.id,
            })
            .returning();
          await writeAudit(tx, user, {
            action: "Created",
            entity: label,
            entityId: row!.id,
            ref: data.name,
          });
          return { id: row!.id };
        }
        const [old] = await tx
          .select()
          .from(t.categories)
          .where(and(eq(t.categories.id, data.id), eq(t.categories.kind, data.kind)))
          .for("update");
        if (!old) throw new Error("Category not found.");
        await tx
          .update(t.categories)
          .set({
            name: data.name,
            sortOrder: data.sortOrder ?? old.sortOrder,
            editedBy: user.id,
            editedAt: new Date(),
          })
          .where(eq(t.categories.id, data.id));
        let moved = 0;
        if (old.name !== data.name) {
          const use = CATEGORY_USE[data.kind];
          const res = await tx
            .update(use.table)
            .set({
              [data.kind === "customerLocation" ? "location" : "category"]: data.name,
            } as never)
            .where(sql`lower(${use.col}) = lower(${old.name})`)
            .returning({ id: use.table.id });
          moved = res.length;
        }
        await writeAudit(tx, user, {
          action: "Edited",
          entity: label,
          entityId: data.id,
          ref: data.name,
          details: { from: old.name, to: data.name, recordsUpdated: moved },
        });
        return { id: data.id, recordsUpdated: moved };
      });
    }),
  );

/** Unused categories are deleted; categories in use can only be deactivated (hidden from new entries). */
export const removeCategory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: kindEnum,
      id: z.string().uuid(),
      action: z.enum(["delete", "deactivate", "activate"]),
    }),
  )
  .handler(({ data }) =>
    safe(async () => {
      const user = await requireUser();
      assertPerm(user, CATEGORY_KINDS[data.kind].perm);
      return getDb().transaction(async (tx) => {
        const [cat] = await tx
          .select()
          .from(t.categories)
          .where(and(eq(t.categories.id, data.id), eq(t.categories.kind, data.kind)))
          .for("update");
        if (!cat) throw new Error("Category not found.");
        const label = CATEGORY_KINDS[data.kind].singular;
        if (data.action === "delete") {
          const use = CATEGORY_USE[data.kind];
          const [u] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(use.table)
            .where(sql`lower(${use.col}) = lower(${cat.name})`);
          if ((u?.n ?? 0) > 0)
            throw new Error(
              `"${cat.name}" is used by ${u!.n} record(s). Deactivate it instead, or rename it.`,
            );
          await tx.delete(t.categories).where(eq(t.categories.id, data.id));
        } else {
          await tx
            .update(t.categories)
            .set({ status: data.action === "activate" ? "Active" : "Inactive" })
            .where(eq(t.categories.id, data.id));
        }
        await writeAudit(tx, user, {
          action:
            data.action === "delete"
              ? "Deleted"
              : data.action === "activate"
                ? "Activated"
                : "Deactivated",
          entity: label,
          entityId: data.id,
          ref: cat.name,
        });
        return { ok: true };
      });
    }),
  );
