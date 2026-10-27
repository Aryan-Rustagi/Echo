/**
 * Setup script for whisper.cpp on Windows / macOS / Linux.
 * Downloads the ggml-base.en.bin model directly into Backend/models/.
 * On Windows, downloads prebuilt whisper-cli binary into Backend/bin/.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const BACKEND_ROOT = path.resolve(__dirname, "..");
const BIN_DIR = path.join(BACKEND_ROOT, "bin");
const MODELS_DIR = path.join(BACKEND_ROOT, "models");

for (const dir of [BIN_DIR, MODELS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}\n  -> Destination: ${destPath}`);
    const file = fs.createWriteStream(destPath);

    function get(currentUrl) {
      const parsedUrl = new URL(currentUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Echo-Voice-Pipeline",
          Accept: "*/*",
        },
      };

      https.get(options, (response) => {
        // Follow redirects (HTTP 301, 302, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = response.headers.location.startsWith("http")
            ? response.headers.location
            : new URL(response.headers.location, currentUrl).href;
          return get(redirectUrl);
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          return reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        }

        const totalBytes = parseInt(response.headers["content-length"] || "0", 10);
        let downloadedBytes = 0;
        let lastLoggedPercent = 0;

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const percent = Math.floor((downloadedBytes / totalBytes) * 100);
            if (percent - lastLoggedPercent >= 10 || percent === 100) {
              lastLoggedPercent = percent;
              process.stdout.write(`  Progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)\r`);
            }
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log(`\n  ✓ Saved: ${destPath}`);
          resolve(destPath);
        });
      }).on("error", (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    }

    get(url);
  });
}

async function runSetup() {
  console.log("==================================================");
  console.log("  Echo — whisper.cpp Local Open-Source STT Setup  ");
  console.log("==================================================");

  // 1. Download Model (ggml-base.en.bin ~140MB from Hugging Face official ggml repo)
  const modelPath = path.join(MODELS_DIR, "ggml-base.en.bin");
  const EXPECTED_MIN_BYTES = 135 * 1024 * 1024;
  const isModelValid = fs.existsSync(modelPath) && fs.statSync(modelPath).size >= EXPECTED_MIN_BYTES;

  if (!isModelValid) {
    if (fs.existsSync(modelPath)) {
      try { fs.unlinkSync(modelPath); } catch (_e) {}
    }
    console.log("\n[1/2] Downloading ggml-base.en.bin model (~140MB)...");
    const modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
    const tempDest = modelPath + ".tmp";
    await downloadFile(modelUrl, tempDest);
    fs.renameSync(tempDest, modelPath);
    console.log("  ✓ ggml-base.en.bin verified: " + (fs.statSync(modelPath).size / 1024 / 1024).toFixed(1) + "MB");
  } else {
    console.log("\n[1/2] Model already exists and verified: " + modelPath);
  }

  // 2. Platform executable setup
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "whisper-cli.exe" : "whisper-cli";
  const binaryPath = path.join(BIN_DIR, binaryName);

  if (!fs.existsSync(binaryPath)) {
    console.log(`\n[2/2] Fetching ${binaryName} into ${BIN_DIR}...`);
    if (isWindows) {
      const zipPath = path.join(BIN_DIR, "whisper-bin-x64.zip");
      const zipUrl = "https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip";
      try {
        console.log("  Downloading Windows prebuilt binaries from GitHub releases...");
        await downloadFile(zipUrl, zipPath);
        console.log("  Extracting archive...");
        const { execSync } = require("child_process");
        try {
          execSync(`tar -xf "${zipPath}" -C "${BIN_DIR}"`, { stdio: "ignore" });
        } catch (_tarErr) {
          execSync(
            `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`,
            { stdio: "ignore" }
          );
        }
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        console.log("  ✓ Extracted whisper-cli.exe into " + BIN_DIR);
      } catch (dlErr) {
        console.warn("  Could not automatically download Windows binary:", dlErr.message);
        console.log("  Manual install: Download 'whisper-bin-x64.zip' from https://github.com/ggml-org/whisper.cpp/releases and place 'whisper-cli.exe' into " + BIN_DIR);
      }
    } else {
      console.log("  For macOS/Linux: Run 'git clone https://github.com/ggml-org/whisper.cpp && make'");
      console.log(`  and copy the 'whisper-cli' executable into: ${BIN_DIR}`);
    }
  } else {
    console.log(`\n[2/2] Binary verified: ${binaryPath}`);
  }

  const isComplete = fs.existsSync(modelPath) && fs.existsSync(binaryPath);
  console.log(`\nSetup complete! Local open-source STT configured: ${isComplete}`);
  return { modelPath, binaryPath, isComplete };
}

if (require.main === module) {
  runSetup().catch((err) => {
    console.error("\nSetup error:", err.message);
    process.exit(1);
  });
}

module.exports = { runSetup };
