import { run } from "../build/yabasic/index.js";

/**
 * Run a yabasic program with optional stdin lines and extra builtins.
 * Returns the captured stdout string.
 */
export async function runBasic(code, { stdin = [], builtins = {} } = {}) {
  let out = "";
  let i = 0;
  await run(code, {
    io: {
      print: (s) => {
        out += s;
      },
      input: async () => {
        if (i >= stdin.length) {
          throw new Error(`INPUT requested but no more stdin lines (idx=${i})`);
        }
        return stdin[i++];
      },
    },
    builtins,
  });
  return out;
}
