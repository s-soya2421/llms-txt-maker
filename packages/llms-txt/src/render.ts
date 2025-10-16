import {
  type FullRenderOptions,
  type LLMSConfig
} from "./config.js";
import { ContentItem } from "./types.js";
import { redactPII } from "./utils.js";

function normalizeUrl(value: string, base: string): string {
  try {
    const resolved = new URL(value, base);
    const url = resolved.toString();
    return url.endsWith("/") && url.length > 1 ? url.slice(0, -1) : url;
  } catch {
    return value.endsWith("/") && value.length > 1
      ? value.slice(0, -1)
      : value;
  }
}

function findHomepageItem(
  items: ContentItem[],
  siteUrl: string
): ContentItem | undefined {
  const normalizedSiteUrl = normalizeUrl(siteUrl, siteUrl);
  return items.find((item) => {
    const normalizedItemUrl = normalizeUrl(item.url, siteUrl);
    return normalizedItemUrl === normalizedSiteUrl;
  });
}

function sanitizeHeading(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/\s+/g, " ");
}

export function render(
  config: LLMSConfig,
  items: ContentItem[] = []
): string {
  const lines: string[] = [];
  const { site, renderOptions } = config;

  const homepageItem = findHomepageItem(items, site.url);
  const headingTitle =
    sanitizeHeading(homepageItem?.title) ||
    sanitizeHeading(site.title) ||
    sanitizeHeading(site.url) ||
    "Site";
  const headingDescription =
    sanitizeHeading(homepageItem?.summary) ||
    sanitizeHeading(site.description);

  lines.push(`# ${headingTitle}`);
  if (headingDescription) {
    lines.push("", headingDescription);
  }

  const intro = config.intro?.trim();
  if (intro) {
    lines.push("", intro);
  }

  for (const item of items) {
    const heading = sanitizeHeading(item.title) || item.url;
    const linkLabel = sanitizeHeading(item.title) || item.url;

    lines.push("", `## ${heading}`, "", `- [${linkLabel}](${item.url})`);
  }

  if (renderOptions.includeTimestamp) {
    lines.push("", `_Generated at: ${new Date().toISOString()}_`);
  }

  const output = lines.join("\n").trim() + "\n";
  if (renderOptions.redactPII) {
    return redactPII(output, true);
  }
  return output;
}

interface ProcessedDoc {
  url: string;
  content: string;
  truncated: boolean;
}

interface TruncateResult {
  value: string;
  truncated: boolean;
  consumed: number;
}

function computeConsumedLength(
  text: string,
  treatPlaceholdersAsZero: boolean
): number {
  if (!treatPlaceholdersAsZero) {
    return text.length;
  }
  return text.replace(/\[redacted-[^\]]+\]/g, "").length;
}

function truncateContent(
  text: string,
  docLimit: number,
  totalLimit: number,
  treatPlaceholdersAsZero: boolean
): TruncateResult {
  const effectiveDocLimit = Number.isFinite(docLimit)
    ? docLimit
    : Number.POSITIVE_INFINITY;
  const effectiveTotalLimit = Number.isFinite(totalLimit)
    ? totalLimit
    : Number.POSITIVE_INFINITY;
  const limit = Math.min(effectiveDocLimit, effectiveTotalLimit);

  if (!Number.isFinite(limit) || limit < 0) {
    return {
      value: text,
      truncated: false,
      consumed: computeConsumedLength(text, treatPlaceholdersAsZero)
    };
  }

  let consumed = 0;
  let index = 0;
  let result = "";
  let truncated = false;

  while (index < text.length) {
    if (
      treatPlaceholdersAsZero &&
      text[index] === "[" &&
      text.slice(index).startsWith("[redacted-")
    ) {
      const closing = text.indexOf("]", index);
      if (closing === -1) {
        truncated = true;
        break;
      }
      result += text.slice(index, closing + 1);
      index = closing + 1;
      continue;
    }

    const remaining = limit - consumed;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    result += text[index]!;
    consumed += 1;
    index += 1;
  }

  if (index < text.length) {
    truncated = true;
  }

  if (truncated) {
    result = result.trimEnd();
    if (!result.endsWith("...")) {
      result = `${result}...`;
    }
  }

  return {
    value: result,
    truncated,
    consumed
  };
}

function processDocs(
  docs: { url: string; md: string }[],
  options: FullRenderOptions,
  redactSensitive: boolean
): ProcessedDoc[] {
  const processed: ProcessedDoc[] = [];
  let remainingChars = options.maxTotalChars;

  const docsToProcess =
    typeof options.maxDocs === "number"
      ? docs.slice(0, options.maxDocs)
      : docs;

  for (const doc of docsToProcess) {
    if (remainingChars <= 0) {
      break;
    }

    const trimmed = doc.md.trim();
    if (!trimmed.length) {
      continue;
    }

    const baseContent = redactSensitive
      ? redactPII(trimmed, true)
      : trimmed;
    const totalLimitBefore = remainingChars;

    const { value, truncated, consumed } = truncateContent(
      baseContent,
      options.maxDocChars,
      remainingChars,
      redactSensitive
    );

    remainingChars -= consumed;
    if (remainingChars < 0) {
      remainingChars = 0;
    }

    const docLimitExceeded = trimmed.length > options.maxDocChars;
    const totalLimitExceeded = trimmed.length > totalLimitBefore;

    let finalContent = value;
    const finalTruncated =
      truncated || docLimitExceeded || totalLimitExceeded;

    if (finalTruncated && !finalContent.endsWith("...")) {
      finalContent = `${finalContent.trimEnd()}...`;
    }

    processed.push({
      url: doc.url,
      content: finalContent,
      truncated: finalTruncated
    });
  }

  return processed;
}

export function renderFull(
  config: LLMSConfig,
  docs: { url: string; md: string }[] = []
): string {
  const base = render(config).trimEnd();
  const options = config.renderOptions.full;
  const processedDocs = processDocs(
    docs,
    options,
    config.renderOptions.redactPII
  );

  const lines: string[] = [base, "", `## ${options.heading}`];

  if (!processedDocs.length) {
    lines.push("- (本文はまだ収集されていません)");
  } else {
    if (options.includeIndex) {
      lines.push("", `### ${options.indexHeading}`);
      lines.push(
        ...processedDocs.map((doc) => {
          const flag = doc.truncated ? " _(truncated)_" : "";
          return `- ${doc.url}${flag}`;
        })
      );
    }

    for (const doc of processedDocs) {
      lines.push("", `### ${doc.url}`, doc.content);
      if (doc.truncated) {
        lines.push(
          "",
          "> _Content truncated to respect the configured limits._"
        );
      }
    }
  }

  const output = lines.join("\n").trim() + "\n";

  if (config.renderOptions.redactPII) {
    return redactPII(output, true);
  }

  return output;
}
