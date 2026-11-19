import { describe, expect, test } from "bun:test";
import { linkBetween, parseRef, tracedFrom } from "./change-items.ts";
import { parseDiff } from "./git-diff.ts";

describe("change items", () => {
  test("a link connects items in next views, with the upper item first", () => {
    expect(parseRef("hunk:ab:cd")).toEqual({ kind: "hunk", id: "ab:cd" });
    expect(parseRef("file:x")).toBeNull();
    expect(linkBetween("pseudo:p", "node:n")).toEqual({ from: "node:n", to: "pseudo:p" });
    expect(linkBetween("idea:i", "pseudo:p")).toBe("A link connects an item to an item in the next view up or down.");
  });

  test("tracing goes up and down, but not back down from an item above", () => {
    const links = [
      { from: "idea:one", to: "node:shared" },
      { from: "idea:two", to: "node:shared" },
      { from: "idea:two", to: "node:other" },
      { from: "node:shared", to: "pseudo:p" },
      { from: "pseudo:p", to: "hunk:h" },
    ];
    expect([...tracedFrom("idea:one", links)].sort()).toEqual(["hunk:h", "idea:one", "node:shared", "pseudo:p"]);
    expect([...tracedFrom("pseudo:p", links)].sort()).toEqual(["hunk:h", "idea:one", "idea:two", "node:shared", "pseudo:p"]);
  });
});

describe("parse a diff", () => {
  const diff = [
    "diff --git a/one.ts b/one.ts",
    "index 1111111..2222222 100644",
    "--- a/one.ts",
    "+++ b/one.ts",
    "@@ -1,2 +1,2 @@ const top = 1;",
    " keep",
    "-old",
    "+new",
    "@@ -10,1 +10,1 @@",
    "-old",
    "+new",
    "diff --git a/gone.ts b/gone.ts",
    "deleted file mode 100644",
    "--- a/gone.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-bye",
    "\\ No newline at end of file",
    "",
  ].join("\n");

  test("splits files and hunks, and gives each hunk an id from its file and changed lines", () => {
    const files = parseDiff(diff);
    expect(files.map(({ path, hunks }) => [path, hunks.map(({ header, lines }) => [header, lines])])).toEqual([
      [
        "one.ts",
        [
          ["@@ -1,2 +1,2 @@ const top = 1;", [" keep", "-old", "+new"]],
          ["@@ -10,1 +10,1 @@", ["-old", "+new"]],
        ],
      ],
      ["gone.ts", [["@@ -1 +0,0 @@", ["-bye"]]]],
    ]);
    const [first, second] = files[0]?.hunks ?? [];
    expect(second?.id).toBe(`${first?.id}-2`);
    expect(parseDiff(diff.replace("@@ -1,2 +1,2 @@", "@@ -5,2 +5,2 @@"))[0]?.hunks[0]?.id).toBe(first?.id ?? "");
  });
});
