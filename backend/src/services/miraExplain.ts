import type { Opportunity, WalletAnalysis } from "../types/wallet";
import {
  describeOmnistonRoute,
  formatFactsExport,
  MIRA_VERIFICATION_QUESTIONS,
} from "./miraReport";

/** Facts-only brief for Mira — same as clipboard export */
export function buildMiraExplainPrompt(
  analysis: WalletAnalysis,
  opportunity: Opportunity | null,
  allOpportunities: Opportunity[] = opportunity ? [opportunity] : []
): string {
  const opps =
    allOpportunities.length > 0
      ? allOpportunities
      : opportunity
        ? [opportunity]
        : [];
  return formatFactsExport(analysis, opps);
}

/** Facts-only verification payload — no AlphaHunter recommendations */
export function buildMiraVerificationPayload(
  analysis: WalletAnalysis,
  opportunity: Opportunity | null,
  allOpportunities: Opportunity[] = []
): string {
  const opps =
    allOpportunities.length > 0
      ? allOpportunities
      : opportunity
        ? [opportunity]
        : [];
  return formatFactsExport(analysis, opps);
}

export { MIRA_VERIFICATION_QUESTIONS, describeOmnistonRoute };
