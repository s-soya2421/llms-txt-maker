export interface MapYaml {
  title?: { selector: string; attr?: string };
  hero?: { selector: string; attr?: string };
  fields?: Record<string, { selector: string; attr?: string }>;
  sections?: Array<{
    name: string;
    selector: string;
    content?: string;
  }>;
}

export interface TemplateContext {
  url: string;
  html: string;
  map: MapYaml;
  extracted: Record<string, unknown>;
}

export type Template = (ctx: TemplateContext) => string;

export function extractToMarkdown(
  html: string,
  url: string,
  map: MapYaml,
  template: Template
): string {
  void html;
  void url;
  void map;
  void template;
  throw new Error("extractToMarkdown: Not implemented yet");
}

