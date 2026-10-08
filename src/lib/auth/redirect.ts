const applicationPages = ["/", "/chat", "/documents"];

export function getSafeNextPath(value: unknown): string {
  // A small allowlist prevents a supplied next= value from redirecting off-site.
  return typeof value === "string" && applicationPages.includes(value)
    ? value
    : "/";
}

export function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/documents" ||
    pathname.startsWith("/documents/")
  );
}
