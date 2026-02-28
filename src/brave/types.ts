export interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  language?: string;
  family_friendly?: boolean;
}

export interface BraveWebSearchResponse {
  query: {
    original: string;
    altered?: string;
  };
  web?: {
    results: BraveWebResult[];
  };
}

export interface BraveSearchOptions {
  count?: number;
  offset?: number;
  freshness?: string;
}
