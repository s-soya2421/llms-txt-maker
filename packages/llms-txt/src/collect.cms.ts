import { CMSFetchOptions, ContentItem } from "./types.js";

export async function collectFromCMS(
  options: CMSFetchOptions
): Promise<ContentItem[]> {
  void options;
  throw new Error("collectFromCMS: Not implemented yet");
}

