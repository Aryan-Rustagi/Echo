require("dotenv").config();
const assert = require("assert");
const express = require("express");
const chatRoute = require("./routes/chat");

async function runChatErrorTests() {
  console.log("Running /api/chat error behavior integration test...");

  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRoute);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Test 400 bad request when no messages are provided
    const resEmpty = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    assert.strictEqual(resEmpty.status, 400, "Should return 400 for empty messages");
    const jsonEmpty = await resEmpty.json();
    assert.strictEqual(jsonEmpty.error, "No valid messages provided");
    console.log("Empty messages 400 check passed.");

    // 2. Test 502 error behavior when provider keys are invalid or absent
    // Notice: we test with a non-existent provider or simulated failure
    const resError = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Tell me a joke" }],
        provider: "non_existent_provider",
      }),
    });

    // If API keys are not present in the local environment, it must return 502 with error and provider
    // If API keys ARE configured in .env, it calls the real provider. But it must NEVER return the canned joke reply!
    const jsonError = await resError.json();

    if (resError.status === 502) {
      assert(jsonError.error, "502 response must contain an error message");
      assert(jsonError.provider, "502 response must contain the target provider");
      console.log("Real 502 error response verified:", jsonError);
    } else if (resError.status === 200) {
      // If server has live keys, ensure it's not the old fake canned string
      assert.notStrictEqual(
        jsonError.reply,
        "Why do programmers prefer dark mode? Because light attracts bugs!",
        "Must NEVER return hardcoded canned joke reply!"
      );
      assert.notStrictEqual(
        jsonError.reply,
        "Two plus two is four.",
        "Must NEVER return hardcoded canned math reply!"
      );
      console.log("Real LLM response received without canned replies.");
    }

    console.log("/api/chat integration test passed successfully!");
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runChatErrorTests().catch(function handleError(err) {
    console.error("Test failed:", err);
    process.exit(1);
  });
}

module.exports = { runChatErrorTests };
