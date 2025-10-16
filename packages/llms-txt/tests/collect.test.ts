import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  collectContent,
  defineConfig
} from "../src/index.js";

async function createFsFixture(structure: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "llms-fs-src-"));

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
        // ignore cleanup errors
      }
    })
  );
});

describe("collectContent", () => {
  it("マニュアル項目と FS 収集結果を統合する", async () => {
    const fsRoot = await createFsFixture({
      "docs/guide.md": `# Guide

This is a guide page.
`
    });
    tempDirs.push(fsRoot);

    const config = defineConfig({
      site: {
        title: "Example",
        url: "https://example.com"
      },
      sources: {
        manual: {
          items: [
            {
              title: "Overview",
              url: "https://example.com/overview",
              summary: "Manual summary"
            }
          ]
        },
        fs: {
          dirs: [fsRoot]
        }
      }
    });

    const items = await collectContent(config);
    const urls = items.map((item) => item.url);

    expect(urls).toContain("https://example.com/overview");
    expect(urls).toContain("/docs/guide");
  });

  it("重複 URL を除外する", async () => {
    const fsRoot = await createFsFixture({
      "index.md": `# Overview

Manual override test.
`
    });
    tempDirs.push(fsRoot);

    const config = defineConfig({
      site: {
        title: "Example",
        url: "https://example.com"
      },
      sources: {
        manual: {
          items: [
            {
              title: "Overview",
              url: "/",
              summary: "Manual summary"
            }
          ]
        },
        fs: {
          dirs: [fsRoot]
        }
      }
    });

    const items = await collectContent(config, {
      cwd: fsRoot
    });

    const duplicates = items.filter((item) => item.url === "/");
    expect(duplicates).toHaveLength(1);
  });
});

