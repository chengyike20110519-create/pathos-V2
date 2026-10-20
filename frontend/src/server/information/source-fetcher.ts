import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP, isIPv4 } from "node:net";
import type { SourceFetchOutcome } from "@/domain/information/source";
import type { SourceRegistry } from "@/server/information/source-registry";

export const DEFAULT_SOURCE_USER_AGENT = "PathOS-Information-Platform/1.0";
export const MAX_SOURCE_REDIRECTS = 5;

export type SourceFetchErrorCode =
  | "ACCESS_DENIED"
  | "INVALID_URL"
  | "PRIVATE_ADDRESS"
  | "DNS_FAILURE"
  | "TOO_MANY_REDIRECTS"
  | "INVALID_REDIRECT"
  | "HTTP_ERROR"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "FETCH_ERROR";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
type DnsLookupLike = (hostname: string) => Promise<string[]>;

export interface SourceFetchDependencies {
  fetch?: FetchLike;
  lookup?: DnsLookupLike;
  now?: () => number;
}

export interface SourceFetchSuccess {
  kind: "success";
  fetchStatus: "succeeded";
  fetchOutcome: Extract<SourceFetchOutcome, "changed" | "unchanged">;
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  contentHash: string;
  content: Uint8Array;
  contentType: string | null;
  responseBytes: number;
  redirectCount: number;
  durationMs: number;
}

export interface SourceFetchFailure {
  kind: "failure";
  fetchStatus: "failed" | "blocked";
  fetchOutcome: "failed" | "blocked";
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  contentHash: string | null;
  content: null;
  contentType: string | null;
  responseBytes: number;
  redirectCount: number;
  durationMs: number;
  errorCode: SourceFetchErrorCode;
  errorMessage: string;
}

export type SourceFetchResult = SourceFetchSuccess | SourceFetchFailure;

const blockedAddresses = new BlockList();
blockedAddresses.addAddress("0.0.0.0", "ipv4");
blockedAddresses.addSubnet("10.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("100.64.0.0", 10, "ipv4");
blockedAddresses.addSubnet("127.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedAddresses.addSubnet("192.0.0.0", 24, "ipv4");
blockedAddresses.addSubnet("192.168.0.0", 16, "ipv4");
blockedAddresses.addSubnet("198.18.0.0", 15, "ipv4");
blockedAddresses.addSubnet("224.0.0.0", 4, "ipv4");
blockedAddresses.addSubnet("240.0.0.0", 4, "ipv4");
blockedAddresses.addAddress("::", "ipv6");
blockedAddresses.addAddress("::1", "ipv6");
blockedAddresses.addSubnet("fc00::", 7, "ipv6");
blockedAddresses.addSubnet("fe80::", 10, "ipv6");
blockedAddresses.addSubnet("ff00::", 8, "ipv6");
blockedAddresses.addSubnet("2001:db8::", 32, "ipv6");

const privateHostSuffixes = new Set([
  "localhost",
  "local",
  "internal",
  "private",
  "example",
  "invalid",
  "test",
  "home.arpa",
  "in-addr.arpa",
]);

async function defaultLookup(hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses.map((item) => item.address));
    });
  });
}

export function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http and https are allowed");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("credentials and fragments are not allowed");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("only ports 80 and 443 are allowed");
  }
  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1)
    : rawHostname;
  const suffix = hostname.split(".").slice(-1)[0];
  const twoLevelSuffix = hostname.split(".").slice(-2).join(".");
  if (privateHostSuffixes.has(suffix) || privateHostSuffixes.has(twoLevelSuffix)) {
    throw new Error("private or reserved hostname is not allowed");
  }
  if (
    isIP(hostname) === 4 && blockedAddresses.check(hostname) ||
    isIP(hostname) === 6 && blockedAddresses.check(hostname, "ipv6")
  ) {
    throw new Error("private or reserved IP is not allowed");
  }
  return new URL(url.toString());
}

async function resolveAndAssertPublic(
  rawUrl: string,
  lookup: DnsLookupLike,
): Promise<URL> {
  const url = assertPublicHttpUrl(rawUrl);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  let addresses: string[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new Error("DNS lookup failed");
  }
  if (addresses.length === 0) throw new Error("DNS lookup returned no addresses");
  for (const address of addresses) {
    if (isIP(address) === 0) throw new Error("DNS returned a non-IP address");
    if (isIPv4(address) ? blockedAddresses.check(address) : blockedAddresses.check(address, "ipv6")) {
      throw new Error("DNS resolved to a private or reserved address");
    }
    if (!isIPv4(address) && address.toLowerCase().startsWith("::ffff:")) {
      const mapped = address.slice(7);
      if (isIPv4(mapped) && blockedAddresses.check(mapped)) {
        throw new Error("DNS resolved to a mapped private address");
      }
    }
  }
  return url;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean; totalBytes: number }> {
  if (!response.body) {
    return { bytes: new Uint8Array(0), truncated: false, totalBytes: 0 };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(totalBytes, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = bytes.byteLength - offset;
    if (remaining <= 0) break;
    bytes.set(chunk.subarray(0, remaining), offset);
    offset += Math.min(chunk.byteLength, remaining);
  }
  return { bytes, truncated, totalBytes };
}

function failure(
  requestedUrl: string,
  finalUrl: string | null,
  durationMs: number,
  errorCode: SourceFetchErrorCode,
  errorMessage: string,
  options: {
    fetchStatus?: "failed" | "blocked";
    httpStatus?: number | null;
    responseBytes?: number;
    redirectCount?: number;
    contentType?: string | null;
  } = {},
): SourceFetchFailure {
  const fetchStatus = options.fetchStatus ?? "failed";
  return {
    kind: "failure",
    fetchStatus,
    fetchOutcome: fetchStatus,
    requestedUrl,
    finalUrl,
    httpStatus: options.httpStatus ?? null,
    contentHash: null,
    content: null,
    contentType: options.contentType ?? null,
    responseBytes: options.responseBytes ?? 0,
    redirectCount: options.redirectCount ?? 0,
    durationMs: Math.max(0, durationMs),
    errorCode,
    errorMessage,
  };
}

export async function fetchRegisteredSource(
  registry: SourceRegistry,
  rawUrl: string,
  options: {
    previousContentHash?: string | null;
    maxRedirects?: number;
  } = {},
  dependencies: SourceFetchDependencies = {},
): Promise<SourceFetchResult> {
  const started = (dependencies.now ?? Date.now)();
  const entry = registry.get(rawUrl);
  const access = registry.canFetch(rawUrl);
  if (!access.allowed) {
    return failure(
      rawUrl,
      null,
      (dependencies.now ?? Date.now)() - started,
      "ACCESS_DENIED",
      access.message ?? "source access denied",
      { fetchStatus: "blocked" },
    );
  }
  if (!entry) throw new Error("registered source disappeared during access check");

  const fetchImpl = dependencies.fetch ?? ((input, init) => fetch(input, init));
  const lookup = dependencies.lookup ?? defaultLookup;
  const maxRedirects = options.maxRedirects ?? MAX_SOURCE_REDIRECTS;
  let currentUrl = entry.url;
  let redirectCount = 0;

  for (;;) {
    let url: URL;
    try {
      url = await resolveAndAssertPublic(currentUrl, lookup);
    } catch (error) {
      const message = error instanceof Error ? error.message : "URL validation failed";
      const blocked = /private|reserved|credentials|port|protocol/.test(message);
      return failure(
        entry.url,
        currentUrl,
        (dependencies.now ?? Date.now)() - started,
        blocked ? "PRIVATE_ADDRESS" : /DNS/.test(message) ? "DNS_FAILURE" : "INVALID_URL",
        message,
        { fetchStatus: blocked ? "blocked" : "failed", redirectCount },
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), entry.timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "user-agent": entry.userAgent,
          accept: entry.sourceType === "json_api" ? "application/json" : "*/*",
        },
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === "AbortError";
      return failure(
        entry.url,
        url.toString(),
        (dependencies.now ?? Date.now)() - started,
        aborted ? "TIMEOUT" : "FETCH_ERROR",
        aborted ? "source fetch timed out" : error instanceof Error ? error.message : "network fetch failed",
        { redirectCount },
      );
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      redirectCount += 1;
      if (redirectCount > maxRedirects) {
        return failure(
          entry.url,
          url.toString(),
          (dependencies.now ?? Date.now)() - started,
          "TOO_MANY_REDIRECTS",
          `source exceeded ${maxRedirects} redirects`,
          { httpStatus: response.status, redirectCount },
        );
      }
      const location = response.headers.get("location");
      if (!location) {
        return failure(
          entry.url,
          url.toString(),
          (dependencies.now ?? Date.now)() - started,
          "INVALID_REDIRECT",
          "redirect response had no Location header",
          { httpStatus: response.status, redirectCount },
        );
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, url);
      } catch {
        return failure(
          entry.url,
          url.toString(),
          (dependencies.now ?? Date.now)() - started,
          "INVALID_REDIRECT",
          "redirect Location was invalid",
          { httpStatus: response.status, redirectCount },
        );
      }
      currentUrl = nextUrl.toString();
      continue;
    }

    if (!response.ok) {
      return failure(
        entry.url,
        url.toString(),
        (dependencies.now ?? Date.now)() - started,
        "HTTP_ERROR",
        `source returned HTTP ${response.status}`,
        { httpStatus: response.status, redirectCount, contentType: response.headers.get("content-type") },
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > entry.maxResponseBytes) {
      return failure(
        entry.url,
        url.toString(),
        (dependencies.now ?? Date.now)() - started,
        "RESPONSE_TOO_LARGE",
        `source response exceeds ${entry.maxResponseBytes} bytes`,
        {
          httpStatus: response.status,
          responseBytes: declaredLength,
          redirectCount,
          contentType: response.headers.get("content-type"),
        },
      );
    }

    let body: { bytes: Uint8Array; truncated: boolean; totalBytes: number };
    try {
      body = await readBoundedBody(response, entry.maxResponseBytes);
    } catch (error) {
      return failure(
        entry.url,
        url.toString(),
        (dependencies.now ?? Date.now)() - started,
        "FETCH_ERROR",
        error instanceof Error ? error.message : "failed while reading response body",
        { httpStatus: response.status, redirectCount },
      );
    }
    if (body.truncated) {
      return failure(
        entry.url,
        url.toString(),
        (dependencies.now ?? Date.now)() - started,
        "RESPONSE_TOO_LARGE",
        `source response exceeds ${entry.maxResponseBytes} bytes`,
        {
          httpStatus: response.status,
          responseBytes: body.totalBytes,
          redirectCount,
          contentType: response.headers.get("content-type"),
        },
      );
    }

    const contentHash = hashBytes(body.bytes);
    return {
      kind: "success",
      fetchStatus: "succeeded",
      fetchOutcome:
        options.previousContentHash && options.previousContentHash === contentHash
          ? "unchanged"
          : "changed",
      requestedUrl: entry.url,
      finalUrl: url.toString(),
      httpStatus: response.status,
      contentHash,
      content: body.bytes,
      contentType: response.headers.get("content-type"),
      responseBytes: body.totalBytes,
      redirectCount,
      durationMs: Math.max(0, (dependencies.now ?? Date.now)() - started),
    };
  }
}

export { assertPublicHttpUrl as assertSourceFetchUrl };
