// Contingent — two live deployments, chosen at build time with NEXT_PUBLIC_CHAIN.
//   (unset)   Ethereum Sepolia (11155111): the full stack with automatic rounds (Chainlink CRE) and
//             the zero-knowledge gateway; the one testnet where Fhenix, Chainlink, Uniswap v4 and 1inch all live.
//   arbitrum  Arbitrum Sepolia (421614): the original buildathon deployment. See ../../../DEPLOYMENTS.md

export const ON_SEPOLIA = process.env.NEXT_PUBLIC_CHAIN !== 'arbitrum';

export const CHAIN = ON_SEPOLIA
  ? {
      id: 11155111,
      name: 'Ethereum Sepolia',
      rpc: process.env.NEXT_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
      explorer: 'https://sepolia.etherscan.io',
      // Sepolia charges far more gas for new storage than a local estimate assumes, so fixed gas limits scale up
      gasFactor: 6,
    }
  : {
      id: 421614,
      name: 'Arbitrum Sepolia',
      rpc: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
      explorer: 'https://sepolia.arbiscan.io',
      gasFactor: 1,
    };

/** A fixed gas limit, scaled for the chain in use. */
export const gas = (n: number) => n * CHAIN.gasFactor;

// kept under their old names so existing imports keep working
export const ARBITRUM_SEPOLIA_CHAIN_ID = CHAIN.id;
export const ARBITRUM_SEPOLIA_RPC = CHAIN.rpc;

const ZERO = '0x0000000000000000000000000000000000000000';

const ARBITRUM_ADDRESSES = {
  hedge: '0x670b2dC8EEa68Cb6BA2caC4021FCE02b85C51Dcf',
  cusdg: '0xd8f57E64bc235D4bceF8D2f791BDf46908408F94',
  collateral: '0x4E4cb1b3B326C79FDFD51E14C26C9bDA7a5F5898',
  positions: '0xA39438870296a652A268B7A187C5a540bf89cD36',
  market: '0xD81751083861194276BC401Fc94052De0ea3A97a',
  vault: '0xB73fF66E6768eC894BaF56E48e93dBBaAD745DCf',
  router: '0xF0573896166052659A90Fa3626A0ff36637353CF',
  positionNFT: '0xA526FADAA46544da9b54EC97Ab7e1B80DE00a542',
  resolver: '0xd4fa6b3b391Cc75eED61427F08051E219cB46cc4',
  eventHook: '0xc809EecCc81148B72bFCEB6F812e0deEA982C8C0',
  perp: '0x8547089cE2380ec20Ad68c5fff4E661863452718', // ConfidentialPerp (ETH-PERP)
  protectedPerp: '0xf97AA238bA1e462c05863eFa9cc4E13d240Ffb2c', // ProtectedPerp (perp + event protection, one tx)
  usdg: '0x766f287682ecfbD8f97551727684c7d7aD67a53f', // MockUSDG (6-dec)
  feed: '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165', // real Chainlink ETH/USD (8-dec) on Arb Sepolia
  roundManager: ZERO, // rounds are opened by a keeper script on this deployment
  gateway: '0x23fD444b2e5a6b72d788FEcb62161990b63e6E74', // ShieldedGateway (verifier 0x526d4d472637C38e6D534b1884432ee5952d0e9E)
  oddsYes: ZERO, // no Uniswap v4 odds pool on this deployment
  oddsNo: ZERO,
  oddsRouter: ZERO,
  aqua: ZERO, // 1inch Aqua is not deployed on Arbitrum Sepolia
  aquaReserve: ZERO,
};

// Ethereum Sepolia, deployed 2026-10-15 by script/DeploySepolia.s.sol (+ CRERoundKeeper via forge create)
const SEPOLIA_ADDRESSES: typeof ARBITRUM_ADDRESSES = {
  hedge: '0xa2a98142d0203106798016E4D3e4d5d46cC4A6C8',
  cusdg: '0x2d01A8692D9842fa8C924E52b445bf07d0E446e3',
  collateral: '0xe6351fD6Eceb0e70E3Be6af1f85C3df50B20fb02',
  positions: '0x00aEcbf705C9B9A23eccF919d547F112875c73f6',
  market: '0xa3439c99E010D1882F8865b5380fA65aAFA88700',
  vault: '0xEE89B955F097C90e995b274a105fA837F167070D',
  router: '0x90E73FA3F917dAd79fA98DcABc5fF7126845328A',
  positionNFT: '0xF1d04F92EF261864886C6dD31Fc96e2bf3958a32',
  resolver: '0xEA088FA50e9F9A13394e6395A806925ea74DEaC2',
  eventHook: '0x84dC66Ce19d5B2e51337B5C2C92bf021db2D08c0', // Uniswap v4 hook: guards the odds pool and serves its price
  perp: '0x5b8D077F3b10AD1338C1e8A983CC82CC9Aa385e7',
  protectedPerp: '0x79B4B74B5bCf1bBC6932fEE31dd199F3469B0c31',
  usdg: '0xBad4bD3148f18495D748D326bce53d4DD3473DD9', // MockUSDG (6-dec)
  feed: '0x694AA1769357215DE4FAC081bf1f309aDC325306', // real Chainlink ETH/USD (8-dec) on Ethereum Sepolia
  roundManager: '0x9D6520b5334ef79e66f6fcE2aE54911acAb693ed', // opens and resolves rounds; rolled by a Chainlink CRE workflow
  gateway: '0x98c8eCaD5EbB6B6Db18cF164713593fdd2B93521', // ShieldedGateway (verifier 0x75A3b30acb277c8aFc6f0ba8567b505EC9302569)
  oddsYes: '0x72eB5870a166B86Cf290489F356e880A87545E1c',
  oddsNo: '0xC55038bF5736C5D2602e20B01B4EB8B89F501cCc',
  oddsRouter: '0xd2f4Ceda99d175Cb9375F17e15588A758E7055d1',
  aqua: '0x499943E74FB0cE105688beeE8Ef2ABec5D936d31', // 1inch Aqua
  aquaReserve: '0x73d0aA485D4add3A7A6fb9c9Cb3C46B1c20F8774',
};

export const ADDRESSES = ON_SEPOLIA ? SEPOLIA_ADDRESSES : ARBITRUM_ADDRESSES;

// ShieldedGateway (zero-knowledge entry / exit)
export const GATEWAY_ADDRESS = process.env.NEXT_PUBLIC_GATEWAY || ADDRESSES.gateway;
export const NOTE_SIZES = [100, 1000]; // USDG, must match the amounts the gateway was deployed with

// The live round: "ETH >= strike", resolved by the real Chainlink ETH/USD feed.
// On Arbitrum the strike is fixed at $2,500. On Ethereum Sepolia every round has its own strike (5% under the
// price when it opened), so these two are live bindings that `setLiveStrike` updates from the RoundManager.
export const EVENT_ID = ON_SEPOLIA
  ? '0x1d33a105e84e6b8dd2562425c43b1bbbd8f464d7e14905719728a6641d954dba'
  : '0x39202be02b06dc6b76ca67169428a0974173687d9b46a92d8aa36b906986849e';
export let STRIKE_USD = ON_SEPOLIA ? 2240 : 2500;
export let EVENT_LABEL = `ETH ≥ $${STRIKE_USD.toLocaleString()}`;
export function setLiveStrike(usd: number) {
  STRIKE_USD = usd;
  EVENT_LABEL = `ETH ≥ $${Math.round(usd).toLocaleString()}`;
}
export const EVENT_YES_WHEN = 'above'; // YES when ETH >= strike
export const BINANCE_SYMBOL = 'ETHUSDT';
export const USDG_DECIMALS = 6;
export const FEED_DECIMALS = 8;
export const BPS = 10_000;

// ── Human-readable ABIs (ethers v6) — only the functions the UI calls ──

export const HEDGE_ABI = [
  'function openHedge(bytes32 eventId, bytes32 encSize, bytes sizeProof, bytes32 encIsYes, bytes dirProof) returns (uint256)',
  'function closeHedge(uint256 positionId)',
  'function requestSettlement(uint256 positionId)',
  'function fulfillSettlement(uint256 positionId, uint64 plaintextPayout, bytes signature)',
  'function requestPremiumSweep(bytes32 eventId) returns (bytes32)',
  'function sweepPremiums(bytes32 eventId, uint64 totalPremium, bytes signature)',
  'function finaliseEvent(bytes32 eventId)',
  'function payoutHandle(uint256 positionId) view returns (bytes32)',
  'function paid(uint256 positionId) view returns (bool)',
  'event HedgeOpened(uint256 indexed positionId, address indexed user, bytes32 indexed eventId, uint32 entryProbBps)',
];

export const PERP_ABI = [
  'function openPosition(bytes32 encCollateral, bytes collateralProof, bytes32 encIsLong, bytes directionProof, uint64 leverage) returns (uint256)',
  'function requestClose(uint256 id)',
  'function fulfillClose(uint256 id, uint64 payout, bytes payoutSig, uint64 collateralAmount, bytes collateralSig)',
  'function requestLiquidationCheck(uint256 id)',
  'function resolveLiquidationCheck(uint256 id, bool isLiquidatable, bytes signature)',
  'function finalizeLiquidation(uint256 id, uint64 collateralAmount, bytes signature)',
  'function getPosition(uint256 id) view returns (tuple(address owner, uint64 leverage, uint256 entryPrice, uint256 openedAt, uint8 status, bytes32 collateral, bytes32 size, bytes32 isLong, bytes32 maxProfit, bytes32 payout, bytes32 liquidatable, uint256 markPriceAtRequest, address keeper))',
  'function positionsOf(address user) view returns (uint256[])',
  'function markPrice() view returns (uint256)',
  'function houseLiquidity() view returns (uint256)',
  'function openCount() view returns (uint256)',
  'function nextPositionId() view returns (uint256)',
  'event PositionOpened(uint256 indexed id, address indexed owner, uint64 leverage, uint256 entryPrice)',
];

export const PROTECTED_ABI = [
  'function openProtected(bytes32 encCollateral, bytes collateralProof, bytes32 encIsLong, bytes directionProof, uint64 leverage, bytes32 encCover, bytes coverProof) returns (uint256 perpId, uint256 hedgeId)',
  'function protectionOf(uint256 perpId) view returns (uint256)',
  'function eventId() view returns (bytes32)',
  'event ProtectedOpened(address indexed trader, uint256 indexed perpId, uint256 indexed hedgeId, uint64 leverage)',
];

// Perp constants (mirror ConfidentialPerp.sol)
export const PERP = {
  MAX_LEVERAGE: 10,
  MAX_PROFIT_MULT: 5,
  MAINTENANCE_BPS: 500,
  STATUS: ['None', 'Open', 'Closing', 'LiqCheck', 'Liquidating', 'Closed'] as const,
};

export const MARKET_ABI = [
  'function probYesBps(bytes32 eventId) view returns (uint256)',
  'function isOpenForHedging(bytes32 eventId) view returns (bool)',
  'function isResolved(bytes32 eventId) view returns (bool resolved, bool outcomeYes)',
  'function resolve(bytes32 eventId)',
  'function stake(bytes32 eventId, bool yes, uint256 amount)',
  'function getMarket(bytes32 eventId) view returns (uint256 yesPool, uint256 noPool, uint64 closeTime, address resolver, bool resolved, bool outcomeYes, bool exists)',
  'event Staked(bytes32 indexed eventId, bool yes, uint256 amount, uint32 newProbYesBps)',
  'event MarketResolved(bytes32 indexed eventId, bool outcomeYes)',
];

export const VAULT_ABI = [
  'function totalReserve() view returns (uint256)',
  'function earmarked() view returns (uint256)',
  'function freeReserve() view returns (uint256)',
  'function deposit(uint256 assets) returns (uint256)',
  'function withdraw(uint256 shares) returns (uint256)',
  'function earmark(bytes32 eventId, uint256 capacity)',
  'function finaliseEvent(bytes32 eventId)',
  'function sharesOf(address) view returns (uint256)',
  'function sharePriceWad() view returns (uint256)',
  'function committedYes(bytes32 eventId) view returns (bytes32)',
  'function committedNo(bytes32 eventId) view returns (bytes32)',
  'function premiumPool(bytes32 eventId) view returns (bytes32)',
  'function events(bytes32) view returns (uint256 capacity, uint256 paidOut, bool active, bool premiumsSwept)',
];

export const CUSDG_ABI = [
  'function wrap(uint256 amount)',
  'function confidentialTransferAndCall(address to, bytes32 amount, bytes inputProof, bytes data) returns (bytes32)',
  'function confidentialBalanceOf(address account) view returns (bytes32)',
  'function setOperator(address operator, uint48 until)',
  'function totalWrapped() view returns (uint256)',
];

export const COLLATERAL_ABI = [
  'function withdraw(bytes32 encAmount, bytes inputProof)',
  'function myCollateral() view returns (bytes32)',
];

export const POSITIONS_ABI = [
  'function get(uint256 positionId) view returns (tuple(bytes32 size, bytes32 premium, bytes32 isYes, bytes32 eventId, uint32 entryProbBps, uint256 openedAt, address owner, bool isOpen, bool settled))',
  'function positionsOf(address, uint256) view returns (uint256)',
  'function nextPositionId() view returns (uint256)',
];

export const NFT_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOrZero(uint256 tokenId) view returns (address)',
];

export const RESOLVER_ABI = [
  'function outcome(bytes32 eventId) view returns (bool resolved, bool yes)',
];

export const USDG_ABI = [
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export const FEED_ABI = [
  'function setAnswer(int256 newAnswer)',
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)',
];

// ── Demo roles (local anvil-style keys; DEMO ONLY, never mainnet funds) ──
export interface DemoRole {
  id: 'hedger' | 'lp' | 'keeper';
  name: string;
  badge: string;
  color: string; // neo accent
  description: string;
}

export const DEMO_ROLES: Record<'hedger' | 'lp' | 'keeper', DemoRole> = {
  hedger: {
    id: 'hedger',
    name: 'Hedger',
    badge: 'HEDGER',
    color: 'cyan',
    description: 'Opens a private, encrypted hedge on an event — size and side hidden.',
  },
  lp: {
    id: 'lp',
    name: 'Underwriter (LP)',
    badge: 'LP',
    color: 'green',
    description: 'Deposits USDG to back payouts and earn the premium spread.',
  },
  keeper: {
    id: 'keeper',
    name: 'Keeper',
    badge: 'KEEPER',
    color: 'yellow',
    description: 'Resolves the event and drives async settlement.',
  },
};

export const GATEWAY_ABI = [
  'function deposit(bytes32 inner, uint256 amount) returns (uint32)',
  'function spend(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, uint256 amount, address recipient, uint8 action)',
  'function getLeaves() view returns (bytes32[])',
  'function getLastRoot() view returns (bytes32)',
  'function isKnownRoot(bytes32 root) view returns (bool)',
  'function spent(bytes32 nullifierHash) view returns (bool)',
  'function allowedAmount(uint256 amount) view returns (bool)',
];

// The rolling YES/NO odds pool on Uniswap v4 (fee 0.3%, tick spacing 60, hook = EventHook)
export const YES_IS_CURRENCY0 = ADDRESSES.oddsYes.toLowerCase() < ADDRESSES.oddsNo.toLowerCase();
export const ODDS_POOL_KEY = {
  currency0: YES_IS_CURRENCY0 ? ADDRESSES.oddsYes : ADDRESSES.oddsNo,
  currency1: YES_IS_CURRENCY0 ? ADDRESSES.oddsNo : ADDRESSES.oddsYes,
  fee: 3000,
  tickSpacing: 60,
  hooks: ADDRESSES.eventHook,
};
export const HAS_ODDS_POOL = ADDRESSES.oddsRouter !== ZERO;
export const HAS_AQUA = ADDRESSES.aquaReserve !== ZERO;
export const HAS_ROUNDS = ADDRESSES.roundManager !== ZERO;

export const ODDS_ROUTER_ABI = [
  'function swapExactIn(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bool zeroForOne, uint256 amountIn, uint256 minOut) returns (uint256)',
];
export const ODDS_TOKEN_ABI = [
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];
export const AQUA_ABI = [
  'function ship(address app, bytes strategy, address[] tokens, uint256[] amounts) returns (bytes32)',
  'function dock(address app, bytes32 strategyHash, address[] tokens)',
];
export const AQUA_RESERVE_ABI = [
  'function strategyFor(address maker, uint256 nonce) view returns (bytes)',
  'function register(address maker, uint256 nonce)',
  'function available() view returns (uint256)',
  'function lineCount() view returns (uint256)',
  'function contributed(address maker) view returns (uint256)',
];
export const ROUTER_ABI = [
  'function topUpFromAqua(uint256 amount) returns (uint256)',
  'function owner() view returns (address)',
];

export const ROUND_MANAGER_ABI = [
  'function roundNumber() view returns (uint256)',
  'function rounds(uint256) view returns (bytes32 eventId, int256 strike, uint64 deadline)',
  'function pending() view returns (uint8)',
  'function performUpkeep(bytes performData)',
  'function duration() view returns (uint64)',
  'function strikeOffsetBps() view returns (uint256)',
];
