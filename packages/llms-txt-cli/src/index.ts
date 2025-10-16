import { Command } from "commander";

import { buildCommand } from "./commands/build.js";
import { buildLlmsCommand } from "./commands/build-llms.js";
import { crawlCommand } from "./commands/crawl.js";
import { fetchCommand } from "./commands/fetch.js";
import { initConfigCommand } from "./commands/init-config.js";

const program = new Command();

program
  .name("llms-txt")
  .description("AI 向けの llms.txt/llms-full.txt を生成するCLIツール（雛形）")
  .version("0.0.0");

program
  .command("init-config")
  .description("llms.config.ts の雛形を生成します")
  .option("--path <path>", "生成するファイルパス", "llms.config.ts")
  .option("--force", "既存ファイルを上書きします")
  .action(async (options) => {
    await initConfigCommand(options);
  });

program
  .command("build")
  .description("設定ファイルから llms.txt をビルドします")
  .option("--config <path>", "設定ファイルのパス")
  .option("--out <path>", "出力先パス")
  .option("--dry-run", "書き込みを行わずにプレビューを表示")
  .option(
    "--sitemap <url>",
    "クロール時に使用する Sitemap の URL を一時的に上書きします"
  )
  .option(
    "--max-pages <number>",
    "クロールする最大ページ数を一時的に指定します"
  )
  .action(async (options) => {
    await buildCommand(options);
  });

program
  .command("crawl")
  .description("サイトマップをクロールしてコンテンツを収集します")
  .option("--sitemap <url>", "Sitemap の URL（相対パスまたは絶対URL）")
  .option("--config <path>", "設定ファイルのパス", "llms.config.ts")
  .option("--include <patterns>", "含めるURLパターン（カンマ区切り）")
  .option("--exclude <patterns>", "除外するURLパターン（カンマ区切り）")
  .option("--out <dir>", "収集した Markdown の出力先", "./txtDir")
  .option("--max-pages <number>", "クロールする最大ページ数")
  .option("--concurrency <number>", "並列リクエスト数", "5")
  .option("--delay-ms <number>", "リクエスト間の遅延（ミリ秒）", "100")
  .action(async (options) => {
    await crawlCommand(options);
  });

program
  .command("fetch")
  .description("CMS からコンテンツを取得して Markdown 化します")
  .option("--cms <name>", "CMS タイプ（strapi|microcms）")
  .option("--base <url>", "CMS のベース URL")
  .option("--collection <name>", "コレクション名")
  .option("--fields <map>", "取得フィールドのマッピング")
  .option("--url-template <template>", "URL を計算するテンプレート")
  .option("--token-env <name>", "API トークンを参照する環境変数名")
  .option("--template <path>", "テンプレートファイル")
  .option("--out <dir>", "出力ディレクトリ")
  .action(async (options) => {
    await fetchCommand(options);
  });

program
  .command("build-llms")
  .description("複数の収集結果をまとめて llms.txt を生成します")
  .option("--config <path>", "設定ファイルのパス")
  .option("--source <dir...>", "収集済みMarkdownのディレクトリ（複数指定可）")
  .option("--out <path>", "出力ファイルパス")
  .action(async (options) => {
    await buildLlmsCommand(options);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
