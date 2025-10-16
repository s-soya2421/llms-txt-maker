import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  crawlFromSitemap,
  defineConfig,
  type LLMSConfig
} from "@soya/llms-txt";
import { bundleRequire } from "bundle-require";

export interface CrawlCommandOptions {
  sitemap?: string;
  config?: string;
  include?: string;
  exclude?: string;
  out?: string;
  maxPages?: string;
  concurrency?: string;
  delayMs?: string;
}

async function loadConfigModule(resolvedPath: string): Promise<unknown> {
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === ".json") {
    const raw = await readFile(resolvedPath, "utf8");
    return JSON.parse(raw);
  }

  const { mod } = await bundleRequire({
    filepath: resolvedPath
  });

  if (mod?.default) {
    return mod.default;
  }

  if (mod?.config) {
    return mod.config;
  }

  return mod;
}

async function loadConfig(
  configPath: string
): Promise<{ config: LLMSConfig; dir: string }> {
  const resolved = path.resolve(configPath);
  const mod = await loadConfigModule(resolved);
  const config = defineConfig(mod);
  const dir = path.dirname(resolved);
  return { config, dir };
}

async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });
}

export async function crawlCommand(
  options: CrawlCommandOptions
): Promise<void> {
  try {
    // configファイルを読み込み
    const configPath = options.config ?? "llms.config.ts";
    const { config } = await loadConfig(configPath);

    // サイトマップURLを構築
    let sitemapUrl: string;
    if (options.sitemap) {
      // 絶対URL、file://、またはローカルパスの場合はそのまま使用
      if (
        options.sitemap.startsWith("http://") ||
        options.sitemap.startsWith("https://") ||
        options.sitemap.startsWith("file://") ||
        options.sitemap.startsWith("/") ||
        options.sitemap.startsWith("./") ||
        options.sitemap.startsWith("../")
      ) {
        sitemapUrl = options.sitemap;
      } else {
        // それ以外は相対パスとしてconfigのURLと結合
        const baseUrl = config.site.url.replace(/\/$/, "");
        sitemapUrl = `${baseUrl}/${options.sitemap}`;
      }
    } else {
      // デフォルトはドメイン/sitemap.xml
      const baseUrl = config.site.url.replace(/\/$/, "");
      sitemapUrl = `${baseUrl}/sitemap.xml`;
    }

    console.log(`[llms-txt] サイトマップURL: ${sitemapUrl}`);

    // クロールオプションを構築
    const crawlOptions = {
      sitemapUrl,
      include: options.include ? options.include.split(",") : undefined,
      exclude: options.exclude ? options.exclude.split(",") : undefined,
      maxPages: options.maxPages ? Number.parseInt(options.maxPages, 10) : undefined,
      concurrency: options.concurrency
        ? Number.parseInt(options.concurrency, 10)
        : 5,
      delayMs: options.delayMs ? Number.parseInt(options.delayMs, 10) : 100
    };

    // クロール実行
    const result = await crawlFromSitemap(crawlOptions);

    // 結果を保存
    const outDir = options.out ?? "./txtDir";
    await ensureDir(outDir);

    let savedCount = 0;
    for (const page of result.pages) {
      // markdownが取得できていれば保存（statusは問わない）
      if (page.markdown) {
        // URLからファイル名を生成
        const url = new URL(page.url);
        let filename = url.pathname.replace(/\//g, "_").replace(/^_/, "");
        if (!filename || filename === "") {
          filename = "index";
        }
        filename = `${filename}.md`;

        const filePath = path.join(outDir, filename);

        // フロントマターを追加
        const content = `---
title: ${url.pathname}
url: ${page.url}
fetchedAt: ${page.fetchedAt}
---

${page.markdown}
`;

        await writeFile(filePath, content, "utf8");
        savedCount++;
      }
    }

    console.log(
      `[llms-txt] クロール完了: ${savedCount}/${result.pages.length} ページを保存しました`
    );
    console.log(`[llms-txt] 出力先: ${path.resolve(outDir)}`);
  } catch (error) {
    console.error("[llms-txt] crawl に失敗しました:", error);
    process.exitCode = 1;
  }
}

