import type { ReactNode } from "react";
import { BLUE, LIGHT, LINE, NAVY } from "./PrintShell";

/** Two-column box of "Label: [value]" pairs, as on the voucher sample. */
export function InfoBox({
  left,
  right,
}: {
  left: [string, ReactNode][];
  right: [string, ReactNode][];
}) {
  const col = (items: [string, ReactNode][]) => (
    <div className="space-y-1.5">
      {items.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[104px_1fr] items-center gap-2">
          <span className="text-[11.5px] font-bold" style={{ color: NAVY }}>
            {k}:
          </span>
          <span
            className="min-h-[24px] rounded-md px-2.5 py-1 text-[11.5px]"
            style={{ background: LIGHT, border: `1px solid ${LINE}` }}
          >
            {v || " "}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <div
      className="grid grid-cols-2 gap-x-6 rounded-lg bg-white p-3"
      style={{ border: `1.5px solid ${LINE}` }}
    >
      {col(left)}
      {col(right)}
    </div>
  );
}

/** Payment method shown as radio circles: (●) Cash ( ) Bank ( ) Cheque. */
export function MethodRadios({ value }: { value: string }) {
  const options = ["Cash", "Online", "Bank", "Cheque"];
  return (
    <span className="flex flex-nowrap gap-1.5 text-[10px]">
      {options.map((o) => (
        <span key={o} className="inline-flex items-center gap-0.5">
          <span
            className="inline-flex size-3 shrink-0 items-center justify-center rounded-full"
            style={{ border: `1.5px solid ${o === value ? BLUE : "#94a3b8"}` }}
          >
            {o === value && <span className="size-1.5 rounded-full" style={{ background: BLUE }} />}
          </span>
          {o}
        </span>
      ))}
    </span>
  );
}

export interface ItemCol {
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  /** Keep on one line (dates, numbers). */
  nowrap?: boolean;
}

/** Navy-headed item table; pads with blank rows so short documents keep the printed form shape. */
export function ItemsTable({
  cols,
  rows,
  minRows = 5,
}: {
  cols: ItemCol[];
  rows: ReactNode[][];
  minRows?: number;
}) {
  const blanks = Math.max(0, minRows - rows.length);
  const cell = "px-2 py-1.5";
  return (
    <table
      className="mt-4 w-full border-separate border-spacing-0 overflow-hidden rounded-lg text-[11.5px]"
      style={{ border: `1.5px solid ${NAVY}` }}
    >
      <thead>
        <tr style={{ background: NAVY, color: "white" }}>
          {cols.map((c, i) => (
            <th
              key={c.header}
              className={`${cell} whitespace-nowrap py-2 font-bold`}
              style={{
                width: c.width,
                textAlign: c.align ?? "left",
                borderLeft: i ? "1px solid rgba(255,255,255,0.35)" : undefined,
              }}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((v, i) => (
              <td
                key={i}
                className={cell}
                style={{
                  textAlign: cols[i]?.align ?? "left",
                  borderTop: `1px solid ${LINE}`,
                  borderLeft: i ? `1px solid ${LINE}` : undefined,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: cols[i]?.nowrap || cols[i]?.align === "right" ? "nowrap" : undefined,
                }}
              >
                {v}
              </td>
            ))}
          </tr>
        ))}
        {Array.from({ length: blanks }, (_, bi) => (
          <tr key={`b${bi}`}>
            {cols.map((c, i) => (
              <td
                key={c.header}
                className={cell}
                style={{
                  textAlign: c.align ?? "left",
                  borderTop: `1px solid ${LINE}`,
                  borderLeft: i ? `1px solid ${LINE}` : undefined,
                  height: 26,
                  color: "#64748b",
                }}
              >
                {i === 0 ? rows.length + bi + 1 : ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Remarks (left) and the navy totals panel with amount in words (right). */
export function TotalsPanel({
  remarks,
  totals,
  words,
}: {
  remarks?: ReactNode;
  totals: [string, string, boolean?][];
  words?: string;
}) {
  const rows: [string, string, boolean?][] = words
    ? [...totals, ["Amount in Words", words]]
    : totals;
  return (
    <div className="mt-4 grid grid-cols-[1fr_1.05fr] gap-4">
      <div className="rounded-lg p-3" style={{ background: LIGHT, border: `1.5px solid ${LINE}` }}>
        <p className="text-[13px] font-bold" style={{ color: NAVY }}>
          Remarks:
        </p>
        <div className="mt-1 whitespace-pre-line text-[11.5px]">{remarks || " "}</div>
      </div>
      <div className="overflow-hidden rounded-lg" style={{ border: `1.5px solid ${NAVY}` }}>
        {rows.map(([k, v, strong], i) => (
          <div
            key={k}
            className="grid grid-cols-[46%_54%]"
            style={{ borderTop: i ? `1px solid ${LINE}` : undefined }}
          >
            <span
              className="px-3 py-1.5 text-[12px] font-bold text-white"
              style={{ background: NAVY }}
            >
              {k}:
            </span>
            <span
              className={`px-3 py-1.5 ${k === "Amount in Words" ? "text-[11px]" : "text-right tabular-nums"} ${strong ? "text-[15px] font-extrabold" : "font-semibold"}`}
              style={{ background: LIGHT, color: strong ? NAVY : undefined }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Four signature boxes; known names (prepared / approved by) are printed above the line. */
export function Signatures({ boxes }: { boxes: { label: string; name?: string | null }[] }) {
  return (
    <div
      className="mt-6 grid gap-3"
      style={{ gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))` }}
    >
      {boxes.map((b) => (
        <div
          key={b.label}
          className="flex h-[74px] flex-col justify-between rounded-lg px-3 pb-2 pt-1.5 text-center"
          style={{ border: `1.5px solid ${LINE}` }}
        >
          <p className="text-[12px] font-bold" style={{ color: NAVY }}>
            {b.label}
          </p>
          <div>
            <p className="truncate text-[10px] text-gray-600">{b.name || " "}</p>
            <div className="mx-auto mt-0.5 h-px w-11/12 bg-gray-500" />
          </div>
        </div>
      ))}
    </div>
  );
}
