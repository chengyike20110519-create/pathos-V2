import {
  isSourceAccessReviewStatus,
  isSourceAuthority,
  isSourceType,
  type SourceDraft,
} from "@/domain/information/source";

export interface SourceRegistryEntry extends SourceDraft {
  robotsReviewStatus: Exclude<SourceDraft["robotsReviewStatus"], undefined>;
  termsReviewStatus: Exclude<SourceDraft["termsReviewStatus"], undefined>;
  fetchEnabled: boolean;
  timeoutMs: number;
  maxResponseBytes: number;
  userAgent: string;
}

export type SourceFetchDenyCode =
  | "SOURCE_NOT_REGISTERED"
  | "SOURCE_INACTIVE"
  | "FETCH_DISABLED"
  | "ROBOTS_NOT_ALLOWED"
  | "TERMS_NOT_ALLOWED";

export interface SourceFetchAccess {
  allowed: boolean;
  code?: SourceFetchDenyCode;
  message?: string;
}

export function canonicalSourceUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("source registry only accepts http and https URLs");
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error("source registry URLs cannot contain credentials or fragments");
  }
  return parsed.toString();
}

export function assertSourceRegistryEntry(entry: SourceRegistryEntry): void {
  canonicalSourceUrl(entry.url);
  if (!entry.name.trim()) throw new Error("source name is required");
  if (!isSourceAuthority(entry.authority)) throw new Error("invalid source authority");
  if (!isSourceType(entry.sourceType)) throw new Error("invalid source type");
  if (!isSourceAccessReviewStatus(entry.robotsReviewStatus)) {
    throw new Error("invalid robots review status");
  }
  if (!isSourceAccessReviewStatus(entry.termsReviewStatus)) {
    throw new Error("invalid terms review status");
  }
  if (entry.timeoutMs < 250 || entry.timeoutMs > 60000) {
    throw new Error("timeoutMs must be between 250 and 60000");
  }
  if (entry.maxResponseBytes < 1024 || entry.maxResponseBytes > 52428800) {
    throw new Error("maxResponseBytes must be between 1024 and 52428800");
  }
  if (!entry.userAgent.trim() || entry.userAgent.length > 300) {
    throw new Error("userAgent must be between 1 and 300 characters");
  }
  if (entry.rateLimitSeconds != null && entry.rateLimitSeconds < 0) {
    throw new Error("rateLimitSeconds cannot be negative");
  }
}

export class SourceRegistry {
  private readonly entries = new Map<string, SourceRegistryEntry>();

  constructor(entries: SourceRegistryEntry[] = []) {
    for (const entry of entries) this.register(entry);
  }

  register(entry: SourceRegistryEntry): SourceRegistryEntry {
    assertSourceRegistryEntry(entry);
    const url = canonicalSourceUrl(entry.url);
    if (this.entries.has(url)) {
      throw new Error(`source already registered: ${url}`);
    }
    this.entries.set(url, { ...entry, url });
    return this.get(url)!;
  }

  get(url: string): SourceRegistryEntry | null {
    try {
      return this.entries.get(canonicalSourceUrl(url)) ?? null;
    } catch {
      return null;
    }
  }

  require(url: string): SourceRegistryEntry {
    const entry = this.get(url);
    if (!entry) throw new Error(`source is not registered: ${url}`);
    return entry;
  }

  canFetch(url: string): SourceFetchAccess {
    const entry = this.get(url);
    if (!entry) {
      return { allowed: false, code: "SOURCE_NOT_REGISTERED", message: "source is not registered" };
    }
    if (entry.isActive === false) {
      return { allowed: false, code: "SOURCE_INACTIVE", message: "source is inactive" };
    }
    if (!entry.fetchEnabled) {
      return { allowed: false, code: "FETCH_DISABLED", message: "source fetch is disabled" };
    }
    if (entry.robotsReviewStatus !== "allowed" && entry.robotsReviewStatus !== "not_applicable") {
      return { allowed: false, code: "ROBOTS_NOT_ALLOWED", message: "robots access has not been approved" };
    }
    if (entry.termsReviewStatus !== "allowed" && entry.termsReviewStatus !== "not_applicable") {
      return { allowed: false, code: "TERMS_NOT_ALLOWED", message: "terms access has not been approved" };
    }
    return { allowed: true };
  }

  list(): SourceRegistryEntry[] {
    return [...this.entries.values()].map((entry) => ({ ...entry }));
  }

  get size(): number {
    return this.entries.size;
  }
}

export function createSourceRegistry(entries: SourceRegistryEntry[] = []): SourceRegistry {
  return new SourceRegistry(entries);
}
