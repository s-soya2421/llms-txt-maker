import path from "node:path";

import type {
  FSSourceConfig,
  LLMSConfig,
  ManualItemConfig,
  SitemapSourceConfig
} from "./config.js";
import type { ContentItem } from "./types.js";
import { collectFromFS } from "./collect.fs.js";
import { collectFromSitemap } from "./collect.sitemap.js";

export interface CollectContentOptions {
  cwd?: string;
}

type AppendMode = "keep-first" | "prefer-incoming";

function normalizeFsSource(
  source: FSSourceConfig,
  cwd: string
): Omit<FSSourceConfig, "dirs"> & { dirs: string[] } {
  const resolvedDirs = source.dirs.map((dir) =>
    path.isAbsolute(dir) ? dir : path.resolve(cwd, dir)
  );

  return {
    ...source,
    dirs: resolvedDirs
  };
}

function normalizeContentUrl(url: string, siteUrl: string): string {
  try {
    const resolved = new URL(url, siteUrl).toString();
    if (resolved.endsWith("/") && resolved.length > 1) {
      return resolved.slice(0, -1);
    }
    return resolved;
  } catch {
    if (url.endsWith("/") && url.length > 1) {
      return url.slice(0, -1);
    }
    return url;
  }
}

function mergeContentItem(
  existing: ContentItem,
  incoming: ManualItemConfig | ContentItem
): ContentItem {
  return {
    title: incoming.title?.trim().length
      ? incoming.title
      : existing.title,
    url: incoming.url ?? existing.url,
    summary:
      incoming.summary !== undefined
        ? incoming.summary
        : existing.summary,
    tags: incoming.tags ?? existing.tags
  };
}

function appendItems(
  destination: ContentItem[],
  items: (ManualItemConfig | ContentItem)[],
  indexByUrl: Map<string, number>,
  siteUrl: string,
  mode: AppendMode
) {
  for (const item of items) {
    if (!item?.url) {
      continue;
    }

    const normalizedUrl = normalizeContentUrl(item.url, siteUrl);
    const existingIndex = indexByUrl.get(normalizedUrl);

    if (existingIndex !== undefined) {
      if (mode === "prefer-incoming") {
        const merged = mergeContentItem(
          destination[existingIndex]!,
          item
        );
        destination[existingIndex] = merged;
      }
      continue;
    }

    indexByUrl.set(normalizedUrl, destination.length);
    destination.push({
      title: item.title,
      url: item.url,
      summary: item.summary,
      tags: item.tags
    });
  }
}

function normalizeSitemapSource(
  source: SitemapSourceConfig,
  siteUrl: string
): SitemapSourceConfig {
  return {
    ...source,
    url: source.url
      ? source.url
      : new URL("/sitemap.xml", siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`).toString()
  };
}

export async function collectContent(
  config: LLMSConfig,
  options: CollectContentOptions = {}
): Promise<ContentItem[]> {
  const cwd = options.cwd ?? process.cwd();
  const results: ContentItem[] = [];
  const indexByUrl = new Map<string, number>();

  if (config.sources.manual?.items) {
    appendItems(
      results,
      config.sources.manual.items,
      indexByUrl,
      config.site.url,
      "keep-first"
    );
  }

  if (config.sources.fs) {
    const fsSource = normalizeFsSource(config.sources.fs, cwd);
    const fsItems = await collectFromFS({
      dirs: fsSource.dirs,
      maxFiles: fsSource.maxFiles,
      maxCharsPerFile: fsSource.maxCharsPerFile
    });
    appendItems(
      results,
      fsItems,
      indexByUrl,
      config.site.url,
      "prefer-incoming"
    );
  }

  if (config.sources.sitemap) {
    const sitemapSource = normalizeSitemapSource(
      config.sources.sitemap,
      config.site.url
    );
    const sitemapItems = await collectFromSitemap(config, sitemapSource);
    appendItems(
      results,
      sitemapItems,
      indexByUrl,
      config.site.url,
      "prefer-incoming"
    );
  }

  return results;
}
