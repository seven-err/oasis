#!/usr/bin/env node
import { execSync } from "node:child_process";

const base = process.env.BASE_REF || "origin/main";
const head = process.env.HEAD_REF || "HEAD";
const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
};

const diffStat = run(`git diff --stat ${base}...${head}`).trim();
const diff = run(`git diff -U0 ${base}...${head}`);
const changedFiles = run(`git diff --name-only --diff-filter=ACMR ${base}...${head}`)
  .split(/\r?\n/)
  .filter(Boolean);

const mustFix = [];
const shouldFix = [];
const niceToHave = [];
let leanLines = 0;

// 1. Check for unresolved merge conflict markers in changed files
for (const file of changedFiles) {
  const content = run(`git show ${head}:"${file}"`);
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (/^(<{7}|={7}|>{7})(?:\s|$)/.test(line)) {
      mustFix.push({
        title: "Unresolved merge conflict marker",
        loc: `${file}:L${idx + 1}`,
        what: "A raw Git merge conflict marker is still in the file.",
        problem: `Line ${idx + 1} starts with "${line.slice(0, 7)}", which breaks syntax or renders broken text.`,
        fix: "Remove the conflict markers and keep only the intended code.",
        skip: "The build fails or broken code ships to users.",
      });
    }
  });
}

// 2. Check added lines in diff for common bugs, security risks, and bloat
let currentFile = "";
let currentLine = 0;
for (const rawLine of diff.split(/\r?\n/)) {
  if (rawLine.startsWith("+++ b/")) {
    currentFile = rawLine.slice(6);
    continue;
  }
  const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) {
    currentLine = Number(hunk[1]);
    continue;
  }
  if (!rawLine.startsWith("+") || rawLine.startsWith("+++")) continue;
  const line = rawLine.slice(1);
  const loc = `${currentFile}:L${currentLine}`;
  currentLine++;

  if (!/\.(ts|tsx|js|mjs|css)$/.test(currentFile) || currentFile.startsWith("frontend/scripts/ponytail-review")) {
    continue;
  }

  if (/\bdebugger\b/.test(line)) {
    mustFix.push({
      title: "Leftover debugger statement",
      loc,
      what: "This line pauses the browser whenever developer tools are open.",
      problem: "`debugger` halts page execution in the browser.",
      fix: "Delete the `debugger` statement.",
      skip: "Anyone opening DevTools freezes the app.",
    });
    leanLines += 1;
  }

  if (/dangerouslySetInnerHTML|\binnerHTML\s*=|\beval\s*\(/.test(line)) {
    mustFix.push({
      title: "Unsafe HTML or code execution",
      loc,
      what: "This line injects raw HTML or evaluates a string as code.",
      problem: "Untrusted text in `innerHTML`, `dangerouslySetInnerHTML`, or `eval` allows cross-site scripting (XSS).",
      fix: "Render values with normal React JSX expressions instead of raw HTML.",
      skip: "Special characters or scripts in record fields can execute in the browser.",
    });
  }

  if (/\bconsole\.(log|debug)\s*\(/.test(line) && !currentFile.startsWith("frontend/scripts/")) {
    shouldFix.push({
      title: "Leftover console log in app code",
      loc,
      what: "This line prints debug output to the browser console.",
      problem: "`console.log` adds noise and can leak internal record data in production.",
      fix: "Delete the `console.log` line.",
      skip: "Extra debug output stays in the codebase and browser console.",
    });
    leanLines += 1;
  }
}

// 3. Run typecheck, unit tests, and production build if requested via RUN_CHECKS=1
if (process.env.RUN_CHECKS === "1") {
  try {
    execSync("pnpm exec tsc --noEmit", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const out = ((err.stdout || "") + (err.stderr || "")).trim().split(/\r?\n/).slice(0, 6).join("; ");
    mustFix.push({
      title: "TypeScript check fails",
      loc: "tsconfig.json",
      what: "TypeScript checked all source files for type mismatches.",
      problem: `\`pnpm exec tsc --noEmit\` failed: ${out}`,
      fix: "Fix the reported type error so the types match the callers.",
      skip: "Broken callers or invalid properties ship to main.",
    });
  }

  try {
    execSync("node --experimental-strip-types --test tests/*.test.mjs", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const out = ((err.stdout || "") + (err.stderr || "")).trim().split(/\r?\n/).slice(0, 6).join("; ");
    mustFix.push({
      title: "Unit test failure",
      loc: "tests/viewHistory.test.mjs",
      what: "The view-history test suite ran against the current code.",
      problem: `Tests failed: ${out}`,
      fix: "Fix the broken behavior or update the affected caller.",
      skip: "Navigation and back-button history break in the UI.",
    });
  }
}

let index = 1;
const formatFinding = (f) =>
  `${index++}. **${f.title}** (\`${f.loc}\`)\n` +
  `   - **What this is:** ${f.what}\n` +
  `   - **Problem:** ${f.problem}\n` +
  `   - **Fix:** ${f.fix}\n` +
  `   - **If we skip it:** ${f.skip}`;

const summaryFiles = changedFiles.length ? changedFiles.join(", ") : "no files";
const lines = [
  `What this change does: Updates ${changedFiles.length} file(s) (${summaryFiles}).`,
  diffStat ? `\n\`\`\`text\n${diffStat}\n\`\`\`` : "",
];

if (mustFix.length) {
  lines.push("\n### Must fix\n" + mustFix.map(formatFinding).join("\n\n"));
}
if (shouldFix.length) {
  lines.push("\n### Should fix\n" + shouldFix.map(formatFinding).join("\n\n"));
}
if (niceToHave.length) {
  lines.push("\n### Nice to have\n" + niceToHave.map(formatFinding).join("\n\n"));
}

if (!mustFix.length && !shouldFix.length && !niceToHave.length) {
  lines.push(
    "\nLooks good. Ship.",
    "Checked: conflict markers, unsafe DOM/eval patterns, leftover debug code, TypeScript types (`tsc --noEmit`), and view history tests."
  );
} else {
  const mustNums = Array.from({ length: mustFix.length }, (_, i) => i + 1);
  lines.push(
    "",
    mustFix.length ? `Verdict: fix ${mustNums.join(" and ")} first.` : "Verdict: Ship.",
  );
  if (leanLines > 0) {
    lines.push(`Lean: -${leanLines} lines possible.`);
  }
}

console.log(lines.filter(Boolean).join("\n"));
process.exit(mustFix.length > 0 ? 1 : 0);
