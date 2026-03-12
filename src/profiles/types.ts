export type StrategyType = "json_extract" | "json_truncate" | "text_truncate";

export interface ProfileStrategy {
  type: StrategyType;
  // json_extract
  items_path?: string[];
  fields?: string[];
  labels?: Record<string, string>;
  max_items?: number;
  max_chars_per_field?: number;
  // json_truncate
  max_depth?: number;
  max_array_items?: number;
  // shared
  max_chars?: number;
  fallback_chars?: number;
}

export interface ProfileMeta {
  id: string;
  version: string;
  description: string;
  mcp_pattern: string | string[];
  short_name?: string;
  mcp_url?: string;
  author?: string;
  sample_tool?: string;
}

export interface ProfileSpec {
  profile: ProfileMeta;
  strategy: ProfileStrategy;
  /** Hints used by `mcp-recall profiles retrain`. Ignored by the compression engine. */
  retrain?: {
    /** Max field-path depth for corpus analysis (default 3 = a.b.c). */
    max_depth?: number;
  };
}

export type ProfileTier = "user" | "community" | "bundled";

export interface LoadedProfile {
  spec: ProfileSpec;
  tier: ProfileTier;
  patterns: string[];
  filePath: string;
}
