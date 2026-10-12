import { parseAbi } from "viem";

export const HUB_VAULT = "0x40B0BcCFfDa3FFB423ce88ca304d6cfA9A6AAb2e" as const;
export const USDC = "0x2B3370eE501B4a559b57D449569354196457D8Ab" as const;
export const USDC_DECIMALS = 6;

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const vaultAbi = parseAbi([
  "function deposit(uint256 amount, uint8 tier)",
]);

// matches RiskTier { Conservative=0, Balanced=1, Aggressive=2 }
export const TIER_INDEX = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
} as const;