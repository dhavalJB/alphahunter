type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, event: string, detail?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...detail,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  cacheHit: (key: string) => log("info", "cache_hit", { key }),
  cacheMiss: (key: string) => log("info", "cache_miss", { key }),

  pipelineStart: (address: string) =>
    log("info", "pipeline_start", { address: address.slice(0, 8) }),
  pipelineComplete: (address: string, source: string) =>
    log("info", "pipeline_complete", { address: address.slice(0, 8), source }),

  opportunitiesStart: (address: string) =>
    log("info", "opportunities_start", { address: address.slice(0, 8) }),

  opportunitiesComplete: (
    address: string,
    durationMs: number,
    count: number,
    source: "stonfi" | "fallback" | "timeout" | "cache"
  ) =>
    log("info", "opportunities_complete", {
      address: address.slice(0, 8),
      durationMs,
      count,
      source,
    }),

  externalRequest: (source: string, path: string, durationMs: number) =>
    log("info", "external_request", { source, path, durationMs }),

  externalError: (
    source: string,
    path: string,
    durationMs: number,
    status: number,
    reason: string
  ) =>
    log("warn", "external_error", {
      source,
      path,
      durationMs,
      status,
      reason,
    }),

  /** Startup / diagnostics only */
  info: (event: string, detail?: Record<string, unknown>) =>
    log("info", event, detail),

  warn: (event: string, detail?: Record<string, unknown>) =>
    log("warn", event, detail),

  error: (event: string, detail?: Record<string, unknown>) =>
    log("error", event, detail),
};
