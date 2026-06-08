interface EndpointStat {
  count: number;
  totalMs: number;
  maxMs: number;
  duplicates: number;
  lastAt: number;
}

interface ExternalStat {
  count: number;
  totalMs: number;
  maxMs: number;
  errors: number;
  lastAt: number;
}

interface PipelineStat {
  count: number;
  totalMs: number;
  maxMs: number;
  cacheHits: number;
  cacheMisses: number;
}

const DEDUP_WINDOW_MS = 5_000;

const endpointStats = new Map<string, EndpointStat>();
const externalStats = new Map<string, ExternalStat>();
const recentFingerprints = new Map<string, number>();
const pipelineStats: PipelineStat = {
  count: 0,
  totalMs: 0,
  maxMs: 0,
  cacheHits: 0,
  cacheMisses: 0,
};

function getOrCreateEndpoint(key: string): EndpointStat {
  let stat = endpointStats.get(key);
  if (!stat) {
    stat = { count: 0, totalMs: 0, maxMs: 0, duplicates: 0, lastAt: 0 };
    endpointStats.set(key, stat);
  }
  return stat;
}

function getOrCreateExternal(key: string): ExternalStat {
  let stat = externalStats.get(key);
  if (!stat) {
    stat = { count: 0, totalMs: 0, maxMs: 0, errors: 0, lastAt: 0 };
    externalStats.set(key, stat);
  }
  return stat;
}

export const perfMetrics = {
  recordEndpoint(
    method: string,
    path: string,
    durationMs: number,
    walletAddress?: string
  ): void {
    const key = `${method} ${path}`;
    const stat = getOrCreateEndpoint(key);
    stat.count += 1;
    stat.totalMs += durationMs;
    stat.maxMs = Math.max(stat.maxMs, durationMs);
    stat.lastAt = Date.now();

    if (walletAddress) {
      const fingerprint = `${key}:${walletAddress.toLowerCase()}`;
      const last = recentFingerprints.get(fingerprint);
      if (last && Date.now() - last < DEDUP_WINDOW_MS) {
        stat.duplicates += 1;
      }
      recentFingerprints.set(fingerprint, Date.now());
    }
  },

  recordExternal(source: string, path: string, durationMs: number, error = false): void {
    const key = `${source}:${path}`;
    const stat = getOrCreateExternal(key);
    stat.count += 1;
    stat.totalMs += durationMs;
    stat.maxMs = Math.max(stat.maxMs, durationMs);
    stat.lastAt = Date.now();
    if (error) stat.errors += 1;
  },

  recordPipeline(durationMs: number, fromCache: boolean): void {
    pipelineStats.count += 1;
    pipelineStats.totalMs += durationMs;
    pipelineStats.maxMs = Math.max(pipelineStats.maxMs, durationMs);
    if (fromCache) pipelineStats.cacheHits += 1;
    else pipelineStats.cacheMisses += 1;
  },

  getReport() {
    const endpoints = [...endpointStats.entries()]
      .map(([endpoint, s]) => ({
        endpoint,
        count: s.count,
        avgMs: s.count ? Math.round(s.totalMs / s.count) : 0,
        maxMs: Math.round(s.maxMs),
        duplicates: s.duplicates,
        lastAt: s.lastAt ? new Date(s.lastAt).toISOString() : null,
      }))
      .sort((a, b) => b.avgMs - a.avgMs);

    const external = [...externalStats.entries()]
      .map(([source, s]) => ({
        source,
        count: s.count,
        avgMs: s.count ? Math.round(s.totalMs / s.count) : 0,
        maxMs: Math.round(s.maxMs),
        errors: s.errors,
        lastAt: s.lastAt ? new Date(s.lastAt).toISOString() : null,
      }))
      .sort((a, b) => b.avgMs - a.avgMs);

    const totalEndpointRequests = endpoints.reduce((n, e) => n + e.count, 0);
    const totalDuplicates = endpoints.reduce((n, e) => n + e.duplicates, 0);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalEndpointRequests,
        duplicateRequests: totalDuplicates,
        pipelineRuns: pipelineStats.count,
        pipelineCacheHitRate:
          pipelineStats.count > 0
            ? Math.round((pipelineStats.cacheHits / pipelineStats.count) * 100)
            : 0,
        pipelineAvgMs: pipelineStats.count
          ? Math.round(pipelineStats.totalMs / pipelineStats.count)
          : 0,
        pipelineMaxMs: Math.round(pipelineStats.maxMs),
      },
      slowestEndpoints: endpoints.slice(0, 10),
      slowestExternalApis: external.slice(0, 10),
      allEndpoints: endpoints,
      allExternalApis: external,
      recommendations: buildRecommendations(endpoints, external, totalDuplicates),
    };
  },
};

function buildRecommendations(
  endpoints: { endpoint: string; count: number; duplicates: number; avgMs: number }[],
  external: { source: string; avgMs: number; count: number }[],
  totalDuplicates: number
): string[] {
  const recs: string[] = [];

  const analyze = endpoints.find((e) => e.endpoint.includes("analyze-wallet"));
  const opportunities = endpoints.find((e) => e.endpoint.includes("opportunities"));
  const miraReport = endpoints.find((e) => e.endpoint.includes("mira-report"));
  const miraAnalysis = endpoints.find((e) => e.endpoint.includes("mira-analysis"));

  if (
    analyze &&
    opportunities &&
    (analyze.duplicates > 0 || opportunities.duplicates > 0)
  ) {
    recs.push(
      "Use POST /wallet-intelligence instead of parallel /analyze-wallet + /opportunities"
    );
  }

  if (miraReport && miraAnalysis) {
    recs.push(
      "Mira report + analysis are bundled in /wallet-intelligence — avoid separate calls"
    );
  }

  if (totalDuplicates > 0) {
    recs.push(
      `${totalDuplicates} duplicate wallet requests detected within 5s — consolidate frontend fetches`
    );
  }

  const stonfi = external.find((e) => e.source.startsWith("stonfi"));
  if (stonfi && stonfi.avgMs > 3000) {
    recs.push(
      "STON.fi API is slow — 5min cache is active; ensure market snapshot is not re-fetched per wallet"
    );
  }

  const toncenter = external.filter((e) => e.source === "toncenter");
  const toncenterAvg =
    toncenter.length > 0
      ? Math.round(
          toncenter.reduce((s, e) => s + e.avgMs * e.count, 0) /
            toncenter.reduce((s, e) => s + e.count, 0)
        )
      : 0;
  if (toncenterAvg > 2000) {
    recs.push(
      "TonCenter calls are slow — wallet analysis cached at 1min TTL to limit repeat fetches"
    );
  }

  if (recs.length === 0) {
    recs.push("No critical issues detected — monitor /health/performance during load tests");
  }

  return recs;
}
