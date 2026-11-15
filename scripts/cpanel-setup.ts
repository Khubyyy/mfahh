/**
 * One-shot setup for cPanel + Supabase (or any managed Postgres without superuser).
 *
 *   1. Creates/updates the restricted login role `mfahh_app` (password from DB_APP_PASSWORD).
 *   2. Applies migrations as the admin role (ADMIN_DATABASE_URL), so it owns the schema.
 *   3. Grants the app role its limited privileges (apply_app_privileges()).
 *   4. Locks Supabase's public API roles (anon, authenticated) out of every table.
 *   5. Seeds reference data and creates the first admin (ADMIN_EMAIL / ADMIN_NAME).
 *
 * Safe to re-run. Output is also written to setup-log.txt.
 */
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { format } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const LOG = "setup-log.txt";
writeFileSync(LOG, `Setup run at ${new Date().toISOString()}\n`);
for (const k of ["log", "error"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    appendFileSync(LOG, format(...a) + "\n");
    orig(...a);
  };
}

if (existsSync(".env")) process.loadEnvFile(".env");
const adminUrl = process.env["ADMIN_DATABASE_URL"];
const appPassword = process.env["DB_APP_PASSWORD"];
if (!adminUrl || !appPassword) {
  console.error("ADMIN_DATABASE_URL and DB_APP_PASSWORD must be set in .env");
  process.exit(1);
}

async function main() {
  const sql = postgres(adminUrl!, { max: 1, onnotice: () => {}, prepare: false });
  try {
    const [v] = await sql<{ u: string; v: string }[]>`select current_user as u, version() as v`;
    console.log(`Connected as ${v!.u} — ${String(v!.v).split(",")[0]}`);

    const exists = await sql`select 1 from pg_roles where rolname = 'mfahh_app'`;
    const template = exists.length
      ? "alter role %I with login password %L"
      : "create role %I with login password %L";
    const rows = await sql<
      { q: string }[]
    >`select format(${template}, 'mfahh_app'::text, ${appPassword!}::text) as q`;
    const row = rows[0];
    await sql.unsafe(row!.q);
    console.log(`Role mfahh_app ${exists.length ? "updated" : "created"}.`);

    await migrate(drizzle(sql), { migrationsFolder: "./migrations" });
    await sql`select apply_app_privileges()`;
    console.log("Migrations applied; app privileges set.");

    // Supabase exposes the public schema over its REST API to these roles. Close that door.
    const apiRoles = (
      await sql<
        { r: string }[]
      >`select rolname as r from pg_roles where rolname in ('anon','authenticated')`
    ).map((x) => x.r);
    for (const r of apiRoles) {
      await sql.unsafe(`
        revoke all on all tables in schema public from ${r};
        revoke all on all sequences in schema public from ${r};
        revoke all on all functions in schema public from ${r};
        alter default privileges in schema public revoke all on tables from ${r};
        alter default privileges in schema public revoke all on sequences from ${r};
        alter default privileges in schema public revoke all on functions from ${r};
      `);
    }
    if (apiRoles.length) console.log(`Public API access removed for: ${apiRoles.join(", ")}.`);
  } finally {
    await sql.end();
  }

  // Seed + first admin, reusing the app's own init script.
  const email = process.env["ADMIN_EMAIL"];
  process.argv.push(
    ...(email ? ["--email", email, "--name", process.env["ADMIN_NAME"] || "Administrator"] : []),
  );
  await import("./init");
}

function describe(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const any = e as Error & { code?: string; errors?: unknown[]; address?: string; port?: number };
  const parts = [any.message || "(no message)"];
  if (any.code) parts.push(`code=${any.code}`);
  if (any.address) parts.push(`addr=${any.address}:${any.port}`);
  if (Array.isArray(any.errors)) parts.push(...any.errors.map((x) => "  - " + describe(x)));
  return parts.join(" ");
}

/** Checks DNS and raw TCP reachability of the database host, to tell blocked ports from bad passwords. */
async function diagnose() {
  const { lookup } = await import("node:dns/promises");
  const net = await import("node:net");
  const host = new URL(adminUrl!).hostname;
  try {
    const addrs = await lookup(host, { all: true });
    console.log(`DNS ${host} -> ${addrs.map((a) => a.address).join(", ")}`);
  } catch (e) {
    console.log(`DNS lookup failed for ${host}: ${describe(e)}`);
    return;
  }
  for (const port of [5432, 6543, 443]) {
    const res = await new Promise<string>((resolve) => {
      const s = net.connect({ host, port, family: 4, timeout: 8000 });
      s.once("connect", () => (s.destroy(), resolve("OPEN")));
      s.once("timeout", () => (s.destroy(), resolve("TIMEOUT (likely blocked by host firewall)")));
      s.once("error", (e) => resolve(`ERROR ${describe(e)}`));
    });
    console.log(`TCP ${host}:${port} -> ${res}`);
  }
}

main().catch(async (e) => {
  console.error("Setup failed:", describe(e));
  console.log("--- Network diagnostics ---");
  await diagnose().catch((d) => console.log("diagnostics error:", describe(d)));
  process.exitCode = 1;
});
