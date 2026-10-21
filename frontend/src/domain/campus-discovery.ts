import type { UniversitySummary } from "./dataset";

export interface CampusDiscoverySource {
  url: string;
  title: string;
  accessMethod: "live_official_page" | "official_search_index";
}

export interface CampusDiscoveryCard {
  summary: UniversitySummary;
  photo: {
    id: string;
    url: string;
    label: string;
    sourceUrl: string;
    publisher: string;
  } | null;
  overview: {
    text: string;
    checkedOn: string;
    storage: "supabase" | "reviewed_file";
    hasIndexedSources: boolean;
    indexOnly: boolean;
    sources: CampusDiscoverySource[];
  } | null;
  motto?: {
    text: string;
    textZh?: string | null;
    status: "confirmed" | "candidate";
    sourceUrl?: string | null;
  } | null;
}

export interface CampusDiscoveryQuery {
  offset?: number;
  limit?: number;
  seed?: string;
}

export interface CampusDiscoveryPage {
  cards: CampusDiscoveryCard[];
  total: number;
  offset: number;
  nextOffset: number | null;
  seed: string;
}
