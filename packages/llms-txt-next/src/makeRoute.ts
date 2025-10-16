import {
  collectContent,
  render,
  type CollectContentOptions,
  type LLMSConfig
} from "@soya/llms-txt";

export interface MakeRouteOptions {
  config: LLMSConfig | (() => Promise<LLMSConfig> | LLMSConfig);
  staticPath?: string;
  collectOptions?: CollectContentOptions;
}

function resolveConfig(
  config: MakeRouteOptions["config"]
): Promise<LLMSConfig> | LLMSConfig {
  if (typeof config === "function") {
    return config();
  }

  return config;
}

export function makeRoute(options: MakeRouteOptions) {
  // TODO: Edge/Node の自動判定ロジックを今後実装する
  return async function GET() {
    try {
      const config = await resolveConfig(options.config);

      if (options.staticPath) {
        return new Response(
          `Static serving from "${options.staticPath}" is not implemented yet.`,
          {
            status: 501,
            headers: {
              "content-type": "text/plain; charset=utf-8"
            }
          }
        );
      }

      const items = await collectContent(config, options.collectOptions);
      const markdown = render(config, items);
      return new Response(markdown, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "s-maxage=300, stale-while-revalidate=86400"
        }
      });
    } catch (error) {
      console.error("[llms-txt-next] Failed to render llms.txt route:", error);
      return new Response("Failed to render llms.txt", {
        status: 500,
        headers: {
          "content-type": "text/plain; charset=utf-8"
        }
      });
    }
  };
}
