import type { FieldDef } from "./MasterPage";

const AUTO = "Leave blank: generated automatically";

/** Fields shared by customers and suppliers. */
export const partyFields: FieldDef[] = [
  { key: "code", label: "Code", placeholder: "Auto", help: AUTO },
  { key: "name", label: "Name", required: true },
  { key: "contactPerson", label: "Contact person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "city", label: "City" },
  { key: "address", label: "Address", wide: true },
  { key: "ntn", label: "NTN" },
  { key: "creditDays", label: "Credit period (days)", type: "number" },
  {
    key: "openingBalance",
    label: "Opening balance payable (Rs)",
    type: "number",
    help: "Only when adding: what you already owe this supplier. Posted as an opening entry.",
    showWhen: (v) => !v["id"],
  },
];

/** Customer form: location (Karachi / outside) drives whether the city is asked for. */
export const customerFields: FieldDef[] = [
  { key: "code", label: "Customer code", placeholder: "Auto", help: AUTO },
  { key: "name", label: "Name", required: true },
  {
    key: "category",
    label: "Customer type",
    type: "category",
    categoryKind: "customer",
    required: true,
  },
  {
    key: "location",
    label: "Location",
    type: "category",
    categoryKind: "customerLocation",
    required: true,
  },
  {
    key: "city",
    label: "City / town (optional)",
    placeholder: "e.g. Hyderabad",
    showWhen: (v) => String(v["location"] ?? "").toLowerCase() !== "karachi",
  },
  { key: "contactPerson", label: "Contact person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address", wide: true },
  { key: "ntn", label: "NTN" },
  { key: "creditDays", label: "Credit period (days)", type: "number" },
  { key: "creditLimit", label: "Credit limit (Rs, 0 = none)", type: "number" },
  {
    key: "openingBalance",
    label: "Opening balance receivable (Rs)",
    type: "number",
    help: "Only when adding: what this customer already owes you. Posted as an opening entry.",
    showWhen: (v) => !v["id"],
  },
  { key: "discountRules", label: "Discounts", type: "discountRules", wide: true },
  { key: "notes", label: "Notes", type: "textarea" },
];
