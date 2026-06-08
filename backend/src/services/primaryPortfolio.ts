import type {
  PrimaryPortfolioBreakdown,
  TokenBalance,
  WalletSnapshot,
} from "../types/wallet";

export function isDeployedReceiptToken(token: TokenBalance): boolean {
  const sym = token.symbol.toUpperCase();
  const name = token.name.toLowerCase();

  if (/^J(USDT|USDC|USDE)/.test(sym)) return true;
  if (/^(ST|TS)TON/.test(sym)) return true;
  if (sym.startsWith("LP") || sym.includes("LP-")) return true;
  if (name.includes("vault") || name.includes("staked") || name.includes("liquid")) {
    return true;
  }
  return false;
}

function isUsdtToken(token: TokenBalance): boolean {
  const sym = token.symbol.toUpperCase();
  const name = token.name.toLowerCase();
  return (
    sym === "USDT" ||
    sym === "USD₮" ||
    sym.includes("USDT") ||
    name.includes("tether")
  );
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getUsdtTokens(snapshot: WalletSnapshot): TokenBalance[] {
  return snapshot.tokens.filter((t) => isUsdtToken(t) && !t.isNative);
}

export function getUndeployedUsdtUsd(snapshot: WalletSnapshot): number {
  return roundUsd(
    getUsdtTokens(snapshot).reduce((sum, token) => {
      if (isDeployedReceiptToken(token)) return sum;
      if (token.balanceUsd <= 0) return sum;
      return sum + token.balanceUsd;
    }, 0)
  );
}

export function getTotalUsdtUsd(snapshot: WalletSnapshot): number {
  return roundUsd(
    getUsdtTokens(snapshot).reduce((sum, t) => sum + Math.max(0, t.balanceUsd), 0)
  );
}

export function getTonWorkingCapitalUsd(snapshot: WalletSnapshot): number {
  const ton = snapshot.tokens.find((t) => t.isNative);
  return roundUsd(ton?.balanceUsd ?? snapshot.tonBalanceUsd ?? 0);
}

export function getPrimaryPortfolioValue(snapshot: WalletSnapshot): number {
  const tonUsd = getTonWorkingCapitalUsd(snapshot);
  const usdtUsd = getTotalUsdtUsd(snapshot);
  const total = roundUsd(tonUsd + usdtUsd);

  return total;
}

export function buildPrimaryPortfolioBreakdown(
  snapshot: WalletSnapshot
): PrimaryPortfolioBreakdown {
  const tonWorkingCapitalUsd = getTonWorkingCapitalUsd(snapshot);
  const usdtBalanceUsd = getTotalUsdtUsd(snapshot);
  const idleUsdtUsd = getUndeployedUsdtUsd(snapshot);
  const portfolioValueUsd = getPrimaryPortfolioValue(snapshot);
  const usdtToken = getUsdtTokens(snapshot)[0];

  const breakdown: PrimaryPortfolioBreakdown = {
    tonWorkingCapitalUsd,
    tonBalance: snapshot.tonBalance,
    usdtBalanceUsd,
    usdtBalance: usdtToken?.balance ?? 0,
    portfolioValueUsd,
    idleUsdtUsd,
    deployedUsdtUsd: roundUsd(Math.max(0, usdtBalanceUsd - idleUsdtUsd)),
    tonPriceUsd: snapshot.tonPriceUsd,
  };

  return breakdown;
}

export function getPrimaryConcentration(snapshot: WalletSnapshot): {
  asset: string;
  percent: number;
} {
  const total = getPrimaryPortfolioValue(snapshot) || 1;
  const tonUsd = getTonWorkingCapitalUsd(snapshot);
  const usdtUsd = getTotalUsdtUsd(snapshot);

  if (usdtUsd >= tonUsd) {
    return { asset: "USDT", percent: Math.round((usdtUsd / total) * 100) };
  }
  return { asset: "TON", percent: Math.round((tonUsd / total) * 100) };
}
