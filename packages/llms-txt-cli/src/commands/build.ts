import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  collectContent,
  defineConfig,
  render,
  type LLMSConfig
} from "@soya/llms-txt";
import { bundleRequire } from "bundle-require";

export interface BuildCommandOptions {
  config?: string;
  out?: string;
  dryRun?: boolean;
  sitemap?: string;
  maxPages?: number | string;
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

async function loadConfig(configPath: string): Promise<{ config: LLMSConfig; dir: string }> {
  const resolved = path.resolve(configPath);
  const mod = await loadConfigModule(resolved);
  const config = defineConfig(mod);
  const dir = path.dirname(resolved);
  return { config, dir };
}

async function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
}

interface SitemapOverrides {
  url?: string;
  maxPages?: number;
}

function applySitemapOverride(
  config: LLMSConfig,
  overrides: SitemapOverrides
): LLMSConfig {
  const trimmedUrl = overrides.url?.trim();
  const maxPages =
    typeof overrides.maxPages === "number" &&
    Number.isFinite(overrides.maxPages) &&
    overrides.maxPages > 0
      ? Math.floor(overrides.maxPages)
      : undefined;

  if (!trimmedUrl && maxPages === undefined) {
    return config;
  }

  return {
    ...config,
    sources: {
      ...config.sources,
      sitemap: {
        ...(config.sources?.sitemap ?? {}),
        ...(trimmedUrl ? { url: trimmedUrl } : {}),
        ...(maxPages !== undefined ? { maxPages } : {})
      }
    }
  };
}

export async function buildCommand(
  options: BuildCommandOptions
): Promise<void> {
  const configPath = options.config ?? "llms.config.ts";
  const outPath = path.resolve(options.out ?? "public/llms.txt");

  try {
    const { config, dir: configDir } = await loadConfig(configPath);
    let overrideMaxPages: number | undefined;
    if (options.maxPages !== undefined) {
      const raw =
        typeof options.maxPages === "string"
          ? Number.parseInt(options.maxPages, 10)
          : options.maxPages;
      if (Number.isFinite(raw) && raw > 0) {
        overrideMaxPages = Math.floor(raw);
      }
    }

    const effectiveConfig = applySitemapOverride(
      config,
      {
        url: options.sitemap,
        maxPages: overrideMaxPages
      }
    );
    const items = await collectContent(effectiveConfig, {
      cwd: configDir
    });
    const markdown = render(effectiveConfig, items);

    if (options.dryRun) {
      process.stdout.write(markdown);
      return;
    }

    await ensureDir(outPath);
    await writeFile(outPath, markdown, "utf8");
    console.log(`[llms-txt] llms.txt を出力しました: ${outPath}`);
  } catch (error) {
    console.error("[llms-txt] build に失敗しました:", error);
    process.exitCode = 1;
  }
}
