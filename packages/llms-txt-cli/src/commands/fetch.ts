export interface FetchCommandOptions {
  cms?: string;
  base?: string;
  collection?: string;
  fields?: string;
  urlTemplate?: string;
  tokenEnv?: string;
  template?: string;
  out?: string;
}

export async function fetchCommand(
  options: FetchCommandOptions
): Promise<void> {
  void options;
  console.warn(
    "[llms-txt] fetch コマンドは雛形段階で、CMS連携は次のPRで対応予定です。"
  );
}

