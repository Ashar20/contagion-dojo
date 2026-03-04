import type { DojoProvider } from "@dojoengine/core";
import type { Account, AccountInterface, CairoCustomEnum } from "starknet";

export function setupWorld(provider: DojoProvider) {
  const spawn = async (account: Account | AccountInterface) => {
    return await provider.execute(
      account,
      { contractName: "actions", entrypoint: "spawn", calldata: [] },
      "starter",
      { tip: 0 }
    );
  };

  const move = async (
    account: Account | AccountInterface,
    direction: CairoCustomEnum
  ) => {
    return await provider.execute(
      account,
      { contractName: "actions", entrypoint: "move", calldata: [direction] },
      "starter",
      { tip: 0 }
    );
  };

  const dig = async (account: Account | AccountInterface) => {
    return await provider.execute(
      account,
      { contractName: "actions", entrypoint: "dig", calldata: [] },
      "starter",
      { tip: 0 }
    );
  };

  return { actions: { spawn, move, dig } };
}
