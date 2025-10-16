import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { collectFromFS } from "../src/index.js";

async function createFixture(structure: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "llms-fs-"));

  await Promise.all(
    Object.entries(structure).map(async ([relativePath, content]) => {
      const fullPath = path.join(root, relativePath);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf8");
    })
  );

  return root;
}

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // noop
      }
    })
  );
});

describe("collectFromFS", () => {
  it("Frontmatter のメタデータを優先して収集する", async () => {
    const root = await createFixture({
      "index.md": `---
title: ホーム
description: プロジェクトの概要
url: https://example.com/
tags:
  - overview
---

# ホーム

ようこそ。
`,
      "docs/getting-started.mdx": `# Getting Started

セットアップ手順を解説します。
`
    });
    tempDirs.push(root);

    const items = await collectFromFS({ dirs: [root] });
    expect(items).toHaveLength(2);

    const home = items.find((item) => item.url === "https://example.com/");
    expect(home?.title).toBe("ホーム");
    expect(home?.summary).toBe("プロジェクトの概要");
    expect(home?.tags).toEqual(["overview"]);

    const gettingStarted = items.find((item) =>
      item.url.endsWith("/docs/getting-started")
    );
    expect(gettingStarted?.title).toBe("Getting Started");
    expect(gettingStarted?.summary).toContain("セットアップ手順");
  });

  it("maxFiles と maxCharsPerFile の制限を尊重する", async () => {
    const root = await createFixture({
      "docs/a.md": "# A\n\n".concat("A".repeat(100)),
      "docs/b.md": "# B\n\n".concat("B".repeat(100))
    });
    tempDirs.push(root);

    const items = await collectFromFS({
      dirs: [root],
      maxFiles: 1,
      maxCharsPerFile: 10
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.summary).toMatch(/\.\.\.$/);
    expect(items[0]?.summary?.length).toBeLessThanOrEqual(13); // 10 chars + ellipsis
  });

  it("summary 生成時にリンクテキストを保持する", async () => {
    const root = await createFixture({
      "docs/link.md": `# Link Test

First paragraph references the [Guide](https://example.com/docs/guide).
`
    });
    tempDirs.push(root);

    const items = await collectFromFS({ dirs: [root] });
    expect(items).toHaveLength(1);
    expect(items[0]?.summary).toContain("Guide");
    expect(items[0]?.summary).not.toContain("$1");
  });
});
