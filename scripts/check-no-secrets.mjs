// Pre-commit guard: blocks committing env files or obvious secrets.
// Runs against STAGED changes only. Fast, conservative (low false positives);
// the deeper scan is gitleaks in CI.
import { execSync } from "node:child_process";

function staged(cmd) {
  return execSync(cmd, { encoding: "utf8" }).split("\n").filter(Boolean);
}

const errors = [];

// 1) Block env files that must never be committed (allow .env.example only).
const stagedFiles = staged("git diff --cached --name-only --diff-filter=ACM");
const envOffenders = stagedFiles.filter((f) => {
  const base = f.split("/").pop() ?? "";
  if (base === ".env.example") return false; // template is allowed
  return /^\.env($|\.)/.test(base); // .env, .env.local, .env.production, ...
});
for (const f of envOffenders) {
  errors.push(`env file should not be committed: ${f}`);
}

// 2) Scan added lines for high-confidence secret patterns.
const SECRET_PATTERNS = [
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    name: "generic API token (sk-/ghp_/xoxb-)",
    re: /\b(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36}|xoxb-[A-Za-z0-9-]{20,})\b/,
  },
];

let diff = "";
try {
  diff = execSync("git diff --cached --unified=0 --diff-filter=ACM", { encoding: "utf8" });
} catch {
  diff = "";
}
for (const line of diff.split("\n")) {
  if (!line.startsWith("+") || line.startsWith("+++")) continue; // only added lines
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(line)) {
      errors.push(`possible ${name} in staged change: ${line.trim().slice(0, 80)}…`);
    }
  }
}

if (errors.length) {
  console.error("\n✖ Commit blocked by secret guard:\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\n  If this is a false positive, review carefully. Real secrets belong in .env.local (gitignored).\n",
  );
  process.exit(1);
}
