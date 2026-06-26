// Creates .env.local from .env.example on first setup, without overwriting
// an existing .env.local (so your real secrets are never clobbered).
import { existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = join(root, ".env.example");
const local = join(root, ".env.local");

if (existsSync(local)) {
  console.log("✓ .env.local already exists — leaving it untouched.");
} else {
  copyFileSync(example, local);
  console.log("✓ Created .env.local from .env.example — now fill in real values.");
}
