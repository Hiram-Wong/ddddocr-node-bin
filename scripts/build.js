const fs = require("fs");
const path = require("path");
const { exec } = require("@yao-pkg/pkg");

const NODE_VERSION = "24";
const DIST_DIR = path.resolve(__dirname, "../dist");
// const TMP_BASE = path.resolve(__dirname, "../.tmp");

const DEFAULT_PLATFORM = ["macos", "win", "linux"];
const DEFAULT_ARCH = ["x64", "arm64"];

/**
 * 解析 CLI 参数
 */
const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {};

  args.forEach(arg => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    result[key] = value;
  });

  const parseList = (val, def) => {
    if (!val) return def;
    return val.split(",").map(v => v.trim()).filter(Boolean);
  };

  return {
    platform: parseList(result.platform, DEFAULT_PLATFORM),
    arch: parseList(result.arch, DEFAULT_ARCH),
  };
};

/**
 * 构建单个目标
 */
const buildOne = async (platform, arch) => {
  const ext = platform === "win" ? ".exe" : "";
  
  const target = `node${NODE_VERSION}-${platform}-${arch}`;
  const output = `ocr-bin-${platform}-${arch}${ext}`;
  const outputPath = path.join(DIST_DIR, output);

  console.log(`\n🚀 Building: ${target}`);
  console.log(`📦 Output: ${outputPath}`);

  await exec([
    "./index.js",
    "--config", "package.json",
    "--target", target,
    "--output", outputPath,
    "--options", "max-old-space-size=8192",
    "--compress", "Gzip", // Gzip Brotli(so slow)
  ]);
  
  console.log(`✅ Done: ${outputPath}`);
};

/**
 * 构建入口
 */
const main = async () => {
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const { platform, arch } = parseArgs();

  console.log("📌 Platform:", platform.join(", "));
  console.log("📌 Arch:", arch.join(", "));

  try {
    for (const p of platform) {
      for (const a of arch) {
        await buildOne(p, a);
      }
    }

    console.log("\n🎉 All builds completed!");
  } catch (err) {
    console.error("\n❌ Build failed:", err);
    process.exit(1);
  }
};

main();