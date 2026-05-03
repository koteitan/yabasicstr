import { finalizeEvent, generateSecretKey, type EventTemplate } from "nostr-tools/pure";
import { decode, nsecEncode } from "nostr-tools/nip19";
import type { Builtins } from "./runtime.js";
import { toNum, toStr, RuntimeError } from "./runtime.js";

function decodeNsec(nsec: string): Uint8Array {
  const trimmed = nsec.trim();
  let decoded: ReturnType<typeof decode>;
  try {
    decoded = decode(trimmed);
  } catch (e) {
    throw new RuntimeError(`invalid nsec: ${(e as Error).message}`);
  }
  if (decoded.type !== "nsec") {
    throw new RuntimeError(`expected nsec, got ${decoded.type}`);
  }
  return decoded.data as Uint8Array;
}

export function signEvent(nsec: string, content: string, kind = 1, tags: string[][] = []): string {
  const sk = decodeNsec(nsec);
  const tmpl: EventTemplate = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
  const evt = finalizeEvent(tmpl, sk);
  return JSON.stringify(evt, null, 2);
}

export const nostrBuiltins: Builtins = {
  /**
   * NOSTR_SIGN$(nsec$, content$ [, kind])
   * Returns a signed nostr event as JSON string.
   */
  "NOSTR_SIGN$": (args) => {
    if (args.length < 2) {
      throw new RuntimeError("NOSTR_SIGN$ requires (nsec$, content$ [, kind])");
    }
    const nsec = toStr(args[0]);
    const content = toStr(args[1]);
    const kind = args.length >= 3 ? Math.floor(toNum(args[2])) : 1;
    return signEvent(nsec, content, kind);
  },
  /**
   * NOSTR_NSEC$()
   * Returns a freshly-generated random nsec (bech32) string.
   */
  "NOSTR_NSEC$": () => nsecEncode(generateSecretKey()),
};
