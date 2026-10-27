import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Push a one-commit snapshot of a committed branch to a Hugging Face Space.
// Spaces reject plain-git binary files, so the PNG screenshots are left out and
// no history is sent. Only tracked files are included: .env files never are.
// Usage: npm run deploy:space -- [remote=space] [ref=HEAD] [--dry-run]
const args = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const remote = args[0] ?? "space";
const ref = args[1] ?? "HEAD";
const EXCLUDED = ["docs/screenshots"];

const git = (gitArgs, env = {}) =>
  execFileSync("git", gitArgs, { encoding: "utf8", env: { ...process.env, ...env } }).trim();

const url = git(["remote", "get-url", remote]);
if (!/^https:\/\/huggingface\.co\/spaces\/[\w.-]+\/[\w.-]+(\.git)?$/.test(url))
  throw new Error(`Remote "${remote}" is not a Hugging Face Space URL.`);
if (git(["status", "--porcelain", "--untracked-files=no"]))
  console.log("Note: uncommitted changes are not deployed; only the committed snapshot is pushed.");

// A temporary index builds the snapshot without touching the working tree or branches.
const index = resolve(git(["rev-parse", "--absolute-git-dir"]), "space-deploy-index");
try {
  const env = { GIT_INDEX_FILE: index };
  git(["read-tree", ref], env);
  git(["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", ...EXCLUDED], env);
  const tree = git(["write-tree"], env);
  const files = git(["ls-files"], env).split("\n").filter(Boolean);
  const source = git(["rev-parse", "--short", ref]);
  const commit = git(["commit-tree", tree, "-m", `Deploy ${source} from GitHub (screenshots omitted)`]);
  console.log(`Snapshot ${commit.slice(0, 7)} of ${ref} (${source}): ${files.length} files → ${url}`);
  if (dryRun) {
    console.log(files.join("\n"));
  } else {
    // The Space repository is only a build target; replacing its history is intended.
    execFileSync("git", ["push", "--force", remote, `${commit}:refs/heads/main`], { stdio: "inherit" });
  }
} finally {
  rmSync(index, { force: true });
}
