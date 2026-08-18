const LOCAL_URL =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s"'<>]*)?/gi;

export function findLocalUrl(text: string): string | null {
  let found: string | null = null;
  for (const match of text.matchAll(LOCAL_URL)) {
    let url = match[0].replace(/[).,;]+$/g, "");
    url = url
      .replace(/^http:\/\/0\.0\.0\.0/i, "http://localhost")
      .replace(/^https:\/\/0\.0\.0\.0/i, "https://localhost")
      .replace(/^http:\/\/\[::1\]/i, "http://localhost")
      .replace(/^https:\/\/\[::1\]/i, "https://localhost");
    found = url;
    if (/localhost/i.test(url)) {
      return url;
    }
  }
  return found;
}
