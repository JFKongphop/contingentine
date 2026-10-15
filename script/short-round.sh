#!/usr/bin/env bash
# Sepolia: wait for the live round to expire, roll it into a short one, and leave later rounds at one day.
# Used before a demo take that films settlement. Usage: short-round.sh [minutes, default 20]
set -euo pipefail
C=$(cd "$(dirname "$0")/.." && pwd)
env_of() { grep "^$1=" "$C/.env" | head -1 | cut -d= -f2- | tr -d '"'; }
PK=$(env_of PRIVATE_KEY); [[ $PK == 0x* ]] || PK=0x$PK
RPC=${SEPOLIA_RPC_URL:-$(env_of SEPOLIA_RPC_URL)}
RM=0x9D6520b5334ef79e66f6fcE2aE54911acAb693ed
MIN=${1:-20}
call() { cast call --rpc-url "$RPC" "$RM" "$@" | awk '{print $1}'; }
send() { cast send --rpc-url "$RPC" --private-key "$PK" "$RM" "$@" >/dev/null; }
params() { send "setParams(uint256,uint64,uint256,uint256,uint256)" "$(call 'strikeOffsetBps()(uint256)')" "$1" \
  "$(call 'capacity()(uint256)')" "$(call 'seedYes()(uint256)')" "$(call 'seedNo()(uint256)')"; }

echo "waiting for round $(call 'roundNumber()(uint256)') to expire…"
until [[ $(call 'pending()(uint8)') != 0 ]]; do sleep 20; done
params $((MIN * 60))
send "performUpkeep(bytes)" 0x --gas-limit 9000000
params 86400
echo "round $(call 'roundNumber()(uint256)') is live for $MIN minutes"
