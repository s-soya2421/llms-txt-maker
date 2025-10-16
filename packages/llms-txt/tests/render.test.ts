import { afterEach, describe, expect, it, vi } from "vitest";

import { defineConfig, render, renderFull } from "../src/index.js";
import type { ContentItem } from "../src/types.js";

const baseConfig = defineConfig({
  site: {
    title: "Example Site",
    description: "Example description",
    url: "https://example.com"
  },
  importantLinks: [
    {
      label: "Docs",
      url: "https://example.com/docs"
    }
  ],
  intro:
    "AI 向けのコンテンツ目次です。最初のPRでは最低限の構造のみ生成します。"
});

describe("render", () => {
  it("トップページのタイトルとディスクリプションをヘッダーとして含める", () => {
    const markdown = render(baseConfig);

    expect(markdown).toContain("# Example Site");
    expect(markdown).toContain("Example description");
    expect(markdown).toContain(
      "AI 向けのコンテンツ目次です。最初のPRでは最低限の構造のみ生成します。"
    );
  });

  it("サイトマップから収集したページをセクションとして列挙できる", () => {
    const items: ContentItem[] = [
      {
        title: "Getting Started",
        url: "https://example.com/docs/start",
        summary: "セットアップ手順"
      }
    ];

    const markdown = render(baseConfig, items);
    expect(markdown).toContain("## Getting Started");
    expect(markdown).toContain(
      "- [Getting Started](https://example.com/docs/start)"
    );
  });

  it("タイムスタンプを付与できる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));

    const config = defineConfig({
      ...baseConfig,
      renderOptions: {
        includeTimestamp: true
      }
    });

    const markdown = render(config);
    expect(markdown).toContain(
      "_Generated at: 2024-01-01T00:00:00.000Z_"
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("renderFull", () => {
  it("全文セクションとインデックスを構築する", () => {
    const config = defineConfig({
      ...baseConfig,
      renderOptions: {
        full: {
          maxDocChars: 50,
          maxTotalChars: 100,
          includeIndex: true
        }
      }
    });

    const markdown = renderFull(config, [
      {
        url: "https://example.com/docs/start",
        md: "## Heading\n\n詳細なセットアップ情報。"
      }
    ]);

    expect(markdown).toContain("## Full Content");
    expect(markdown).toContain("### Full Content Index");
    expect(markdown).toContain("- https://example.com/docs/start");
    expect(markdown).toContain("### https://example.com/docs/start");
    expect(markdown).toContain("詳細なセットアップ情報");
  });

  it("PII をマスクしつつサイズ上限で切り詰める", () => {
    const config = defineConfig({
      ...baseConfig,
      renderOptions: {
        redactPII: true,
        full: {
          maxDocChars: 20,
          maxTotalChars: 30,
          includeIndex: false
        }
      }
    });

    const markdown = renderFull(config, [
      {
        url: "https://example.com/contact",
        md: "担当: contact@example.com 電話: 03-1234-5678"
      }
    ]);

    expect(markdown).toContain("[redacted-email]");
    expect(markdown).toContain("[redacted-phone]");
    expect(markdown).toContain("...");
    expect(markdown).toContain(
      "_Content truncated to respect the configured limits._"
    );
  });
});
