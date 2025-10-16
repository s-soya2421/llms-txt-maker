const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const PHONE_PATTERN =
  /(?<!\d)(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,3}\d{2,4}(?!\d)/gu;

export function redactPII(
  text: string,
  enabled: boolean,
  extra: RegExp[] = []
): string {
  if (!enabled) {
    return text;
  }

  let result = text.replace(EMAIL_PATTERN, "[redacted-email]");
  result = result.replace(PHONE_PATTERN, (match) => {
    const digitsOnly = match.replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      return match;
    }
    return "[redacted-phone]";
  });

  for (const pattern of extra) {
    const hasGlobalFlag = pattern.flags.includes("g");
    const globalPattern = hasGlobalFlag
      ? pattern
      : new RegExp(pattern.source, `${pattern.flags}g`);
    result = result.replace(globalPattern, "[redacted]");
  }

  return result;
}

export function toAbsoluteUrls(base: string, html: string): string {
  // TODO: 後続PRで堅牢なHTMLパーサを導入し、属性単位で正規化する
  void base;
  return html;
}

export function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const keysForRemoval: string[] = [];

    params.forEach((_, key) => {
      if (key.toLowerCase().startsWith("utm_")) {
        keysForRemoval.push(key);
      }
    });

    for (const key of keysForRemoval) {
      params.delete(key);
    }

    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}
