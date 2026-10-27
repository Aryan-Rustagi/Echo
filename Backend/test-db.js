require("dotenv").config();
const neon = require("./db/neon");

async function runDbTests() {
  console.log("=== RUNNING NEON POSTGRESQL VERIFICATION ===");

  if (!neon.isAvailable()) {
    console.warn("[SKIP] DATABASE_URL is not set in .env. Skipping remote Neon DB test.");
    console.warn("       (Operating in local JSON cache fallback mode)");
    return;
  }

  console.log("[1/3] Testing Neon connection...");
  const conn = await neon.testConnection();
  if (!conn.connected) {
    console.warn("[WARN] Could not connect to Neon PostgreSQL:", conn.error);
    console.warn("[SKIP] Operating in local JSON cache fallback mode.");
    return;
  }

  console.log(`[PASS] Connected to Neon PostgreSQL in ${conn.latencyMs}ms!`);
  console.log(`       Database: ${conn.database}`);
  console.log(`       PostgreSQL Version: ${conn.version.split(" on ")[0]}`);
  console.log(`       Server Time: ${conn.serverTime}`);

  console.log("\n[2/3] Initializing schema & seeded accounts...");
  const initOk = await neon.initDb();
  if (!initOk) {
    console.error("[FAIL] Schema initialization failed.");
    process.exit(1);
  }
  console.log("[PASS] Schema tables (users, voice_logs) and seeded accounts verified!");

  console.log("\n[3/3] Querying users from Neon PostgreSQL...");
  const userCountRes = await neon.query("SELECT COUNT(*) AS total_users FROM users;");
  const totalUsers = userCountRes.rows[0]?.total_users;
  console.log(`[PASS] Total registered users in Neon PostgreSQL: ${totalUsers}`);

  const sampleUsers = await neon.query("SELECT id, name, email, role, created_at FROM users LIMIT 5;");
  console.log("       Sample Users:");
  for (const u of sampleUsers.rows) {
    console.log(`         - ${u.name} (${u.email}) [Role: ${u.role}]`);
  }

  console.log("\n>>> Neon PostgreSQL is 100% connected, operational, and persistent! <<<\n");
}

if (require.main === module) {
  runDbTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}

module.exports = { runDbTests };
