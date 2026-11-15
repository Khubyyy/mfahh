export const CUSTOMER_CATEGORIES = [
  "School",
  "Bookshop",
  "Dealer",
  "Distributor",
  "Institution",
  "Other",
] as const;
export const SUPPLIER_CATEGORIES = [
  "Paper Supplier",
  "Card Supplier",
  "Printer",
  "Binder",
  "Plate Maker",
  "Laminator",
  "Transporter",
  "Designer",
  "Packaging Supplier",
  "Other Service Provider",
] as const;
export const PRODUCT_CATEGORIES = ["Textbook", "Workbook", "Guide", "Stationery", "Other"] as const;
export const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
export const STAFF_DOCUMENT_TYPES = [
  "CNIC Copy",
  "Appointment Letter",
  "Contract",
  "Resignation",
  "Other",
] as const;

/** User-managed category lists. Defaults are seeded by migration 0003; users add/rename/retire them. */
export const CATEGORY_KINDS = {
  product: {
    label: "Book / product categories",
    singular: "Product category",
    perm: "books.manage",
  },
  customer: { label: "Customer types", singular: "Customer type", perm: "customers.manage" },
  customerLocation: {
    label: "Customer locations",
    singular: "Customer location",
    perm: "customers.manage",
  },
  supplier: {
    label: "Supplier categories",
    singular: "Supplier category",
    perm: "suppliers.manage",
  },
} as const;
export type CategoryKind = keyof typeof CATEGORY_KINDS;
export const CATEGORY_KIND_KEYS = Object.keys(CATEGORY_KINDS) as CategoryKind[];

/** Prefixes for automatically generated master codes. */
export const CODE_PREFIX = {
  customers: "CUST",
  suppliers: "SUP",
  products: "BK",
  staff: "EMP",
} as const;
