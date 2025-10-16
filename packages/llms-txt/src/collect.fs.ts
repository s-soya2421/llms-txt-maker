import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

import { ContentItem } from "./types.js";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);

interface ParsedFile {
  path: string;
  title: string;
  summary?: string;
  tags?: string[];
  url: string;
}

async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await walkMarkdownFiles(entryPath);
      files.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (MARKDOWN_EXTENSIONS.has(ext)) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function normalizeRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function deriveUrl(relativePath: string): string {
  if (/^index\.(md|mdx|markdown)$/i.test(relativePath)) {
    return "/";
  }

  const withoutExt = relativePath.replace(/\.(md|mdx|markdown)$/i, "");
  const normalized = withoutExt.endsWith("/index")
    ? withoutExt.slice(0, -"/index".length)
    : withoutExt;
  const segments = normalized.split("/").filter(Boolean);
  const url = `/${segments.join("/")}`;
  return url === "/" ? "/" : url;
}

function pickTitle(
  data: matter.GrayMatterFile<string>,
  fallback: string
): string {
  const dataTitle = (data.data as Record<string, unknown>).title;
  if (typeof dataTitle === "string" && dataTitle.trim().length > 0) {
    return dataTitle.trim();
  }

  const match = data.content.match(/^#{1,6}\s+(.+)/m);
  if (match) {
    return match[1].trim();
  }

  return fallback;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, (_, label) => label)
    .replace(/[`*_~>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSummary(
  data: matter.GrayMatterFile<string>,
  maxChars: number | undefined
): string | undefined {
  const frontmatterSummary = (data.data as Record<string, unknown>)
    .description;
  if (
    typeof frontmatterSummary === "string" &&
    frontmatterSummary.trim().length > 0
  ) {
    return limitLength(frontmatterSummary.trim(), maxChars);
  }

  const blocks = data.content.split(/\n{2,}/);

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

  return undefined;
}

function normalizeTags(tags: unknown): string[] | undefined {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter((tag) => tag.length > 0);
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return undefined;
}

function limitLength(
  text: string,
  maxChars: number | undefined
): string {
  if (!maxChars || maxChars <= 0) {
    return text;
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars).trimEnd()}...`;
}

async function parseMarkdownFile(
  rootDir: string,
  filePath: string,
  options: CollectFromFSOptions
): Promise<ParsedFile | undefined> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);

  const relative = normalizeRelativePath(rootDir, filePath);
  const fallbackTitle = path
    .basename(relative)
    .replace(/\.(md|mdx|markdown)$/i, "");
  const title = pickTitle(parsed, fallbackTitle);
  const summary = pickSummary(parsed, options.maxCharsPerFile);
  const tags = normalizeTags((parsed.data as Record<string, unknown>).tags);

  const frontmatterUrl = (parsed.data as Record<string, unknown>).url;
  const url =
    typeof frontmatterUrl === "string" && frontmatterUrl.trim().length > 0
      ? frontmatterUrl.trim()
      : deriveUrl(relative);

  return {
    path: relative,
    title,
    summary,
    tags,
    url
  };
}

export interface CollectFromFSOptions {
  dirs: string[];
  maxFiles?: number;
  maxCharsPerFile?: number;
}

export async function collectFromFS(
  options: CollectFromFSOptions
): Promise<ContentItem[]> {
  const seen = new Set<string>();
  const results: ContentItem[] = [];

  if (!Array.isArray(options.dirs) || options.dirs.length === 0) {
    return results;
  }

  const normalizedDirs = options.dirs.map((dir) => path.resolve(dir));
  const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY;

  for (const dir of normalizedDirs) {
    if (results.length >= maxFiles) {
      break;
    }

    let files: string[] = [];

    try {
      files = await walkMarkdownFiles(dir);
      files.sort();
    } catch (error) {
      console.warn(
        `[llms-txt] collectFromFS: Failed to read directory "${dir}":`,
        error
      );
      continue;
    }

    for (const file of files) {
      if (results.length >= maxFiles) {
        break;
      }

      if (seen.has(file)) {
        continue;
      }

      try {
        const parsed = await parseMarkdownFile(
          dir,
          file,
          options
        );

        if (!parsed) {
          continue;
        }

        seen.add(file);
        results.push({
          title: parsed.title,
          url: parsed.url,
          summary: parsed.summary,
          tags: parsed.tags
        });
      } catch (error) {
        console.warn(
          `[llms-txt] collectFromFS: Failed to parse "${file}":`,
          error
        );
      }
    }
  }

  return results;
}
