import { createHash } from "node:crypto";
import type { ChangeDiff, DiffHunk } from "./model.ts";

type DiffFile = ChangeDiff["files"][number];

const hunkId = (path: string, lines: string[]) =>
  createHash("sha1")
    .update([path, ...lines.filter((line) => line.startsWith("+") || line.startsWith("-"))].join("\n"))
    .digest("hex")
    .slice(0, 12);

const pathOf = (line: string) => {
  const path = line.slice(4).replace(/\t.*$/, "");
  return path === "/dev/null" ? null : path.replace(/^[ab]\//, "");
};

// Splits the output of git diff into files and hunks. Two hunks with the same changed lines in one file get a number
// after their id.
export const parseDiff = (text: string): DiffFile[] => {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldPath: string | null = null;
  const close = () => {
    if (file == null || hunk == null) return;
    const id = hunkId(file.path, hunk.lines);
    const same = file.hunks.filter((other) => other.id === id || other.id.startsWith(`${id}-`)).length;
    file.hunks.push({ ...hunk, id: same === 0 ? id : `${id}-${same + 1}` });
    hunk = null;
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      close();
      file = null;
      oldPath = null;
    } else if (line.startsWith("--- ") && hunk == null) {
      oldPath = pathOf(line);
    } else if (line.startsWith("+++ ") && hunk == null) {
      file = { path: pathOf(line) ?? oldPath ?? "", hunks: [] };
      files.push(file);
    } else if (line.startsWith("@@") && file != null) {
      close();
      hunk = { id: "", header: line, lines: [] };
    } else if (hunk != null && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      hunk.lines.push(line);
    } else if (line.startsWith("\\")) {
      continue;
    } else {
      close();
    }
  }
  close();
  return files;
};

export class GitError extends Error {}

const checkRef = (name: string, ref: string) => {
  if (ref.trim() === "") throw new GitError(`The change has no ${name} branch.`);
  if (ref.startsWith("-")) throw new GitError(`The ${name} branch cannot start with "-".`);
};

// The diff of the branch from the point where it left the base branch (git diff base...branch).
export const branchDiff = (repo: string, base: string, branch: string): ChangeDiff => {
  if (repo.trim() === "") throw new GitError("The change has no repository.");
  checkRef("base", base);
  checkRef("change", branch);
  const result = Bun.spawnSync(["git", "-C", repo, "diff", "--no-color", "--no-ext-diff", `${base}...${branch}`, "--"], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    const message = result.stderr.toString().trim().split("\n")[0] ?? "";
    throw new GitError(`git diff failed: ${message === "" ? `exit code ${result.exitCode}` : message}`);
  }
  return { base, branch, files: parseDiff(result.stdout.toString()) };
};
