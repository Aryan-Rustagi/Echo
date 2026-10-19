const { signToken, verifyToken, getTokenValidityMeta, SEVEN_DAYS_SECONDS } = require("./utils/jwt");
const userStore = require("./data/userStore");
const { authenticateToken, authorizeRoles, verifySevenDaySession } = require("./middleware/auth");

console.log("=== RUNNING GRAVITAS DETERMINISTIC AUTH VALIDATION ===");

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 1. Test JWT Generation & 7-Day Session Duration
console.log("\n--- 1. Testing JWT & 7-Day Session Expiration ---");
const testPayload = { id: "test_user_1", email: "test@echo.ai", role: "user" };
const token = signToken(testPayload);
assert(typeof token === "string" && token.split(".").length === 3, "Token generated in standard 3-part format");

const decoded = verifyToken(token);
assert(decoded.id === testPayload.id, "Decoded token contains user id");
assert(decoded.email === testPayload.email, "Decoded token contains user email");

const duration = decoded.exp - decoded.iat;
assert(duration === SEVEN_DAYS_SECONDS, `Token duration (${duration}s) equals exactly 7 days (${SEVEN_DAYS_SECONDS}s / 604800s)`);

const meta = getTokenValidityMeta(decoded);
assert(meta.isSevenDaysConfigured === true, "isSevenDaysConfigured flag is true");
assert(meta.remainingDays >= 6.9, `Remaining days is approximately 7 days (${meta.remainingDays} days)`);

// 2. Test User Store & Password Hashing
console.log("\n--- 2. Testing User Store & Password Security ---");
const demoUser = userStore.findByEmail("demo@echo.ai");
assert(demoUser !== null, "Default seeded demo account demo@echo.ai exists");
assert(userStore.verifyPassword(demoUser, "Password123!"), "Demo password verification succeeds");
assert(!userStore.verifyPassword(demoUser, "WrongPassword"), "Wrong password correctly rejected");

const uniqueEmail = `user_${Date.now()}@example.com`;
const created = userStore.createUser({ name: "Test Engineer", email: uniqueEmail, password: "SecretPassword!1" });
assert(created.email === uniqueEmail.toLowerCase(), "New user created successfully in store");
assert(userStore.verifyPassword(created, "SecretPassword!1"), "New user password matches hash");

// 3. Test Authentication Middleware
console.log("\n--- 3. Testing Separate Auth Middleware ---");

// Test valid token
let nextCalled = false;
let mockReq = { headers: { authorization: `Bearer ${token}` } };
let mockRes = {
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.responseBody = body; return this; }
};

authenticateToken(mockReq, mockRes, () => { nextCalled = true; });
assert(nextCalled === true, "Valid Bearer token allows request to proceed (next called)");
assert(mockReq.user && mockReq.user.id === testPayload.id, "req.user attached to request");
assert(mockReq.tokenMeta && mockReq.tokenMeta.isSevenDaysConfigured, "req.tokenMeta verifies 7-day configuration");

// Test 7-day session verification middleware
let sevenDayNextCalled = false;
verifySevenDaySession(mockReq, mockRes, () => { sevenDayNextCalled = true; });
assert(sevenDayNextCalled === true, "verifySevenDaySession passes for 7-day token");

// Test missing token
nextCalled = false;
mockReq = { headers: {} };
authenticateToken(mockReq, mockRes, () => { nextCalled = true; });
assert(nextCalled === false, "Missing token blocks execution");
assert(mockRes.statusCode === 401, "Missing token returns 401 Unauthorized");
assert(mockRes.responseBody.code === "TOKEN_MISSING", "Returns TOKEN_MISSING error code");

// Test invalid token
nextCalled = false;
mockReq = { headers: { authorization: "Bearer invalid.fake.token" } };
authenticateToken(mockReq, mockRes, () => { nextCalled = true; });
assert(nextCalled === false, "Invalid token blocks execution");
assert(mockRes.statusCode === 401, "Invalid token returns 401 Unauthorized");
assert(mockRes.responseBody.code === "TOKEN_INVALID", "Returns TOKEN_INVALID error code");

// 4. Test Role Authorization Middleware
console.log("\n--- 4. Testing Authorization Middleware ---");
const adminOnlyMiddleware = authorizeRoles("admin");
let adminNextCalled = false;
mockReq = { user: { role: "user" } };
adminOnlyMiddleware(mockReq, mockRes, () => { adminNextCalled = true; });
assert(adminNextCalled === false, "User with 'user' role blocked from 'admin' resource");
assert(mockRes.statusCode === 403, "Role mismatch returns 403 Forbidden");

const userRoleMiddleware = authorizeRoles("user", "admin");
let userRoleNextCalled = false;
userRoleMiddleware(mockReq, mockRes, () => { userRoleNextCalled = true; });
assert(userRoleNextCalled === true, "User with 'user' role allowed to access 'user' resource");

console.log(`\n=== ALL ${passed}/${total} AUTHENTICATION & 7-DAY SESSION TESTS PASSED! ===\n`);
