// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title OddsRouter - the smallest router that can trade and fund Contingent's odds pool on Uniswap v4
/// @notice v4 has no built-in router: every action runs inside `PoolManager.unlock`. This contract does exactly
///         two things for ERC-20 pairs: an exact-input swap and adding liquidity. The caller approves this
///         router for the tokens they pay with.
contract OddsRouter is IUnlockCallback {
  using SafeERC20 for IERC20;

  IPoolManager public immutable manager;

  struct Call {
    address sender;
    PoolKey key;
    bool isSwap;
    SwapParams swap;
    ModifyLiquidityParams liquidity;
  }

  constructor(IPoolManager manager_) {
    manager = manager_;
  }

  /// @notice Sell exactly `amountIn` of one side for the other. Reverts if less than `minOut` comes back.
  function swapExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint256 minOut) external returns (uint256 out) {
    SwapParams memory p = SwapParams({
      zeroForOne: zeroForOne,
      amountSpecified: -int256(amountIn),
      sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
    });
    ModifyLiquidityParams memory none;
    BalanceDelta d = abi.decode(manager.unlock(abi.encode(Call(msg.sender, key, true, p, none))), (BalanceDelta));
    out = uint256(uint128(zeroForOne ? d.amount1() : d.amount0()));
    require(out >= minOut, "OddsRouter: slippage");
  }

  /// @notice Add `liquidity` between two ticks; the tokens owed are pulled from the caller.
  function addLiquidity(PoolKey calldata key, int24 tickLower, int24 tickUpper, uint128 liquidity) external {
    ModifyLiquidityParams memory p = ModifyLiquidityParams({
      tickLower: tickLower,
      tickUpper: tickUpper,
      liquidityDelta: int256(uint256(liquidity)),
      salt: bytes32(uint256(uint160(msg.sender)))
    });
    SwapParams memory none;
    manager.unlock(abi.encode(Call(msg.sender, key, false, none, p)));
  }

  function unlockCallback(bytes calldata data) external override returns (bytes memory) {
    require(msg.sender == address(manager), "OddsRouter: not manager");
    Call memory c = abi.decode(data, (Call));
    BalanceDelta d;
    if (c.isSwap) {
      d = manager.swap(c.key, c.swap, "");
    } else {
      (d,) = manager.modifyLiquidity(c.key, c.liquidity, "");
    }
    _settle(c.key.currency0, c.sender, d.amount0());
    _settle(c.key.currency1, c.sender, d.amount1());
    return abi.encode(d);
  }

  /// @dev negative = the user owes the pool; positive = the pool owes the user
  function _settle(Currency currency, address user, int128 amount) internal {
    if (amount < 0) {
      manager.sync(currency);
      IERC20(Currency.unwrap(currency)).safeTransferFrom(user, address(manager), uint256(uint128(-amount)));
      manager.settle();
    } else if (amount > 0) {
      manager.take(currency, user, uint256(uint128(amount)));
    }
  }

  /// @notice sqrtPriceX96 at which the pool implies `probBps` for YES (helper for initialising the pool).
  function sqrtPriceForProb(uint256 probBps, bool yesIsCurrency0) external pure returns (uint160) {
    require(probBps > 0 && probBps < 10_000, "OddsRouter: prob");
    (uint256 num, uint256 den) = yesIsCurrency0 ? (probBps, 10_000 - probBps) : (10_000 - probBps, probBps);
    return uint160(Math.sqrt(Math.mulDiv(num, 1 << 192, den)));
  }
}
