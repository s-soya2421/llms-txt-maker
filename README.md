# @soya/llms-txt Monorepo

Toolchain for generating AI-friendly Markdown indexes (`llms.txt` and `llms-full.txt`) for web projects. The workspace bundles a core library, a Next.js adapter, and a CLI so teams can surface documentation and content to language models without manual curation.

## Packages

- **`@soya/llms-txt`**  
  Core rendererとコレクタ。`defineConfig`, `render`, `renderFull`, `collectContent`, `collectFromFS` などを提供します。
- **`@soya/llms-txt-next`**  
  Helper to expose `llms.txt` via Next.js routes with sensible defaults.
- **`@soya/llms-txt-cli`**  
  Commander ベースの CLI で `llms.config.ts` を読み込み、コレクタを実行し `public/llms.txt` を生成します（`--sitemap` や `--max-pages` で一時的な上書きも可能）。
- **Examples**  
  `examples/next-app` (work in progress) demonstrates how to ship an `/llms.txt` endpoint.

## Features

- Render concise or full-text LLM indexes. `render` はサイトマップ由来のページタイトル／ディスクリプションを先頭に据え、以降の各ページを `##` 見出し + 単一リンクで列挙します。
- Collect sources from manual entries, local Markdown/MDX (frontmatter-aware), or live pages discovered via sitemap crawl (robots.txt-aware, optional throttling).
- Config validation powered by Zod (strict mode, locale-aware messages) and optional PII redaction.
- CLI `build` command with dry-run mode; future commands (`crawl`, `fetch`, `build-llms`) planned.
- Workspace tooling: pnpm, Biome, Vitest, Changesets.

## Getting Started

```bash
pnpm install
pnpm build
```

Generate an example `llms.config.ts`:

```bash
cat <<'EOF' > llms.config.ts
import { defineConfig } from '@soya/llms-txt';

export default defineConfig({
  site: { title: 'Example Docs', url: 'https://example.com' },
  sources: {
    manual: {
      items: [
        {
          title: 'Getting Started',
          url: 'https://example.com/start',
          summary: 'プロジェクト導入の流れ',
          tags: ['guide']
        }
      ]
    },
    sitemap: {
      // Defaults to https://example.com/sitemap.xml when omitted
      respectRobotsTxt: true,
      concurrency: 1,
      delayMs: 1500,
      maxSummaryChars: 200
    }
  },
  renderOptions: {
    redactPII: true,
    includeTimestamp: true
  }
});
EOF
```

Generate output:

```bash
# 1. Compile the CLI (tsup builds dist/)
pnpm --filter @soya/llms-txt-cli build

# 2. Run the CLI from the repo root (bin/llms-txt は dist を参照)
node packages/llms-txt-cli/bin/llms-txt build \
  --config llms.config.ts \
  --out public/llms.txt

# Live siteをクロールしつつ一時的にSitemap URL／ページ上限を上書きする例
node packages/llms-txt-cli/bin/llms-txt build \
  --config llms.config.ts \
  --sitemap https://example.com/sitemaps/site-index.xml \
  --max-pages 200 \
  --out public/llms.txt

# 書き込みを行わずに内容確認
node packages/llms-txt-cli/bin/llms-txt build --dry-run
```

## Output format (render)

```
# <homepage title>

<homepage meta description or summary>

<optional intro text>

## <page title>

- [<page title>](https://example.com/page)
```

`collectContent` がホームページを先に解決できれば `<title>` / `<meta name="description">` をヘッダーに採用し、それ以外のページも各セクションとして列挙されます。

## Next.js Integration

```ts
// app/api/llms/route.ts
import { makeRoute } from '@soya/llms-txt-next';
import config from '../../../llms.config';

export const { GET } = makeRoute({ config });
```

Add the route to your Next.js app to expose `/api/llms`.

## Development

- **Build**: `pnpm build`
- **Tests**: `pnpm test` (Vitest; run locally due to sandboxed collectors)
- **Lint/Format**: `pnpm lint`, `pnpm lint:fix`
- **Versioning**: `pnpm changeset` before publishing new releases

## Roadmap

- CMS collectors (`collectFromCMS`) for Strapi and MicroCMS
- Rich HTML extraction templates (`extractToMarkdown`) and YAML mapping
- CLI commands `crawl`, `fetch`, `build-llms`
- Complete Next.js example app and edge/node runtime switching
- CI pipeline and snapshot coverage

## License

MIT License © SoyaS and contributors. See [`LICENSE`](./LICENSE) for details.
