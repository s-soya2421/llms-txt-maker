import type { LLMSConfig, SitemapSourceConfig } from "./config.js";
import type { ContentItem, Page } from "./types.js";
import { crawlFromSitemap } from "./crawl.sitemap.js";

interface BuildItemOptions {
  maxSummaryChars?: number;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, (_, label) => label)
    .replace(/[`*_~>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSummary(
  page: Page,
  options: BuildItemOptions
): string | undefined {
  const maxChars = options.maxSummaryChars ?? 240;

  if (page.description && page.description.trim().length > 0) {
    return limitLength(page.description.trim(), maxChars);
  }

  if (page.markdown) {
    const blocks = page.markdown.split(/\n{2,}/);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (trimmed.length === 0) {
        continue;
      }
      if (/^#{1,6}\s/.test(trimmed)) {
        continue;
      }
      const plain = stripMarkdown(block);
      if (plain.length === 0) {
        continue;
      }
      return limitLength(plain, maxChars);
    }
  }

  return undefined;
}

function limitLength(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}...`;
}

function createContentItem(
  page: Page,
  options: BuildItemOptions
): ContentItem | undefined {
  if (!page.url) {
    return undefined;
  }

  if (page.status && page.status >= 400) {
    return undefined;
  }

  const title = page.title?.trim() || page.url;
  const summary = pickSummary(page, options);

  return {
    title,
    url: page.url,
    summary
  };
}

function buildSitemapUrl(siteUrl: string, source: SitemapSourceConfig): string {
  if (source.url) {
    return source.url;
  }
  const normalized = siteUrl.endsWith("/")
    ? siteUrl.slice(0, -1)
    : siteUrl;
  return new URL("/sitemap.xml", `${normalized}/`).toString();
}

export async function collectFromSitemap(
  config: LLMSConfig,
  source: SitemapSourceConfig
): Promise<ContentItem[]> {
  const sitemapUrl = buildSitemapUrl(config.site.url, source);
  const { pages } = await crawlFromSitemap({
    sitemapUrl,
    include: source.include,
    exclude: source.exclude,
    concurrency: source.concurrency,
    delayMs: source.delayMs,
    respectRobotsTxt: source.respectRobotsTxt,
    maxPages: source.maxPages
  });

  const items: ContentItem[] = [];
  for (const page of pages) {
    const item = createContentItem(page, {
      maxSummaryChars: source.maxSummaryChars
    });
    if (item) {
      items.push(item);
    }
  }

  return items;
}
