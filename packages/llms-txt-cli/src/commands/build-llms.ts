export interface BuildLlmsCommandOptions {
  config?: string;
  source?: string[];
  out?: string;
}

export async function buildLlmsCommand(
  options: BuildLlmsCommandOptions
): Promise<void> {
  void options;
  console.warn(
    "[llms-txt] build-llms コマンドは今後のPRで実装されます。"
  );
}

