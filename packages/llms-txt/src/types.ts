export interface ImportantLink {
  label: string;
  url: string;
  description?: string;
}

export interface ContentItem {
  title: string;
  url: string;
  summary?: string;
  tags?: string[];
}

export interface Page {
  url: string;
  status?: number;
  markdown?: string;
  fetchedAt?: string;
  title?: string;
  description?: string;
  html?: string;
}

export interface CrawlOptions {
  sitemapUrl: string;
  include?: string[];
  exclude?: string[];
  concurrency?: number;
  delayMs?: number;
  respectRobotsTxt?: boolean;
  maxPages?: number;
}

export interface CMSFetchOptions {
  cms: "strapi" | "microcms";
  baseUrl: string;
  collection: string;
  fields?: Record<string, string>;
  urlTemplate?: string;
  tokenEnv?: string;
}
