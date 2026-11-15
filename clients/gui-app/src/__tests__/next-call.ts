import type { Mock } from "vitest";

/**
 * Resolves with the arguments of the spy's next call, so a test waits on the
 * call the code makes rather than polling a timer for it. Arm it before the
 * action that leads to the call.
 */
export function nextCallOf<Args extends Array<unknown>>(
  spy: Mock<(...args: Args) => void>,
): Promise<Args> {
  return new Promise((resolve) => {
    spy.mockImplementationOnce((...args) => {
      resolve(args);
    });
  });
}
