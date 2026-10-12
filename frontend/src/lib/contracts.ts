import { parseAbi } from "viem";

// HyperEVM testnet (998)
export const HUB_VAULT = "0x40B0BcCFfDa3FFB423ce88ca304d6cfA9A6AAb2e" as const;
export const USDC = "0x2B3370eE501B4a559b57D449569354196457D8Ab" as const;
export const USDC_DECIMALS = 6;

// Robinhood Chain testnet (46630). Same address as the hub, different chain.
export const RH_VAULT = "0x40B0BcCFfDa3FFB423ce88ca304d6cfA9A6AAb2e" as const;
export const STOCK_DECIMALS = 18;

export const STOCK_TOKENS = {
  TSLA: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E",
  AMZN: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02",
  AMD: "0x71178BAc73cBeb415514eB542a8995b82669778d",
  NFLX: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93",
  PLTR: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0",
} as const;

export type StockSymbol = keyof typeof STOCK_TOKENS;

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const vaultAbi = parseAbi([
  "function deposit(uint256 amount, uint8 tier)",
]);

export const rhVaultAbi = parseAbi([
  "function deposit(address token, uint256 amount, uint8 tier)",
  "function claimYield(address token)",
]);

// matches RiskTier { Conservative=0, Balanced=1, Aggressive=2 }
export const TIER_INDEX = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
} as const;