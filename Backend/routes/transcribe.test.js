const assert = require("assert");
const {
  normalizePhrase,
  isWhisperHallucination,
} = require("./transcribe");

function runWhisperFilterTests() {
  console.log("Running Whisper filter tests...");

  // 1. Phrase normalization
  assert.strictEqual(
    normalizePhrase("Thank you for watching!"),
    "thank you for watching",
    "Should strip punctuation and lowercase"
  );
  assert.strictEqual(
    normalizePhrase("  Thanks.  "),
    "thanks",
    "Should trim whitespace and strip trailing period"
  );

  // 2. Short clip (< 1.5s) hallucinations should be filtered
  assert.strictEqual(
    isWhisperHallucination("Thank you.", 1.2, 0.1),
    true,
    "Should filter 'Thank you.' on short clips under 1.5s"
  );
  assert.strictEqual(
    isWhisperHallucination("Thanks for watching!", 0.8, 0.05),
    true,
    "Should filter 'Thanks for watching!' on short clips under 1.5s"
  );

  // 3. High no_speech_prob (> 0.45) on longer clips should also be filtered
  assert.strictEqual(
    isWhisperHallucination("Thank you for watching.", 4.5, 0.75),
    true,
    "Should filter hallucination on longer clip with high no_speech_prob"
  );

  // 4. Legitimate speech must NOT be filtered
  assert.strictEqual(
    isWhisperHallucination("Thank you for meeting with me today to discuss the project.", 3.5, 0.05),
    false,
    "Should NOT filter normal conversation containing thank you with low no_speech_prob and longer duration"
  );
  assert.strictEqual(
    isWhisperHallucination("What is the capital of France?", 1.1, 0.02),
    false,
    "Should NOT filter non-hallucination queries even on short clips"
  );

  // 5. Local Whisper Service API check
  const localWhisper = require("../services/localWhisper");
  const status = localWhisper.getStatus();
  assert.strictEqual(status.engine, "whisper.cpp", "Status engine must report whisper.cpp");
  assert(typeof status.available === "boolean", "status.available must be boolean");
  console.log("Local whisper status check passed:", status);

  console.log("All Whisper filter tests passed successfully!");
}

if (require.main === module) {
  runWhisperFilterTests();
}

module.exports = { runWhisperFilterTests };
