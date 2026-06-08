import { MIRA_TELEGRAM_URL } from "../config";
import { storeMiraReport } from "./miraReportStore";
import type {
  MiraAnalysisRequest,
  MiraAnalysisResponse,
  Opportunity,
  WalletAnalysis,
} from "../types/wallet";
import {
  buildMiraExplainPrompt,
  buildMiraVerificationPayload,
  MIRA_VERIFICATION_QUESTIONS,
} from "./miraExplain";
import {
  buildPortfolioReport,
  enrichReport,
} from "./miraReport";

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function buildFactsInsights(
  analysis: WalletAnalysis,
  topOpportunity: Opportunity | null,
  discovery?: MiraAnalysisRequest["discovery"]
): string[] {
  const insights: string[] = [
    `Portfolio: ${formatUsd(analysis.portfolioValue)} · Idle: ${formatUsd(analysis.idleCapital)}`,
  ];

  if (discovery) {
    insights.push(
      `Scanned ${discovery.opportunitiesScanned} opportunities across ${discovery.protocolsCompared} protocols`
    );
  }

  if (topOpportunity?.market) {
    insights.push(
      `#1 ${topOpportunity.protocol ?? topOpportunity.title}: ${topOpportunity.market.apyLabel} APY · ${formatUsd(topOpportunity.market.expectedAnnualReturnUsd)}/yr`
    );
  } else if (topOpportunity) {
    insights.push(`#1 ${topOpportunity.title} · ${topOpportunity.protocol ?? "—"}`);
  }

  if (discovery?.winnerReason) {
    insights.push(discovery.winnerReason.slice(0, 120) + (discovery.winnerReason.length > 120 ? "…" : ""));
  }

  insights.push("AlphaHunter = Discovery · Mira = Verification · STON.fi/Omniston = Execution");

  return insights.slice(0, 5);
}

function buildSummary(
  analysis: WalletAnalysis,
  topOpportunity: Opportunity | null
): string {
  if (topOpportunity) {
    return `AlphaHunter discovered "${topOpportunity.title}" as the top-ranked opportunity. Export facts for Mira verification before execution.`;
  }
  return `Portfolio scanned: ${formatUsd(analysis.portfolioValue)}. Export facts for Mira verification.`;
}

/**
 * AlphaHunter discovers and ranks. Mira verifies. STON.fi/Omniston executes.
 */
export function generateMiraWorkflow(
  request: MiraAnalysisRequest
): MiraAnalysisResponse {
  const { walletAddress, analysis } = request;
  const opportunities = request.opportunities ?? [];
  const topOpportunity =
    opportunities.find((o) => o.id === request.opportunityId) ??
    opportunities[0] ??
    null;

  const discovery = request.discovery;

  const report = enrichReport(
    buildPortfolioReport(walletAddress, analysis, opportunities, discovery),
    analysis,
    opportunities
  );

  const verifyPrompt = buildMiraVerificationPayload(
    analysis,
    topOpportunity,
    opportunities
  );
  const explainPrompt = buildMiraExplainPrompt(
    analysis,
    topOpportunity,
    opportunities
  );

  const reportId = storeMiraReport(report, report.exportText, verifyPrompt);
  const miraDeepLink = `${MIRA_TELEGRAM_URL}?start=alphahunter`;

  return {
    walletAddress,
    reportId,
    source: "telegram",
    summary: buildSummary(analysis, topOpportunity),
    insights: buildFactsInsights(analysis, topOpportunity, discovery),
    recommendations: [...MIRA_VERIFICATION_QUESTIONS],
    confidence: topOpportunity?.confidence ?? analysis.alphaBreakdown.confidence,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "AlphaHunter exports facts only. Mira provides independent verification. STON.fi/Omniston handles execution. Not financial advice.",
    explainPrompt,
    verifyPrompt,
    report: {
      ...report,
      reportId,
      askMiraPrompt: verifyPrompt,
    },
    miraTelegramUrl: MIRA_TELEGRAM_URL,
    miraDeepLink,
    workflow: {
      exportLabel: "Copy Report",
      askLabel: "Verify With Mira",
      openLabel: "Open Mira",
      instructions:
        "Copy facts, open Mira on Telegram, and paste for verification.",
    },
  };
}

export function generateLocalMiraAnalysis(
  request: MiraAnalysisRequest
): MiraAnalysisResponse {
  return generateMiraWorkflow(request);
}
