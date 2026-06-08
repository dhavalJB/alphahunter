import type {
  AlphaHunterReport,
  Opportunity,
  OpportunityDiscovery,
  WalletAnalysis,
} from "../types/wallet";

export const MIRA_VERIFICATION_QUESTIONS = [
  "Do you agree with the top opportunity?",
  "Is there a better APY currently?",
  "Is execution worth the fees?",
  "What risks are missing?",
  "APPROVE or REJECT?",
] as const;

function formatUsd(value: number, decimals = 0): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function capitalizeRisk(risk: string): string {
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

export function describeOmnistonRoute(opportunity: Opportunity | null): string {
  if (!opportunity) return "N/A";
  const protocol = opportunity.protocol ?? opportunity.market?.apySource ?? "Omniston";
  const pool = opportunity.market?.poolName ?? opportunity.title;

  if (opportunity.executionType === "lp") {
    const asset = opportunity.recommendedAction?.asset ?? "USDT";
    return `${asset} → ${pool} LP (${protocol})`;
  }
  if (opportunity.executionType === "stake") {
    return `USDT → TON → ${pool} (${protocol})`;
  }
  if (opportunity.executionType === "farm") {
    return `LP → ${pool} Farm (${protocol})`;
  }
  return `${pool} via ${protocol} / Omniston`;
}

export function formatFactsExport(
  analysis: WalletAnalysis,
  opportunities: Opportunity[],
  discovery?: OpportunityDiscovery
): string {
  const pp = analysis.primaryPortfolio;
  const top = opportunities[0] ?? null;
  const tonBalance = pp?.tonBalance ?? 0;
  const usdtBalance = pp?.usdtBalanceUsd ?? pp?.usdtBalance ?? 0;

  const lines = [
    "═══ AlphaHunter → Mira Verification ═══",
    "AlphaHunter = Discovery · Mira = Verification · STON.fi/Omniston = Execution",
    "",
    "PORTFOLIO FACTS",
    `Portfolio Value: ${formatUsd(analysis.portfolioValue)}`,
    `TON Balance: ${tonBalance.toFixed(4)} TON (${formatUsd(pp?.tonWorkingCapitalUsd ?? 0)})`,
    `USDT Balance: ${formatUsd(typeof usdtBalance === "number" && usdtBalance > 100 ? usdtBalance : pp?.usdtBalanceUsd ?? analysis.idleCapital)}`,
    `Idle Capital: ${formatUsd(analysis.idleCapital)}`,
    `Idle Duration: ${analysis.idleDurationDays} days`,
    "",
    "DISCOVERY",
    `Opportunities Scanned: ${discovery?.opportunitiesScanned ?? opportunities.length}`,
    `Protocols Compared: ${discovery?.protocolsCompared ?? "—"}`,
    ...(discovery?.protocols?.length
      ? [`Protocols: ${discovery.protocols.join(", ")}`]
      : []),
    ...(discovery?.winnerReason ? [`Why #1: ${discovery.winnerReason}`] : []),
    "",
    "OPPORTUNITY COMPARISON (TOP 5)",
  ];

  if (opportunities.length === 0) {
    lines.push("No ranked opportunities detected.");
  } else {
    const rows = discovery?.comparison?.length
      ? discovery.comparison
      : opportunities.slice(0, 5).map((opp, i) => ({
          rank: opp.rank ?? i + 1,
          protocol: opp.protocol ?? "—",
          title: opp.title,
          apyLabel: opp.market?.apyLabel ?? opp.expectedYield,
          tvlLabel: opp.market?.tvlLabel ?? formatUsd(opp.market?.tvlUsd ?? 0),
          risk: opp.risk,
          requiredAsset: opp.requiredAsset ?? "—",
          annualReturnUsd: opp.market?.expectedAnnualReturnUsd ?? 0,
          opportunityScore: opp.opportunityScore ?? 0,
        }));

    for (const row of rows) {
      lines.push(
        `#${row.rank} ${row.protocol}: ${row.apyLabel} APY · ${row.tvlLabel} TVL · ${capitalizeRisk(row.risk)} risk · ${row.requiredAsset} · ${formatUsd(row.annualReturnUsd)}/yr · Score ${row.opportunityScore}`
      );
    }
  }

  lines.push("");

  if (top?.market) {
    lines.push(
      "TOP OPPORTUNITY DATA",
      `Rank: ${top.rankLabel ?? `#${top.rank}`}`,
      `Protocol: ${top.protocol ?? top.market.apySource ?? "—"}`,
      `APY: ${top.market.apyLabel} (${top.market.apySource ?? "live"})`,
      `TVL: ${top.market.tvlLabel ?? formatUsd(top.market.tvlUsd)}`,
      `Risk: ${capitalizeRisk(top.risk)}`,
      `Omniston Route: ${describeOmnistonRoute(top)}`,
      `Required Asset: ${top.requiredAsset ?? top.metrics?.requiredAsset ?? "—"}`,
      `Available: ${formatUsd(top.availableCapitalUsd ?? top.metrics?.availableCapitalUsd ?? 0)}`,
      `Deployable: ${formatUsd(top.deployableCapitalUsd ?? top.metrics?.deployableCapitalUsd ?? 0)}`,
      `Expected Annual Return: ${formatUsd(top.market.expectedAnnualReturnUsd)}`,
      `Expected Monthly Return: ${formatUsd(top.market.expectedMonthlyReturnUsd, 2)}`,
      `Expected Daily Return: ${formatUsd(top.market.expectedDailyReturnUsd ?? 0, 2)}`,
      ""
    );
  } else if (top) {
    lines.push(
      "TOP OPPORTUNITY DATA",
      `Rank: ${top.rankLabel ?? `#${top.rank}`}`,
      `Title: ${top.title}`,
      `Risk: ${capitalizeRisk(top.risk)}`,
      `Omniston Route: ${describeOmnistonRoute(top)}`,
      ""
    );
  }

  lines.push("QUESTIONS FOR MIRA");
  MIRA_VERIFICATION_QUESTIONS.forEach((q, i) => {
    lines.push(`${i + 1}. ${q}`);
  });

  lines.push(
    "",
    "— Facts exported by AlphaHunter. Mira verifies. Not financial advice."
  );

  return lines.join("\n");
}

export function buildPortfolioReport(
  walletAddress: string,
  analysis: WalletAnalysis,
  opportunities: Opportunity[],
  discovery?: OpportunityDiscovery
): AlphaHunterReport {
  const topOpportunities = opportunities.slice(0, 5).map((o) => ({
    id: o.id,
    title: o.title,
    confidence: o.confidence,
    risk: capitalizeRisk(o.risk),
    capitalImpact: o.capitalImpact,
    recommendedAction: o.recommendedAction,
  }));

  const topOpportunity = topOpportunities[0] ?? null;

  return {
    walletAddress,
    generatedAt: new Date().toISOString(),
    portfolioSummary: {
      portfolioValue: analysis.portfolioValue,
      tonWorkingCapital: analysis.primaryPortfolio.tonWorkingCapitalUsd,
      idleStablecoins: analysis.primaryPortfolio.idleUsdtUsd,
      alphaScore: analysis.alphaScore,
      capitalEfficiency: analysis.capitalEfficiency.score,
      capitalEfficiencyLabel: analysis.capitalEfficiency.label,
      riskScore: analysis.riskScoreNumeric,
      riskLevel: capitalizeRisk(analysis.riskScore),
      riskLabel: analysis.riskScoreLabel,
      walletProfile: analysis.walletProfile.label,
      idleCapital: analysis.idleCapital,
      idleDurationDays: analysis.idleDurationDays,
      missedYieldMin: analysis.missedYield.estimatedMinUsd,
      missedYieldMax: analysis.missedYield.estimatedMaxUsd,
      missedYieldRangeLabel: analysis.missedYield.yieldRangeLabel,
    },
    topOpportunities,
    topOpportunity,
    miraRecommendation: "",
    askMiraPrompt: formatFactsExport(analysis, opportunities, discovery),
    exportText: "",
  };
}

export function formatReportForMira(
  report: AlphaHunterReport,
  analysis?: WalletAnalysis,
  opportunities?: Opportunity[]
): string {
  if (analysis && opportunities) {
    return formatFactsExport(analysis, opportunities);
  }
  return report.askMiraPrompt || "";
}

export function buildAskMiraPrompt(
  analysis: WalletAnalysis,
  opportunities: Opportunity[]
): string {
  return formatFactsExport(analysis, opportunities);
}

export function enrichReport(
  report: AlphaHunterReport,
  analysis?: WalletAnalysis,
  opportunities?: Opportunity[]
): AlphaHunterReport {
  const exportText =
    analysis && opportunities
      ? formatFactsExport(analysis, opportunities)
      : report.askMiraPrompt;

  return {
    ...report,
    exportText,
    askMiraPrompt: exportText,
  };
}
