import type { ReactNode } from "react";

export interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  ntn: string;
}

/** House print theme (blue & white), shared by vouchers, invoices and printed reports. */
export const NAVY = "#0b3a6e";
export const BLUE = "#1565c0";
export const LIGHT = "#eaf2fb";
export const LINE = "#a9c7e8";

/** MFAHH wordmark (left) and the Turnkey Publishers logo (right). */
export function Letterhead({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative z-10 flex items-center justify-between">
      <div
        className="flex items-center gap-2 font-extrabold tracking-tight"
        style={{ color: NAVY, fontSize: compact ? 26 : 40, lineHeight: 1 }}
        aria-label="MFAHH"
      >
        <span>M</span>
        <span
          className="inline-block"
          style={{ width: 3, height: compact ? 22 : 34, background: NAVY, borderRadius: 2 }}
        />
        <span>FAHH</span>
      </div>
      <img
        src="/turnkey-logo.png"
        alt="Turnkey Publishers"
        style={{ height: compact ? 44 : 64, width: "auto" }}
      />
    </div>
  );
}

/** Centered rounded title with rules either side ("VOUCHER", "SALES INVOICE"…). */
export function TitlePill({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="relative z-10 my-4 flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: BLUE }} />
      <div
        className="rounded-full px-10 py-1.5 text-center"
        style={{ background: LIGHT, border: `1.5px solid ${LINE}` }}
      >
        <h1 className="text-[26px] font-extrabold uppercase tracking-wide" style={{ color: NAVY }}>
          {title}
        </h1>
        {sub && <p className="-mt-0.5 text-[10px] font-semibold uppercase text-gray-500">{sub}</p>}
      </div>
      <div className="h-px flex-1" style={{ background: BLUE }} />
    </div>
  );
}

/** Contact strip at the bottom of every printed page. */
export function ContactFooter({ company }: { company: Company | null }) {
  const c = company;
  return (
    <footer
      className="relative z-10 mt-6 border-t-2 pt-2 text-center text-[10px] leading-relaxed text-gray-600"
      style={{ borderColor: BLUE }}
    >
      <p className="font-semibold" style={{ color: NAVY }}>
        {c?.name || "Turnkey Publishers"}
      </p>
      <p>
        {[
          c?.address,
          c?.phone ? `Phone: ${c.phone}` : "",
          c?.email ? `Email: ${c.email}` : "",
          c?.ntn ? `NTN ${c.ntn}` : "",
        ]
          .filter(Boolean)
          .join("  ·  ")}
      </p>
    </footer>
  );
}

/** Decorative blue swooshes in the top-left and bottom-right corners, as on the sample voucher. */
function Swooshes() {
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute left-0 top-0"
        width="230"
        height="150"
        viewBox="0 0 230 150"
      >
        <path d="M0 0 H230 C150 8 62 52 0 150 Z" fill="#cfe2f6" />
        <path d="M0 0 H140 C92 8 38 42 0 104 Z" fill={BLUE} />
      </svg>
      <svg
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0"
        width="230"
        height="130"
        viewBox="0 0 230 130"
      >
        <path d="M230 130 H30 C120 118 192 78 230 0 Z" fill="#cfe2f6" />
        <path d="M230 130 H112 C165 118 208 90 230 46 Z" fill={BLUE} />
      </svg>
    </>
  );
}

/** A4 sheet with the house letterhead, title pill and contact footer. */
export function PrintShell({
  company,
  title,
  sub,
  status,
  children,
  autoPrintHint = true,
}: {
  company: Company | null;
  title: string;
  sub?: string;
  status?: string;
  children: ReactNode;
  autoPrintHint?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Full-bleed pages so the corner artwork reaches the paper edge. */}
      <style>{`@page { size: A4; margin: 0; } @media print { html, body { background: white; } }`}</style>
      <div className="no-print flex justify-center gap-2 p-3">
        <button
          className="rounded-md px-4 py-2 text-sm text-white"
          style={{ background: NAVY }}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
        <button
          className="rounded-md border bg-white px-4 py-2 text-sm"
          onClick={() => window.close()}
        >
          Close
        </button>
        {autoPrintHint && (
          <span className="self-center text-xs text-gray-500">
            Tip: in the print dialog choose “Save as PDF” to get a PDF.
          </span>
        )}
      </div>
      <PrintSheet company={company} title={title} sub={sub} status={status}>
        {children}
      </PrintSheet>
    </div>
  );
}

/** One A4 sheet (used directly by multi-page packs). */
export function PrintSheet({
  company,
  title,
  sub,
  status,
  children,
  breakAfter = false,
}: {
  company: Company | null;
  title: string;
  sub?: string;
  status?: string;
  children: ReactNode;
  breakAfter?: boolean;
}) {
  return (
    <article
      className="relative mx-auto mb-6 flex min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white px-[13mm] pb-[16mm] pt-[11mm] text-[12px] text-gray-900 shadow print:mb-0 print:shadow-none"
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
        breakAfter: breakAfter ? "page" : "auto",
        fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <Swooshes />
      <Letterhead />
      <TitlePill title={title} sub={sub} />
      {status && status !== "Approved" && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] rounded-xl border-[6px] px-8 text-7xl font-extrabold uppercase opacity-[0.12]"
          style={{ color: status === "Cancelled" ? "#b91c1c" : NAVY, borderColor: "currentColor" }}
        >
          {status === "Pending" ? "Not approved" : status}
        </div>
      )}
      <div className="relative z-10 flex-1">{children}</div>
      <ContactFooter company={company} />
    </article>
  );
}
