import type { ModelChoice } from "./types";
import modelConfig from "./model-config.json";

// The model labels shown throughout the website come from model-config.json.
// api/generate.ts embeds the matching server-side IDs to avoid Vercel ESM import errors.
export const MODEL_LABELS: Record<ModelChoice, string> = {
  failover: modelConfig.failover.label,
};

export const MODEL_CHOICES: ModelChoice[] = ["failover"];
