// Verifies the running Node version matches the one pinned in .nvmrc.
// Cross-platform (no bash needed) so it works the same on macOS/Linux/Windows/CI.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const required = readFileSync(join(root, ".nvmrc"), "utf8").trim().replace(/^v/, "");
const requiredMajor = Number(required.split(".")[0]);
const currentMajor = Number(process.versions.node.split(".")[0]);

if (currentMajor !== requiredMajor) {
  console.error(
    `\n✖ Node version mismatch.\n` +
      `  Required (.nvmrc): v${requiredMajor}.x\n` +
      `  You are running:   v${process.versions.node}\n\n` +
      `  Fix: run "nvm use" (or install Node ${requiredMajor} LTS), then retry.\n`,
  );
  process.exit(1);
}

console.log(`✓ Node v${process.versions.node} matches required v${requiredMajor}.x`);
