import { StonApiClient } from "@ston-fi/api";
import { Client, dexFactory } from "@ston-fi/sdk";
import { Address } from "@ton/core";
import type { SenderArguments } from "@ton/ton";

import type { TonConnectMessage } from "../types/wallet";

const TON_NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";
const STONFI_API = process.env.STONFI_API_URL ?? "https://api.ston.fi";
const TON_RPC =
  process.env.TONCENTER_ENDPOINT ?? "https://toncenter.com/api/v2/jsonRPC";
const SLIPPAGE = "0.01";

function senderArgsToTonConnect(msg: SenderArguments): TonConnectMessage {
  if (!msg.body) {
    throw new Error("Transaction body missing from STON.fi SDK");
  }
  return {
    address: msg.to.toString({ bounceable: true }),
    amount: msg.value.toString(),
    payload: msg.body.toBoc().toString("base64"),
  };
}

function createTonClient(): Client {
  return new Client({ endpoint: TON_RPC });
}

function parseWallet(address: string): Address {
  return Address.parse(address);
}

function isTonAsset(address: string): boolean {
  const normalized = address.toUpperCase();
  return normalized === TON_NATIVE || normalized === "TON";
}

export async function buildSwapTonConnectMessages(params: {
  walletAddress: string;
  offerAddress: string;
  askAddress: string;
  offerUnits: string;
  poolAddress?: string;
}): Promise<TonConnectMessage[]> {
  const apiClient = new StonApiClient({ baseURL: STONFI_API });
  const simulation = await apiClient.simulateSwap({
    offerAddress: params.offerAddress,
    askAddress: params.askAddress,
    offerUnits: params.offerUnits,
    slippageTolerance: SLIPPAGE,
    dexV2: true,
    poolAddress: params.poolAddress,
  });

  const tonClient = createTonClient();
  const dexContracts = dexFactory(simulation.router);
  const router = tonClient.open(
    dexContracts.Router.create(simulation.router.address)
  );
  const proxyTon = dexContracts.pTON.create(simulation.router.ptonMasterAddress);
  const userWalletAddress = parseWallet(params.walletAddress);
  const queryId = Date.now();

  let txParams: SenderArguments;

  if (isTonAsset(params.offerAddress)) {
    txParams = await router.getSwapTonToJettonTxParams({
      userWalletAddress,
      offerAmount: simulation.offerUnits,
      minAskAmount: simulation.minAskUnits,
      askJettonAddress: simulation.askAddress,
      proxyTon,
      queryId,
    });
  } else if (isTonAsset(params.askAddress)) {
    txParams = await router.getSwapJettonToTonTxParams({
      userWalletAddress,
      offerJettonAddress: simulation.offerAddress,
      offerAmount: simulation.offerUnits,
      minAskAmount: simulation.minAskUnits,
      proxyTon,
      queryId,
    });
  } else {
    txParams = await router.getSwapJettonToJettonTxParams({
      userWalletAddress,
      offerJettonAddress: simulation.offerAddress,
      askJettonAddress: simulation.askAddress,
      offerAmount: simulation.offerUnits,
      minAskAmount: simulation.minAskUnits,
      queryId,
    });
  }

  return [senderArgsToTonConnect(txParams)];
}

export async function buildLiquidityTonConnectMessages(params: {
  walletAddress: string;
  poolAddress: string;
  sendTokenAddress: string;
  otherTokenAddress: string;
  offerUnits: string;
}): Promise<TonConnectMessage[]> {
  const apiClient = new StonApiClient({ baseURL: STONFI_API });
  const simulation = await apiClient.simulateLiquidityProvision({
    provisionType: "Balanced",
    poolAddress: params.poolAddress,
    tokenA: params.sendTokenAddress,
    tokenB: params.otherTokenAddress,
    tokenAUnits: params.offerUnits,
    slippageTolerance: SLIPPAGE,
    walletAddress: params.walletAddress,
  });

  if (simulation.router.majorVersion < 2) {
    throw new Error("Liquidity payload requires STON.fi DEX v2 router");
  }

  const tonClient = createTonClient();
  const dexContracts = dexFactory(simulation.router);
  type V2Router = {
    getSingleSideProvideLiquidityTonTxParams: (
      params: Record<string, unknown>
    ) => Promise<SenderArguments>;
    getSingleSideProvideLiquidityJettonTxParams: (
      params: Record<string, unknown>
    ) => Promise<SenderArguments>;
  };
  const router = tonClient.open(
    dexContracts.Router.create(simulation.router.address)
  ) as unknown as V2Router;
  const userWalletAddress = parseWallet(params.walletAddress);
  const queryId = Date.now();
  const minLpOut = simulation.minLpUnits ?? "1";

  let txParams: SenderArguments;

  if (isTonAsset(params.sendTokenAddress)) {
    const proxyTon = dexContracts.pTON.create(simulation.router.ptonMasterAddress);
    txParams = await router.getSingleSideProvideLiquidityTonTxParams({
      userWalletAddress,
      proxyTon,
      otherTokenAddress: params.otherTokenAddress,
      sendAmount: params.offerUnits,
      minLpOut,
      queryId,
    });
  } else {
    txParams = await router.getSingleSideProvideLiquidityJettonTxParams({
      userWalletAddress,
      sendTokenAddress: params.sendTokenAddress,
      otherTokenAddress: params.otherTokenAddress,
      sendAmount: params.offerUnits,
      minLpOut,
      queryId,
    });
  }

  return [senderArgsToTonConnect(txParams)];
}
