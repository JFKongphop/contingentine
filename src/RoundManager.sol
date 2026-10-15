// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IRoundFeed {
  function latestRoundData() external view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80);
}

interface IRoundMarket {
  function createMarket(bytes32 eventId, address resolver, uint64 closeTime, uint256 seedYes, uint256 seedNo) external;
  function resolve(bytes32 eventId) external;
  function isResolved(bytes32 eventId) external view returns (bool resolved, bool outcomeYes);
}

interface IRoundResolver {
  function registerAtExpiry(bytes32 eventId, address feed, int256 threshold, bool below, uint64 deadline) external;
  function outcome(bytes32 eventId) external view returns (bool resolved, bool yes);
}

interface IRoundVault {
  function earmark(bytes32 eventId, uint256 capacity) external;
  function freeReserve() external view returns (uint256);
}

interface IRoundHedge {
  function finaliseEvent(bytes32 eventId) external;
}

interface IRoundProtected {
  function setEvent(bytes32 eventId) external;
}

/// @dev Chainlink Automation's interface, declared here so the repo needs no extra dependency.
interface AutomationCompatibleInterface {
  function checkUpkeep(bytes calldata checkData) external returns (bool upkeepNeeded, bytes memory performData);
  function performUpkeep(bytes calldata performData) external;
}

/// @title RoundManager - protection rounds that run themselves, driven by Chainlink Automation
/// @notice Contingent's protection is sold in rounds: "ETH ≥ strike at expiry". This contract owns the three
///         admin steps a round needs (register the strike, create the odds market, point ProtectedPerp at it),
///         so no team wallet has to be online. Chainlink Automation calls `performUpkeep` when
///           - the live round has expired → it is resolved from the Chainlink ETH/USD feed, and
///           - there is no open round    → the next one opens.
///         Each strike is set `strikeOffsetBps` BELOW the price at the moment the round opens, so a long's
///         protection (the NO side) pays when ETH ends the round more than that far down.
///
///         `performUpkeep` re-checks every condition and takes no input, so anyone may call it; a wrong or
///         early call simply reverts. Decrypting payouts is not done here: that step needs the Fhenix
///         threshold network and stays with the keeper.
/// @dev Must own EventMarket, PriceThresholdResolver and ProtectedPerp, and be authorised on the vault.
contract RoundManager is AutomationCompatibleInterface {
  uint256 public constant BPS = 10_000;
  uint256 public constant STALENESS = 3 hours;

  IRoundFeed public immutable feed;
  IRoundMarket public immutable market;
  IRoundResolver public immutable resolver;
  IRoundVault public immutable vault;
  IRoundHedge public immutable hedge;
  IRoundProtected public immutable protectedPerp;
  address public owner;

  // round parameters (owner can retune; they apply from the next round)
  uint256 public strikeOffsetBps = 500; // strike = spot − 5%
  uint64 public duration = 1 days;
  uint256 public capacity = 30_000e6; // USDG earmarked per round, capped by the vault's free reserve
  uint256 public seedYes = 85; // opening odds: 85% that ETH ends above the strike
  uint256 public seedNo = 15;

  struct Round {
    bytes32 eventId;
    int256 strike; // feed decimals
    uint64 deadline;
  }

  uint256 public roundNumber;
  mapping(uint256 => Round) public rounds;

  event RoundOpened(uint256 indexed round, bytes32 indexed eventId, int256 strike, uint64 deadline, uint256 capacity);
  event RoundResolved(uint256 indexed round, bytes32 indexed eventId, bool outcomeYes);
  event ParamsSet(uint256 strikeOffsetBps, uint64 duration, uint256 capacity, uint256 seedYes, uint256 seedNo);

  constructor(address feed_, address market_, address resolver_, address vault_, address hedge_, address protected_) {
    feed = IRoundFeed(feed_);
    market = IRoundMarket(market_);
    resolver = IRoundResolver(resolver_);
    vault = IRoundVault(vault_);
    hedge = IRoundHedge(hedge_);
    protectedPerp = IRoundProtected(protected_);
    owner = msg.sender;
  }

  function setParams(uint256 offsetBps, uint64 duration_, uint256 capacity_, uint256 seedYes_, uint256 seedNo_) external {
    require(msg.sender == owner, "Rounds: not owner");
    require(offsetBps > 0 && offsetBps < BPS, "Rounds: offset");
    require(duration_ >= 1 minutes, "Rounds: duration");
    require(seedYes_ > 0 && seedNo_ > 0, "Rounds: seed both sides");
    (strikeOffsetBps, duration, capacity, seedYes, seedNo) = (offsetBps, duration_, capacity_, seedYes_, seedNo_);
    emit ParamsSet(offsetBps, duration_, capacity_, seedYes_, seedNo_);
  }

  function currentEvent() public view returns (bytes32) {
    return rounds[roundNumber].eventId;
  }

  /// @notice What `performUpkeep` would do now: 0 nothing, 1 resolve the live round and open the next,
  ///         2 open a round (none is live).
  function pending() public view returns (uint8) {
    bytes32 e = currentEvent();
    if (e == bytes32(0)) return 2;
    (bool done,) = market.isResolved(e);
    if (done) return 2;
    try resolver.outcome(e) returns (bool ok, bool) {
      return ok ? 1 : 0;
    } catch {
      return 0; // e.g. a stale feed: wait
    }
  }

  /// @inheritdoc AutomationCompatibleInterface
  function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory) {
    return (pending() != 0, "");
  }

  /// @inheritdoc AutomationCompatibleInterface
  function performUpkeep(bytes calldata) external override {
    uint8 action = pending();
    require(action != 0, "Rounds: nothing to do");
    if (action == 1) {
      bytes32 e = currentEvent();
      market.resolve(e);
      (, bool yes) = market.isResolved(e);
      emit RoundResolved(roundNumber, e, yes);
    }
    _open();
  }

  function _open() internal {
    (, int256 price,, uint256 updatedAt,) = feed.latestRoundData();
    require(price > 0, "Rounds: bad price");
    require(block.timestamp - updatedAt < STALENESS, "Rounds: stale feed");

    uint256 n = ++roundNumber;
    bytes32 e = keccak256(abi.encode(address(this), n));
    int256 strike = (price * int256(BPS - strikeOffsetBps)) / int256(BPS);
    uint64 deadline = uint64(block.timestamp) + duration;
    rounds[n] = Round({eventId: e, strike: strike, deadline: deadline});

    resolver.registerAtExpiry(e, address(feed), strike, false, deadline); // YES when ETH ≥ strike after the deadline
    market.createMarket(e, address(resolver), deadline, seedYes, seedNo);
    uint256 free = vault.freeReserve();
    uint256 cap = capacity < free ? capacity : free;
    if (cap > 0) vault.earmark(e, cap);
    protectedPerp.setEvent(e);

    // free the capacity of the round before last: its winners have had a whole round to be paid
    if (n > 2) {
      try hedge.finaliseEvent(rounds[n - 2].eventId) {} catch {}
    }
    emit RoundOpened(n, e, strike, deadline, cap);
  }
}
