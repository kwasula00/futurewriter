// Migration runner for the remote Supabase database.
//
// Supabase CLI cannot reach the direct db host from this machine (IPv6 only), and
// linking the project needs a Management API token. So every command is routed
// through the IPv4 pooler stored in SUPABASE_DB_URL, with no manual flags needed:
//
//   npm run db:push     apply pending migrations
//   npm run db:status   show local vs remote migration history
import { spawnSync } from "node:child_process";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error(
    "SUPABASE_DB_URL is not set. Add it to .env (see the Supabase section there).",
  );
  process.exit(1);
}

const [, , command = "push", ...extraArgs] = process.argv;

const commands = {
  push: ["db", "push", "--include-all"],
  status: ["migration", "list"],
};

const subCommand = commands[command];
if (!subCommand) {
  console.error(`Unknown command "${command}". Expected one of: push, status.`);
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["supabase", ...subCommand, "--db-url", dbUrl, "--yes", ...extraArgs],
  { stdio: "inherit", shell: true },
);

process.exit(result.status ?? 1);
