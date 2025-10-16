import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { collectContent, defineConfig } from "../src/index.js";

async function createTempSitemap(contents: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "llms-sitemap-"));
  const filePath = path.join(dir, "sitemap.xml");
  await writeFile(filePath, contents, "utf8");
  return filePath;
}

describe("collectContent - sitemap source", () => {
  const originalFetch = global.fetch;
  const tempDirs: string[] = [];

  afterEach(async () => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();

    await Promise.all(
      tempDirs.map(async (dir) => {
        try {
          await rm(dir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      })
    );
    tempDirs.length = 0;
  });

  it("サイトマップ経由でページを収集し、タイトルとメタ説明を反映する", async () => {
    const sitemapPath = await createTempSitemap(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
  </url>
  <url>
    <loc>https://example.com/about</loc>
  </url>
</urlset>`);
    tempDirs.push(path.dirname(sitemapPath));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      if (url.endsWith("/")) {
        return new Response(
          `<html><head><title>Home</title><meta name="description" content="Welcome home"></head><body><main><p>Home body</p></main></body></html>`,
          { status: 200 }
        );
      }

      if (url.endsWith("/about")) {
        return new Response(
          `<html><head><title>About</title></head><body><main><h1>About</h1><p>Learn more about us.</p></main></body></html>`,
          { status: 200 }
        );
      }

      return new Response("not found", { status: 404 });
    });

    global.fetch = fetchMock as typeof global.fetch;

    const config = defineConfig({
      site: {
        title: "Example",
        url: "https://example.com"
      },
      sources: {
        sitemap: {
          url: `file://${sitemapPath}`,
          respectRobotsTxt: false,
          maxSummaryChars: 50
        }
      }
    });

    const items = await collectContent(config);
    expect(items).toHaveLength(2);

    const home = items.find((item) => item.url === "https://example.com/");
    expect(home?.title).toBe("Home");
    expect(home?.summary).toBe("Welcome home");

    const about = items.find((item) => item.url === "https://example.com/about");
    expect(about?.title).toBe("About");
    expect(about?.summary).toBe("Learn more about us.");

    expect(fetchMock).toHaveBeenCalled();
  });

  it("マニュアルで登録済みの URL もサイトマップ情報で上書きできる", async () => {
    const sitemapPath = await createTempSitemap(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
  </url>
</urlset>`);
    tempDirs.push(path.dirname(sitemapPath));

    const fetchMock = vi.fn(async () => {
      return new Response(
        `<html><head><title>Home</title><meta name="description" content="Meta description from sitemap"></head><body><main><p>Body</p></main></body></html>`,
        { status: 200 }
      );
    });
    global.fetch = fetchMock as typeof global.fetch;

    const config = defineConfig({
      site: {
        title: "Example",
        url: "https://example.com"
      },
      sources: {
        manual: {
          items: [
            {
              title: "Manual Home",
              url: "https://example.com",
              summary: "Manual summary"
            }
          ]
        },
        sitemap: {
          url: `file://${sitemapPath}`,
          respectRobotsTxt: false
        }
      }
    });

    const items = await collectContent(config);
    expect(items).toHaveLength(1);

    const home = items[0]!;
    expect(home.title).toBe("Home");
    expect(home.summary).toBe("Meta description from sitemap");
    expect(fetchMock).toHaveBeenCalled();
  });
});
