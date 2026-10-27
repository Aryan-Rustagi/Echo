const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const BIN_DIR = path.join(BACKEND_ROOT, "bin");
const MODELS_DIR = path.join(BACKEND_ROOT, "models");
const TEMP_DIR = path.join(BACKEND_ROOT, "temp");

// Ensure temp directory exists
try {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
} catch (_e) {}

/**
 * Locate whisper.cpp executable
 */
function findWhisperBinary() {
  if (process.env.WHISPER_CPP_BIN && fs.existsSync(process.env.WHISPER_CPP_BIN)) {
    return process.env.WHISPER_CPP_BIN;
  }

  const isWindows = process.platform === "win32";
  const binaryNames = isWindows
    ? ["whisper-cli.exe", "main.exe", "whisper.exe"]
    : ["whisper-cli", "main", "whisper"];

  for (const name of binaryNames) {
    const candidate = path.join(BIN_DIR, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Locate ggml model weight
 */
function findWhisperModel() {
  if (process.env.WHISPER_CPP_MODEL && fs.existsSync(process.env.WHISPER_CPP_MODEL)) {
    return process.env.WHISPER_CPP_MODEL;
  }

  const modelNames = [
    "ggml-base.en.bin",
    "ggml-tiny.en.bin",
    "ggml-small.en.bin",
    "ggml-base.bin",
    "ggml-tiny.bin",
  ];

  for (const name of modelNames) {
    const candidate = path.join(MODELS_DIR, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 10 * 1024 * 1024) {
      return candidate;
    }
  }

  return null;
}

function isAvailable() {
  return Boolean(findWhisperBinary() && findWhisperModel());
}

function getStatus() {
  const binary = findWhisperBinary();
  const model = findWhisperModel();
  return {
    available: Boolean(binary && model),
    binaryPath: binary,
    modelPath: model,
    engine: "whisper.cpp",
  };
}

/**
 * Transcribe 16kHz WAV buffer using local whisper.cpp binary.
 * @param {Buffer} wavBuffer
 * @returns {Promise<{ transcript: string, durationMs: number }>}
 */
async function transcribeWav(wavBuffer) {
  const binaryPath = findWhisperBinary();
  const modelPath = findWhisperModel();

  if (!binaryPath || !modelPath) {
    throw new Error(
      "Local whisper.cpp engine is not configured or model is missing. Run 'npm run setup:whisper' to install."
    );
  }

  const startTime = Date.now();
  const tempWavPath = path.join(TEMP_DIR, `input_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

  fs.writeFileSync(tempWavPath, wavBuffer);

  return new Promise((resolve, reject) => {
    const args = [
      "-m", modelPath,
      "-f", tempWavPath,
      "-nt", // no timestamps
      "--no-prints", // clean output
      "-l", "en",
    ];

    const child = spawn(binaryPath, args, {
      windowsHide: true,
      timeout: 10000,
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      cleanup();
      reject(new Error(`Failed to execute whisper.cpp: ${err.message}`));
    });

    child.on("close", (code) => {
      cleanup();
      const durationMs = Date.now() - startTime;

      if (code !== 0 && !stdoutData.trim()) {
        return reject(new Error(`whisper.cpp exited with code ${code}: ${stderrData.slice(0, 300)}`));
      }

      // Clean output text: strip [BLANK_AUDIO] or extra whitespace
      let cleanText = stdoutData
        .replace(/\[BLANK_AUDIO\]/gi, "")
        .replace(/\[\d+:\d+:\d+\.\d+ --> \d+:\d+:\d+\.\d+\]/g, "")
        .trim();

      resolve({
        transcript: cleanText,
        durationMs,
      });
    });

    function cleanup() {
      try {
        if (fs.existsSync(tempWavPath)) {
          fs.unlinkSync(tempWavPath);
        }
      } catch (_e) {}
    }
  });
}

module.exports = {
  isAvailable,
  getStatus,
  transcribeWav,
  findWhisperBinary,
  findWhisperModel,
};
