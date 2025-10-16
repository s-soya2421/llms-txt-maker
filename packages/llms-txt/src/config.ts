import { z } from "zod";

const LOCALE_MESSAGES = {
  en: {
    invalidUrl: "Invalid url"
  },
  ja: {
    invalidUrl: "無効なURLです"
  }
} as const;

export type ConfigLocale = keyof typeof LOCALE_MESSAGES;

const DEFAULT_LOCALE: ConfigLocale = "en";

export const MANUAL_TAG_OPTIONS = ["dev", "doc", "guide", "api"] as const;
export type ManualItemTag = (typeof MANUAL_TAG_OPTIONS)[number];

export const CONFIG_DEFAULTS = {
  content: {
    heading: "Content Index",
    emptyStateMessage: "まだ収集されたコンテンツはありません。"
  },
  renderOptions: {
    includeTimestamp: false,
    redactPII: false,
    full: {
      heading: "Full Content",
      indexHeading: "Full Content Index",
      includeIndex: true,
      maxDocChars: 4000,
      maxTotalChars: 200_000
    }
  }
} as const;

const LinkSchema = z
  .object({
    label: z.string(),
    url: z.string().url(),
    description: z.string().optional()
  })
  .strict();

const ContentSectionSchema = z
  .object({
    heading: z.string().default(CONFIG_DEFAULTS.content.heading),
    emptyStateMessage: z
      .string()
      .default(CONFIG_DEFAULTS.content.emptyStateMessage)
  })
  .strict();

function isContentUrl(value: string): boolean {
  if (value.startsWith("/")) {
    return true;
  }
  try {
    // Allow absolute URLs
    void new URL(value);
    return true;
  } catch {
    return false;
  }
}

function createContentUrlSchema(locale: ConfigLocale) {
  return z
    .string()
    .min(1)
    .transform((value) => value.trim())
    .refine(isContentUrl, {
      message: LOCALE_MESSAGES[locale].invalidUrl
    });
}

function buildSchemas(locale: ConfigLocale) {
  const ContentUrlSchema = createContentUrlSchema(locale);

  const ManualItemSchema = z
    .object({
      title: z.string(),
      url: ContentUrlSchema,
      summary: z.string().optional(),
      tags: z.array(z.enum(MANUAL_TAG_OPTIONS)).optional()
    })
    .strict();

  const ManualSourceSchema = z
    .object({
      items: z.array(ManualItemSchema)
    })
    .strict();

  const FSSourceSchema = z
    .object({
      dirs: z
        .array(z.string().min(1))
        .min(1)
        .refine(
          (dirs) =>
            dirs.every(
              (dir) => !dir.trim().toLowerCase().endsWith(".tmp")
            ),
          {
            message: "Directories ending with .tmp are not allowed."
          }
        ),
      maxFiles: z
        .number()
        .int()
        .positive()
        .optional(),
      maxCharsPerFile: z
        .number()
        .int()
        .positive()
        .optional()
    })
    .strict();

  const SitemapSourceSchema = z
    .object({
      url: z.string().url().optional(),
      include: z.array(z.string().min(1)).optional(),
      exclude: z.array(z.string().min(1)).optional(),
      respectRobotsTxt: z.boolean().default(true),
      concurrency: z.number().int().positive().optional(),
      delayMs: z.number().int().nonnegative().optional(),
      maxPages: z.number().int().positive().optional(),
      maxSummaryChars: z.number().int().positive().optional()
    })
    .strict();

  const SourcesSchema = z
    .object({
      manual: ManualSourceSchema.optional(),
      fs: FSSourceSchema.optional(),
      sitemap: SitemapSourceSchema.optional()
    })
    .strict()
    .default(() => ({}));

  const FullRenderOptionsSchema = z
    .object({
      heading: z
        .string()
        .default(CONFIG_DEFAULTS.renderOptions.full.heading),
      indexHeading: z
        .string()
        .default(CONFIG_DEFAULTS.renderOptions.full.indexHeading),
      includeIndex: z
        .boolean()
        .default(CONFIG_DEFAULTS.renderOptions.full.includeIndex),
      maxDocs: z
        .number()
        .int()
        .positive()
        .optional(),
      maxDocChars: z
        .number()
        .int()
        .positive()
        .default(CONFIG_DEFAULTS.renderOptions.full.maxDocChars),
      maxTotalChars: z
        .number()
        .int()
        .positive()
        .default(CONFIG_DEFAULTS.renderOptions.full.maxTotalChars)
    })
    .strict();

  const RenderOptionsSchema = z
    .object({
      includeTimestamp: z
        .boolean()
        .default(CONFIG_DEFAULTS.renderOptions.includeTimestamp),
      redactPII: z
        .boolean()
        .default(CONFIG_DEFAULTS.renderOptions.redactPII),
      full: FullRenderOptionsSchema.default(() => ({
        ...CONFIG_DEFAULTS.renderOptions.full
      }))
    })
    .strict();

  const ConfigSchema = z
    .object({
      site: z
        .object({
          title: z.string(),
          description: z.string().optional(),
          url: z.string().url()
        })
        .strict(),
      intro: z.string().optional(),
      importantLinks: z.array(LinkSchema).default(() => []),
      sources: SourcesSchema,
      content: ContentSectionSchema.default(() => ({
        ...CONFIG_DEFAULTS.content
      })),
      renderOptions: RenderOptionsSchema.default(() => ({
        ...CONFIG_DEFAULTS.renderOptions,
        full: { ...CONFIG_DEFAULTS.renderOptions.full }
      }))
    })
    .strict();

  return {
    ConfigSchema,
    SourcesSchema,
    ManualSourceSchema,
    ManualItemSchema,
    FSSourceSchema,
    RenderOptionsSchema,
    FullRenderOptionsSchema,
    SitemapSourceSchema
  };
}

const SCHEMAS = {
  en: buildSchemas("en"),
  ja: buildSchemas("ja")
} as const;

export const ConfigSchema = SCHEMAS.en.ConfigSchema;

type ManualSourceSchemaType = typeof SCHEMAS.en.ManualSourceSchema;
type ManualItemSchemaType = typeof SCHEMAS.en.ManualItemSchema;
type FSSourceSchemaType = typeof SCHEMAS.en.FSSourceSchema;
type SourcesSchemaType = typeof SCHEMAS.en.SourcesSchema;
type RenderOptionsSchemaType = typeof SCHEMAS.en.RenderOptionsSchema;
type FullRenderOptionsSchemaType = typeof SCHEMAS.en.FullRenderOptionsSchema;
type SitemapSourceSchemaType = typeof SCHEMAS.en.SitemapSourceSchema;

export type LLMSConfig = z.infer<typeof ConfigSchema>;
export type SourcesConfig = z.infer<SourcesSchemaType>;
export type ManualSourceConfig = z.infer<ManualSourceSchemaType>;
export type ManualItemConfig = z.infer<ManualItemSchemaType>;
export type ManualItemTagConfig = ManualItemTag;
export type FSSourceConfig = z.infer<FSSourceSchemaType>;
export type RenderOptions = z.infer<RenderOptionsSchemaType>;
export type FullRenderOptions = z.infer<FullRenderOptionsSchemaType>;
export type SitemapSourceConfig = z.infer<SitemapSourceSchemaType>;

export interface DefineConfigOptions {
  locale?: ConfigLocale;
}

export function defineConfig(
  config: unknown,
  options: DefineConfigOptions = {}
): LLMSConfig {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const schema = SCHEMAS[locale]?.ConfigSchema ?? ConfigSchema;
  return schema.parse(config);
}
