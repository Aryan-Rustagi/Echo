const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const neon = require("../db/neon");

const DATA_DIR = path.resolve(__dirname);
const USERS_FILE = path.join(DATA_DIR, "users.json");

/**
 * Hash password securely with bcrypt
 */
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

/**
 * Compare plain password against hash
 */
function comparePassword(password, storedHash) {
  if (!password || !storedHash) return false;
  return bcrypt.compareSync(password, storedHash);
}

function getSeededUsers() {
  return [
    {
      id: "usr_demo_echo_ai_2026",
      name: "Demo Engineer",
      email: "demo@echo.ai",
      passwordHash: hashPassword("Password123!"),
      role: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null,
    },
    {
      id: "test_user_1",
      name: "Test Engineer",
      email: "test@echo.ai",
      passwordHash: hashPassword("SecretPassword!1"),
      role: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null,
    },
  ];
}

/**
 * Load users from disk cache
 */
function loadUsers() {
  let users = [];
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        users = parsed;
      }
    }
  } catch (err) {
    console.error("[UserStore] Error reading users file:", err.message);
    users = [];
  }

  // Ensure default demo and test users exist
  const seeded = getSeededUsers();
  let modified = false;
  for (const s of seeded) {
    if (!users.some((u) => u.email.toLowerCase() === s.email.toLowerCase() || u.id === s.id)) {
      users.push(s);
      modified = true;
    }
  }

  if (modified || !fs.existsSync(USERS_FILE)) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
    } catch (writeErr) {
      console.error("[UserStore] Failed to write users file:", writeErr.message);
    }
  }
  return users;
}

/**
 * Save users array to disk cache
 */
function saveUsers(users) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("[UserStore] Failed to persist users to disk:", err.message);
  }
}

// In-memory cache synced with disk and Neon PostgreSQL
let usersCache = loadUsers();

/**
 * Sync in-memory cache with Neon PostgreSQL
 */
async function syncWithNeon() {
  if (!neon.isAvailable()) return;

  try {
    const result = await neon.query(
      "SELECT id, name, email, password_hash, role, created_at, last_login_at FROM users;"
    );

    if (Array.isArray(result.rows) && result.rows.length > 0) {
      for (const row of result.rows) {
        const existingIdx = usersCache.findIndex(u => u.id === row.id || u.email.toLowerCase() === row.email.toLowerCase());
        const mappedUser = {
          id: row.id,
          name: row.name,
          email: row.email.toLowerCase(),
          passwordHash: row.password_hash,
          role: row.role || "user",
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
        };

        if (existingIdx !== -1) {
          usersCache[existingIdx] = { ...usersCache[existingIdx], ...mappedUser };
        } else {
          usersCache.push(mappedUser);
        }
      }
      saveUsers(usersCache);
      console.log(`[UserStore] Synced ${result.rows.length} users from Neon PostgreSQL.`);
    }
  } catch (err) {
    console.warn("[UserStore] Neon sync deferred:", err.message);
  }
}

const userStore = {
  /**
   * Find user by email (case-insensitive)
   */
  findByEmail(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    return usersCache.find(u => u.email.toLowerCase() === normalized) || null;
  },

  /**
   * Find user by email async (checks Neon if not found in cache)
   */
  async findByEmailAsync(email) {
    const cached = this.findByEmail(email);
    if (cached) return cached;

    if (neon.isAvailable()) {
      try {
        const normalized = email.trim().toLowerCase();
        const result = await neon.query(
          "SELECT id, name, email, password_hash, role, created_at, last_login_at FROM users WHERE LOWER(email) = $1 LIMIT 1;",
          [normalized]
        );
        if (result.rows.length > 0) {
          const row = result.rows[0];
          const user = {
            id: row.id,
            name: row.name,
            email: row.email.toLowerCase(),
            passwordHash: row.password_hash,
            role: row.role || "user",
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
          };
          usersCache.push(user);
          saveUsers(usersCache);
          return user;
        }
      } catch (err) {
        console.warn("[UserStore] Neon query error:", err.message);
      }
    }
    return null;
  },

  /**
   * Find user by ID
   */
  findById(id) {
    if (!id) return null;
    return usersCache.find(u => u.id === id) || null;
  },

  /**
   * Find user by ID async
   */
  async findByIdAsync(id) {
    const cached = this.findById(id);
    if (cached) return cached;

    if (neon.isAvailable()) {
      try {
        const result = await neon.query(
          "SELECT id, name, email, password_hash, role, created_at, last_login_at FROM users WHERE id = $1 LIMIT 1;",
          [id]
        );
        if (result.rows.length > 0) {
          const row = result.rows[0];
          const user = {
            id: row.id,
            name: row.name,
            email: row.email.toLowerCase(),
            passwordHash: row.password_hash,
            role: row.role || "user",
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
          };
          usersCache.push(user);
          saveUsers(usersCache);
          return user;
        }
      } catch (err) {
        console.warn("[UserStore] Neon query error:", err.message);
      }
    }
    return null;
  },

  /**
   * Create a new user (persists to Neon PostgreSQL and local cache)
   */
  createUser({ name, email, password, role = "user" }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.findByEmail(normalizedEmail)) {
      throw new Error("A user with this email address already exists.");
    }

    const newUser = {
      id: `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };

    usersCache.push(newUser);
    saveUsers(usersCache);

    // Asynchronously insert into Neon PostgreSQL
    if (neon.isAvailable()) {
      neon.query(
        `INSERT INTO users (id, name, email, password_hash, role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash;`,
        [newUser.id, newUser.name, newUser.email, newUser.passwordHash, newUser.role, newUser.createdAt]
      ).catch(err => {
        console.error("[UserStore] Async Neon insert error:", err.message);
      });
    }

    return newUser;
  },

  /**
   * Async create user (awaits Neon PostgreSQL write)
   */
  async createUserAsync({ name, email, password, role = "user" }) {
    const user = this.createUser({ name, email, password, role });
    if (neon.isAvailable()) {
      try {
        await neon.query(
          `INSERT INTO users (id, name, email, password_hash, role, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash;`,
          [user.id, user.name, user.email, user.passwordHash, user.role, user.createdAt]
        );
      } catch (err) {
        console.error("[UserStore] Neon write error:", err.message);
      }
    }
    return user;
  },

  /**
   * Verify password
   */
  verifyPassword(user, password) {
    if (!user || !user.passwordHash) return false;
    return comparePassword(password, user.passwordHash);
  },

  /**
   * Record login timestamp
   */
  recordLogin(userId) {
    const user = usersCache.find(u => u.id === userId);
    if (user) {
      user.lastLoginAt = new Date().toISOString();
      saveUsers(usersCache);

      if (neon.isAvailable()) {
        neon.query(
          "UPDATE users SET last_login_at = NOW() WHERE id = $1;",
          [userId]
        ).catch(err => {
          console.error("[UserStore] Neon update login error:", err.message);
        });
      }
    }
  },

  /**
   * Sanitize user object for client consumption (strip password hash)
   */
  sanitizeUser(user) {
    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  },

  /**
   * Trigger explicit synchronization with Neon PostgreSQL
   */
  syncWithNeon,
};

module.exports = userStore;
