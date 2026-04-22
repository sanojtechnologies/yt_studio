import { execSync } from "node:child_process";

function getChangedPaths() {
  const output = execSync("git status --porcelain", { encoding: "utf8" }).trimEnd();
  if (!output) return [];

  return output
    .split("\n")
    .map((line) => line.slice(3).trim())
    .map((pathField) => {
      // Handle rename records like: "old/path -> new/path"
      const renameParts = pathField.split(" -> ");
      return renameParts[renameParts.length - 1];
    })
    .filter(Boolean);
}

function isCodePath(path) {
  return (
    path.startsWith("app/") ||
    path.startsWith("components/") ||
    path.startsWith("lib/") ||
    path.startsWith("tests/") ||
    path.startsWith("types/")
  );
}

function main() {
  if (process.env.SKIP_PRD_CHECK === "1") {
    console.log("PRD sync check skipped (SKIP_PRD_CHECK=1).");
    return;
  }

  const changedPaths = getChangedPaths();
  const codeChanged = changedPaths.some(isCodePath);
  if (!codeChanged) return;

  const prdChanged = changedPaths.includes("PRD.md");
  if (prdChanged) return;

  console.error(
    "PRD sync check failed: code changed but PRD.md was not updated.\n" +
      "Update PRD.md in the same change set or set SKIP_PRD_CHECK=1 for a deliberate temporary bypass."
  );
  process.exit(1);
}

main();
