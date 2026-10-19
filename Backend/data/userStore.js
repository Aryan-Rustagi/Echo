const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let bcryptLib;
try {
  bcryptLib = require("bcryptjs");
} catch (e) {
  bcryptLib = null;
}

const DATA_DIR = path.resolve(__dirname);
const USERS_FILE = path.join(DATA_DIR, "users.json");

/**
 * Hash password securely with salt
 */
function hashPassword(password) {
  if (bcryptLib && typeof bcryptLib.hashSync === "function") {
    return bcryptLib.hashSync(password, 10);
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

/**
 * Compare plain password against hash
 */
function comparePassword(password, storedHash) {
  if (!password || !storedHash) return false;

  if (storedHash.startsWith("scrypt$")) {
    const [, salt, originalKey] = storedHash.split("$");
    if (!salt || !originalKey) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    const keyBuf = Buffer.from(derivedKey);
    const origBuf = Buffer.from(originalKey);
    if (keyBuf.length !== origBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, origBuf);
  }

  if (bcryptLib && typeof bcryptLib.compareSync === "function") {
    return bcryptLib.compareSync(password, storedHash);
  }

  // Fallback for simple legacy test strings if any
  return false;
}

/**
 * Load users from disk, ensuring default demo user exists
 */
function loadUsers() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading users file, re-initializing:", err.message);
  }

  // Seed default demo user
  const defaultDemoUser = {
    id: "usr_demo_echo_001",
    name: "Alex Rivera",
    email: "demo@echo.ai",
    passwordHash: hashPassword("Password123!"),
    role: "user",
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  const initialUsers = [defaultDemoUser];
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), "utf8");
  } catch (writeErr) {
    console.error("Failed to write initial users file:", writeErr.message);
  }
  return initialUsers;
}

/**
 * Save users array to disk
 */
function saveUsers(users) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to persist users to disk:", err.message);
  }
}

// In-memory cache synced with disk
let usersCache = loadUsers();

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
   * Find user by ID
   */
  findById(id) {
    if (!id) return null;
    return usersCache.find(u => u.id === id) || null;
  },

  /**
   * Create a new user
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
    return newUser;
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
};

module.exports = userStore;
