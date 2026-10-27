require("dotenv").config();
const bcrypt = require("bcryptjs");

let parsedConfig = null;
let pgPool = null;

function getConfig() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) return null;

  if (parsedConfig && parsedConfig.rawUrl === urlStr) {
    return parsedConfig;
  }

  try {
    const parsed = new URL(urlStr);
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    const host = parsed.hostname;
    const database = parsed.pathname.replace(/^\//, "");
    const base64Credentials = Buffer.from(`${username}:${password}`).toString("base64");

    const httpHost = host.replace("-pooler", "");
    parsed.hostname = httpHost;
    parsed.searchParams.delete("channel_binding");
    parsed.searchParams.set("sslmode", "require");
    const cleanUrl = parsed.toString();

    parsedConfig = {
      rawUrl: urlStr,
      cleanUrl,
      host,
      httpHost,
      database,
      username,
      base64Credentials,
      endpoint: `https://${httpHost}/sql`,
    };
    return parsedConfig;
  } catch (err) {
    console.error("[Neon DB] Invalid DATABASE_URL:", err.message);
    return null;
  }
}

function getPgPool() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) return null;

  if (!pgPool) {
    try {
      const { Pool } = require("pg");
      let connStr = urlStr;
      try {
        const u = new URL(urlStr);
        u.searchParams.delete("channel_binding");
        connStr = u.toString();
      } catch (_) {}

      pgPool = new Pool({
        connectionString: connStr,
        ssl: {
          rejectUnauthorized: false,
        },
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 30000,
        max: 10,
      });

      pgPool.on("error", (err) => {
        console.warn("[Neon DB Pool] Unexpected error on idle client:", err.message);
      });
    } catch (err) {
      console.warn("[Neon DB] pg driver could not be loaded, using HTTP mode:", err.message);
      pgPool = null;
    }
  }
  return pgPool;
}

/**
 * Execute SQL query with parameters against Neon PostgreSQL.
 * Prefers pg connection pool (TCP/port 5432) with automatic fallback to Neon HTTP API.
 */
async function query(sqlText, params = []) {
  const pool = getPgPool();
  if (pool) {
    try {
      const res = await pool.query(sqlText, params || []);
      return {
        rows: res.rows || [],
        rowCount: res.rowCount !== undefined ? res.rowCount : (res.rows ? res.rows.length : 0),
        fields: res.fields || [],
        driver: "pg",
      };
    } catch (pgErr) {
      console.warn(`[Neon DB] pg pool query failed (${pgErr.message}), falling back to HTTP fetch...`);
    }
  }

  const config = getConfig();
  if (!config) {
    throw new Error("DATABASE_URL is not configured in .env");
  }

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": config.cleanUrl,
      Authorization: `Basic ${config.base64Credentials}`,
    },
    body: JSON.stringify({
      query: sqlText,
      params: params || [],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    let detail = `Neon HTTP ${res.status}: ${errorText}`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.message || parsed.error) {
        detail = parsed.message || parsed.error;
      }
    } catch (_) {}
    throw new Error(detail);
  }

  const data = await res.json();
  let rows = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && Array.isArray(data.rows)) {
    rows = data.rows;
  }

  return {
    rows,
    rowCount: rows.length,
    fields: data.fields || [],
    driver: "http",
  };
}

/**
 * Test Neon database connection and return latency / version
 */
async function testConnection() {
  const start = Date.now();
  try {
    const result = await query(
      "SELECT version() AS version, current_database() AS database, NOW() AS server_time;"
    );
    const latencyMs = Date.now() - start;
    const info = result.rows[0] || {};
    return {
      connected: true,
      latencyMs,
      driver: result.driver || "pg",
      database: info.database,
      version: info.version,
      serverTime: info.server_time,
    };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

/**
 * Initialize PostgreSQL tables for Echo (users, voice_logs) and seed demo account
 */
async function initDb() {
  const config = getConfig();
  if (!config) {
    console.log("[Neon DB] No DATABASE_URL provided. Operating with in-memory JSON fallback.");
    return false;
  }

  try {
    console.log(`[Neon DB] Connecting to PostgreSQL at ${config.host}/${config.database}...`);
    const status = await testConnection();

    if (!status.connected) {
      console.warn(`[Neon DB] Connection check failed: ${status.error}`);
      return false;
    }

    console.log(`[Neon DB] Connected (${status.latencyMs}ms via ${status.driver}). Database: ${status.database}`);

    // 1. Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );
    `);

    // 2. Create voice_logs table for optional session audit / telemetry
    await query(`
      CREATE TABLE IF NOT EXISTS voice_logs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(64),
        turn_count INT DEFAULT 1,
        stt_engine VARCHAR(64),
        llm_provider VARCHAR(64),
        tts_provider VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. Seed demo accounts if not already present
    const demoPasswordHash = bcrypt.hashSync("Password123!", 10);
    await query(
      `
      INSERT INTO users (id, name, email, password_hash, role, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (email) DO NOTHING;
      `,
      ["usr_demo_echo_ai_2026", "Demo Engineer", "demo@echo.ai", demoPasswordHash, "user"]
    );

    const testPasswordHash = bcrypt.hashSync("SecretPassword!1", 10);
    await query(
      `
      INSERT INTO users (id, name, email, password_hash, role, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (email) DO NOTHING;
      `,
      ["test_user_1", "Test Engineer", "test@echo.ai", testPasswordHash, "user"]
    );

    console.log("[Neon DB] Schema synchronized & seeded accounts verified.");
    return true;
  } catch (err) {
    console.error("[Neon DB] Initialization error:", err.message);
    return false;
  }
}

function isAvailable() {
  return Boolean(getConfig());
}

module.exports = {
  query,
  testConnection,
  initDb,
  isAvailable,
};
