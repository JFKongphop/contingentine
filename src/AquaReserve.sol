// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev The subset of 1inch Aqua this contract uses (https://github.com/1inch/aqua).
interface IAqua {
  function rawBalances(address maker, address app, bytes32 strategyHash, address token)
    external
    view
    returns (uint248 balance, uint8 tokensCount);
  function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external;
}

/// @title AquaReserve - backstop liquidity for Contingent payouts, held in makers' own wallets via 1inch Aqua
/// @notice Normally an LP must deposit USDG into the UnderwriterVault, where it sits idle until a payout.
///         With 1inch Aqua a maker keeps the USDG in their wallet and only *ships* a virtual balance to this
///         contract (the Aqua "app"):
///           1. maker: `usdg.approve(aqua, amount)`
///           2. maker: `aqua.ship(address(this), strategy, [usdg], [amount])`   with `strategy = strategyFor(maker, nonce)`
///           3. anyone: `register(maker, nonce)`
///         When the vault reserve needs topping up, `SettlementRouter.topUpFromAqua` calls `provideUSDG` and
///         this contract pulls real USDG straight from the makers' wallets through Aqua, in registration order.
///         A maker withdraws their backing at any time by calling `aqua.dock` themselves.
///
///         Honest limit: this version records what each maker contributed (`contributed`) but does not yet pay
///         them for it; LP shares for Aqua makers are the next step.
contract AquaReserve {
  IAqua public immutable aqua;
  IERC20 public immutable usdg;
  address public immutable router; // the SettlementRouter allowed to draw

  struct Line {
    address maker;
    bytes32 strategyHash;
  }

  Line[] public lines;
  mapping(bytes32 => bool) public registered; // keccak(maker, strategyHash)
  mapping(address => uint256) public contributed; // USDG pulled from each maker so far

  event LineRegistered(address indexed maker, bytes32 indexed strategyHash, uint256 shipped);
  event Drawn(address indexed maker, bytes32 indexed strategyHash, uint256 amount);

  constructor(address aqua_, address usdg_, address router_) {
    aqua = IAqua(aqua_);
    usdg = IERC20(usdg_);
    router = router_;
  }

  /// @notice The strategy bytes a maker ships to Aqua for this app. Aqua stores `keccak256(strategy)`.
  function strategyFor(address maker, uint256 nonce) public view returns (bytes memory) {
    return abi.encode("contingent-payout-backstop", address(this), maker, nonce);
  }

  /// @notice Record a line the maker has already shipped on Aqua. Anyone may call; the Aqua balance is the proof.
  function register(address maker, uint256 nonce) external {
    bytes32 h = keccak256(strategyFor(maker, nonce));
    bytes32 id = keccak256(abi.encode(maker, h));
    require(!registered[id], "AquaReserve: registered");
    (uint248 shipped,) = aqua.rawBalances(maker, address(this), h, address(usdg));
    require(shipped > 0, "AquaReserve: nothing shipped");
    registered[id] = true;
    lines.push(Line(maker, h));
    emit LineRegistered(maker, h, shipped);
  }

  function lineCount() external view returns (uint256) {
    return lines.length;
  }

  /// @notice What line `i` can really deliver now: the Aqua balance, capped by the maker's wallet and allowance.
  function availableOf(uint256 i) public view returns (uint256 a) {
    Line memory l = lines[i];
    (uint248 shipped, uint8 tokensCount) = aqua.rawBalances(l.maker, address(this), l.strategyHash, address(usdg));
    if (tokensCount == 0 || tokensCount == type(uint8).max) return 0; // never shipped, or docked
    a = shipped;
    uint256 bal = usdg.balanceOf(l.maker);
    if (bal < a) a = bal;
    uint256 allowed = usdg.allowance(l.maker, address(aqua));
    if (allowed < a) a = allowed;
  }

  /// @notice Total USDG that makers are backing payouts with right now.
  function available() external view returns (uint256 total) {
    for (uint256 i = 0; i < lines.length; i++) {
      total += availableOf(i);
    }
  }

  /// @notice Pull up to `amount` USDG from makers' wallets to `to`. Only the SettlementRouter.
  /// @return provided the amount actually delivered (the router reverts if it is short)
  function provideUSDG(address to, uint256 amount) external returns (uint256 provided) {
    require(msg.sender == router, "AquaReserve: not router");
    for (uint256 i = 0; i < lines.length && provided < amount; i++) {
      uint256 take = availableOf(i);
      if (take == 0) continue;
      if (take > amount - provided) take = amount - provided;
      Line memory l = lines[i];
      aqua.pull(l.maker, l.strategyHash, address(usdg), take, to);
      contributed[l.maker] += take;
      provided += take;
      emit Drawn(l.maker, l.strategyHash, take);
    }
  }
}
