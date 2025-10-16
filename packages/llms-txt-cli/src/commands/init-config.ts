import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface InitConfigCommandOptions {
  path?: string;
  force?: boolean;
}

const TEMPLATE_TS = `import { defineConfig } from '@soya/llms-txt';

export default defineConfig({
  site: {
    title: 'Example Docs',
    url: 'https://example.com'
  },
  sources: {
    manual: {
      items: [
        {
          title: 'Getting Started',
          url: 'https://example.com/start',
          summary: 'プロジェクトの導入手順',
          tags: ['guide']
        }
      ]
    },
    fs: {
      dirs: ['./docs']
    }
  },
  renderOptions: {
    includeTimestamp: true
  }
});
`;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function initConfigCommand(
  options: InitConfigCommandOptions = {}
): Promise<void> {
  const targetPath = path.resolve(options.path ?? "llms.config.ts");

  if (!options.force && (await fileExists(targetPath))) {
    console.error(
      `[llms-txt] ${targetPath} は既に存在します。--force を指定すると上書きできます。`
    );
    process.exitCode = 1;
    return;
  }

  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  await writeFile(targetPath, TEMPLATE_TS, "utf8");
  console.log(
    `[llms-txt] llms.config.ts の雛形を生成しました: ${targetPath}`
  );
}
