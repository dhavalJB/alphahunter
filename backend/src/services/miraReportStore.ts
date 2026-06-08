import type { AlphaHunterReport } from "../types/wallet";

interface StoredReport {
  reportId: string;
  exportText: string;
  verifyPrompt: string;
  report: AlphaHunterReport;
  createdAt: number;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const store = new Map<string, StoredReport>();

function randomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function storeMiraReport(
  report: AlphaHunterReport,
  exportText: string,
  verifyPrompt: string
): string {
  const reportId = randomId();
  const now = Date.now();
  store.set(reportId, {
    reportId,
    exportText,
    verifyPrompt,
    report: { ...report, reportId },
    createdAt: now,
    expiresAt: now + TTL_MS,
  });
  pruneExpired();
  return reportId;
}

export function getMiraReport(reportId: string): StoredReport | null {
  pruneExpired();
  const key = reportId.replace(/^alphahunter_/, "");
  return store.get(key) ?? null;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(id);
  }
}
