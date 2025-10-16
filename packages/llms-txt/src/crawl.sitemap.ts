import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { load } from "cheerio";
import TurndownService from "turndown";
import { CrawlOptions, Page } from "./types.js";
import packageJson from "../package.json" with { type: "json" };

const version =
  (packageJson as { version?: string }).version ?? "dev";
const USER_AGENT = `@soya/llms-txtbot/${version}`;

export interface CrawlResult {
  pages: Page[];
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

interface Sitemap {
  urlset?: {
    url: SitemapUrl | SitemapUrl[];
  };
  sitemapindex?: {
    sitemap: Array<{ loc: string }> | { loc: string };
  };
}

interface PatternRule {
  raw: string;
  regex: RegExp;
}

interface RobotsGroup {
  allow: PatternRule[];
  disallow: PatternRule[];
}

type RobotsMap = Record<string, RobotsGroup>;

function compilePattern(pattern: string): PatternRule {
  const normalized =
    pattern.trim().length === 0 ? "/" : pattern.trim();
  const withLeadingSlash = normalized.startsWith("/")
    ? normalized
    : `/${normalized}`;
  const escaped = withLeadingSlash
    .split("")
    .map((char) => {
      if (char === "*") {
        return ".*";
      }
      if (char === "$") {
        return "$";
      }
      return char.replace(/([.+?^{}()|[\]\\])/g, "\\$1");
    })
    .join("");
  return {
    raw: withLeadingSlash,
    regex: new RegExp(`^${escaped}`)
  };
}

function parseRobotsTxt(content: string): RobotsMap {
  const groups: RobotsMap = {};
  let currentAgents: string[] = [];
  let hasRulesInBlock = false;

  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const commentIndex = rawLine.indexOf("#");
    const lineWithoutComment =
      commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine;
    const line = lineWithoutComment.trim();

    if (line.length === 0) {
      currentAgents = [];
      hasRulesInBlock = false;
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const directive = line
      .slice(0, separatorIndex)
      .trim()
      .toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (directive === "user-agent") {
      if (hasRulesInBlock) {
        currentAgents = [];
        hasRulesInBlock = false;
      }
      const agent = value.toLowerCase();
      if (agent.length === 0) {
        continue;
      }
      if (!groups[agent]) {
        groups[agent] = { allow: [], disallow: [] };
      }
      currentAgents.push(agent);
      continue;
    }

    if (directive === "allow" || directive === "disallow") {
      if (currentAgents.length === 0) {
        continue;
      }
      hasRulesInBlock = true;

      if (directive === "disallow" && value.length === 0) {
        // Empty disallow means "allow all" → skip.
        continue;
      }

      const rule = compilePattern(value);

      for (const agent of currentAgents) {
        if (!groups[agent]) {
          groups[agent] = { allow: [], disallow: [] };
        }
        groups[agent][directive].push(rule);
      }
      continue;
    }
  }

  return groups;
}

function pickGroupForAgent(
  userAgent: string,
  groups: RobotsMap
): RobotsGroup | undefined {
  const lower = userAgent.toLowerCase();

  if (groups[lower]) {
    return groups[lower];
  }

  const token = lower.split(/[\/\s]/)[0];
  if (token && groups[token]) {
    return groups[token];
  }

  if (groups["*"]) {
    return groups["*"];
  }

  return undefined;
}

function getLongestMatch(
  path: string,
  rules: PatternRule[]
): number {
  let longest = 0;
  for (const rule of rules) {
    const match = path.match(rule.regex);
    if (match && match[0] && match[0].length > longest) {
      longest = match[0].length;
    }
  }
  return longest;
}

function isAllowedByGroup(
  url: URL,
  group: RobotsGroup
): boolean {
  const target = `${url.pathname}${url.search ?? ""}` || "/";
  const longestDisallow = getLongestMatch(target, group.disallow);
  if (longestDisallow === 0) {
    return true;
  }
  const longestAllow = getLongestMatch(target, group.allow);
  return longestAllow >= longestDisallow;
}

class RobotsManager {
  private cache = new Map<string, RobotsMap | null>();

  constructor(private readonly userAgent: string) {}

  async canCrawl(targetUrl: string): Promise<boolean> {
    const url = new URL(targetUrl);
    const rules = await this.loadRules(url.origin);
    if (!rules) {
      return true;
    }

    const group = pickGroupForAgent(this.userAgent, rules);
    if (!group) {
      return true;
    }

    return isAllowedByGroup(url, group);
  }

  private async loadRules(origin: string): Promise<RobotsMap | null> {
    if (this.cache.has(origin)) {
      return this.cache.get(origin) ?? null;
    }

    const robotsUrl = new URL("/robots.txt", origin).toString();
    try {
      const response = await fetchWithRetry(
        robotsUrl,
        {},
        2,
        500
      );
      if (!response.ok) {
        this.cache.set(origin, null);
        return null;
      }
      const text = await response.text();
      const parsed = parseRobotsTxt(text);
      this.cache.set(origin, parsed);
      return parsed;
    } catch {
      this.cache.set(origin, null);
      return null;
    }
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retries = 3,
  delayMs = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = new Headers(init.headers ?? {});
      headers.set("User-Agent", USER_AGENT);
      const response = await fetch(url, {
        ...init,
        headers
      });
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Failed to fetch after retries");
}

async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  let xml: string;

  // ローカルファイルの場合
  if (sitemapUrl.startsWith("file://") || !sitemapUrl.startsWith("http")) {
    const filePath = sitemapUrl.replace("file://", "");
    xml = await readFile(filePath, "utf-8");
    console.log(`[crawl] ローカルファイルから読み込み: ${filePath}`);
  } else {
    // HTTPリクエストの場合
    const response = await fetchWithRetry(sitemapUrl, {
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8"
      }
    });
    xml = await response.text();
    console.log(`[crawl] status: ${response.status}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
  });
  const result: Sitemap = parser.parse(xml);

  // サイトマップインデックスの場合
  if (result.sitemapindex) {
    const sitemaps = Array.isArray(result.sitemapindex.sitemap)
      ? result.sitemapindex.sitemap
      : [result.sitemapindex.sitemap];

    const allUrls: string[] = [];
    for (const sitemap of sitemaps) {
      const urls = await parseSitemap(sitemap.loc);
      allUrls.push(...urls);
    }
    return allUrls;
  }

  // 通常のサイトマップの場合
  if (result.urlset) {
    const urls = Array.isArray(result.urlset.url)
      ? result.urlset.url
      : [result.urlset.url];
    return urls.map((u) => u.loc);
  }

  return [];
}

function shouldIncludeUrl(
  url: string,
  include?: string[],
  exclude?: string[]
): boolean {
  if (exclude) {
    for (const pattern of exclude) {
      if (url.includes(pattern)) return false;
    }
  }

  if (include && include.length > 0) {
    for (const pattern of include) {
      if (url.includes(pattern)) return true;
    }
    return false;
  }

  return true;
}

async function crawlPage(url: string): Promise<Page> {
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const html = await response.text();
    const $ = load(html);

    const title = $("title").first().text().trim() || undefined;
    const description =
      $('meta[name="description"]').attr("content")?.trim() || undefined;

    // 不要な要素を削除
    $("script, style, nav, footer, header").remove();

    // メインコンテンツを抽出
    const content =
      $("main").html() || $("article").html() || $("body").html() || "";

    // Markdownに変換
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced"
    });
    const markdown = turndownService.turndown(content);

    return {
      url,
      status: response.status,
      markdown,
      fetchedAt: new Date().toISOString(),
      title,
      description,
      html: content
    };
  } catch (error) {
    console.error(`Failed to crawl ${url}:`, error);
    return {
      url,
      status: 500,
      markdown: undefined,
      fetchedAt: new Date().toISOString()
    };
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function crawlFromSitemap(
  options: CrawlOptions
): Promise<CrawlResult> {
  const {
    sitemapUrl,
    include,
    exclude,
    concurrency = 5,
    delayMs = 100,
    maxPages,
    respectRobotsTxt
  } = options;

  console.log(`[crawl] サイトマップを解析中: ${sitemapUrl}`);
  const allUrls = await parseSitemap(sitemapUrl);

  const filteredUrls = allUrls
    .filter((url) => shouldIncludeUrl(url, include, exclude))
    .filter(Boolean);

  const shouldRespectRobots =
    respectRobotsTxt !== false && filteredUrls.length > 0;
  const robotsManager = shouldRespectRobots
    ? new RobotsManager(USER_AGENT)
    : undefined;

  const allowedUrls: string[] = [];

  if (robotsManager) {
    for (const url of filteredUrls) {
      try {
        const allowed = await robotsManager.canCrawl(url);
        if (!allowed) {
          console.log(`[crawl] robots.txt により除外: ${url}`);
          continue;
        }
        allowedUrls.push(url);
      } catch (error) {
        console.warn(
          `[crawl] robots.txt 判定に失敗したため許可扱い: ${url}`,
          error
        );
        allowedUrls.push(url);
      }
    }
  } else {
    allowedUrls.push(...filteredUrls);
  }

  const targets =
    typeof maxPages === "number"
      ? allowedUrls.slice(0, maxPages)
      : [...allowedUrls];

  console.log(
    `[crawl] ${targets.length} ページをクロールします (全 ${allUrls.length} ページ中)`
  );

  const pages: Page[] = [];
  const queue = [...targets];

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.all(batch.map((url) => crawlPage(url)));
    pages.push(...batchResults);

    console.log(`[crawl] 進捗: ${pages.length}/${targets.length}`);

    if (queue.length > 0 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(`[crawl] クロール完了: ${pages.length} ページ`);

  return { pages };
}
