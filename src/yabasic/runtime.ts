import type { Expr, Stmt, Param } from "./ast.js";
import { tokenize } from "./lexer.js";
import { parse } from "./parser.js";

export type Value = number | string;

export interface IO {
  print: (s: string) => void;
  /** Read a line of input. The prompt (if any) is already printed by the runtime. */
  input: (prompt: string | null) => Promise<string>;
}

export interface Builtins {
  [name: string]: (args: Value[]) => Value | Promise<Value>;
}

export class RuntimeError extends Error {}
class EndProgram extends Error {}
class ReturnSignal {
  constructor(public value: Value) {}
}

export interface RunOptions {
  io: IO;
  builtins?: Builtins;
}

export async function run(source: string, opts: RunOptions): Promise<void> {
  const tokens = tokenize(source);
  const program = parse(tokens);
  const interp = new Interpreter(opts.io, { ...defaultBuiltins, ...(opts.builtins ?? {}) });
  try {
    await interp.execBlock(program);
  } catch (e) {
    if (e instanceof EndProgram) return;
    throw e;
  }
}

interface SubDef {
  name: string;
  isString: boolean;
  params: Param[];
  body: Stmt[];
}

class Frame {
  numVars = new Map<string, number>();
  strVars = new Map<string, string>();
}

class Interpreter {
  private numVars = new Map<string, number>();
  private strVars = new Map<string, string>();
  private numArrays = new Map<string, number[]>();
  private strArrays = new Map<string, string[]>();
  private subs = new Map<string, SubDef>();
  private callStack: Frame[] = [];

  constructor(private io: IO, private builtins: Builtins) {}

  // --- variable scope ---
  private topFrame(): Frame | null {
    return this.callStack.length > 0 ? this.callStack[this.callStack.length - 1] : null;
  }
  private getNum(name: string): number {
    const f = this.topFrame();
    if (f && f.numVars.has(name)) return f.numVars.get(name)!;
    return this.numVars.get(name) ?? 0;
  }
  private getStr(name: string): string {
    const f = this.topFrame();
    if (f && f.strVars.has(name)) return f.strVars.get(name)!;
    return this.strVars.get(name) ?? "";
  }
  private setNum(name: string, value: number) {
    const f = this.topFrame();
    if (f && f.numVars.has(name)) {
      f.numVars.set(name, value);
      return;
    }
    this.numVars.set(name, value);
  }
  private setStr(name: string, value: string) {
    const f = this.topFrame();
    if (f && f.strVars.has(name)) {
      f.strVars.set(name, value);
      return;
    }
    this.strVars.set(name, value);
  }

  // --- main exec ---
  async execBlock(stmts: Stmt[]): Promise<void> {
    // Pre-pass: register sub definitions so they are available before their textual position.
    for (const s of stmts) {
      if (s.kind === "sub") this.subs.set(s.name.toLowerCase(), s);
    }
    for (const s of stmts) {
      if (s.kind === "sub") continue; // already registered; do not execute
      await this.exec(s);
    }
  }

  private async execBody(stmts: Stmt[]): Promise<void> {
    for (const s of stmts) {
      await this.exec(s);
    }
  }

  private async exec(s: Stmt): Promise<void> {
    switch (s.kind) {
      case "let": {
        const v = await this.eval(s.expr);
        if (s.isString) this.setStr(s.name, toStr(v));
        else this.setNum(s.name, toNum(v));
        return;
      }
      case "letidx": {
        const idx = Math.floor(toNum(await this.eval(s.index)));
        const v = await this.eval(s.expr);
        if (s.isString) {
          const arr = this.strArrays.get(s.name);
          if (!arr) throw new RuntimeError(`undeclared string array: ${s.name}`);
          if (idx < 0 || idx >= arr.length)
            throw new RuntimeError(`array index out of range: ${s.name}(${idx})`);
          arr[idx] = toStr(v);
        } else {
          const arr = this.numArrays.get(s.name);
          if (!arr) throw new RuntimeError(`undeclared numeric array: ${s.name}`);
          if (idx < 0 || idx >= arr.length)
            throw new RuntimeError(`array index out of range: ${s.name}(${idx})`);
          arr[idx] = toNum(v);
        }
        return;
      }
      case "dim": {
        const size = Math.floor(toNum(await this.eval(s.size)));
        if (size < 0 || !Number.isFinite(size)) {
          throw new RuntimeError(`invalid array size: ${size}`);
        }
        if (s.isString) this.strArrays.set(s.name, new Array(size).fill(""));
        else this.numArrays.set(s.name, new Array(size).fill(0));
        return;
      }
      case "print": {
        let line = "";
        for (const item of s.items) {
          if (item.expr) {
            const v = await this.eval(item.expr);
            line += toStr(v);
          }
          if (item.sep === "comma") line += "\t";
        }
        if (s.newline) line += "\n";
        this.io.print(line);
        return;
      }
      case "input": {
        const promptStr = s.prompt ?? "";
        if (promptStr) this.io.print(promptStr);
        const value = await this.io.input(s.prompt);
        if (s.isString) this.setStr(s.name, value);
        else {
          const n = parseFloat(value);
          this.setNum(s.name, isNaN(n) ? 0 : n);
        }
        return;
      }
      case "if": {
        const c = toNum(await this.eval(s.cond));
        if (c !== 0) await this.execBody(s.then);
        else await this.execBody(s.else);
        return;
      }
      case "for": {
        const fromV = toNum(await this.eval(s.from));
        const toV = toNum(await this.eval(s.to));
        const stepV = s.step !== null ? toNum(await this.eval(s.step)) : 1;
        if (stepV === 0) throw new RuntimeError("FOR STEP cannot be zero");
        this.setNum(s.var, fromV);
        while (true) {
          const cur = this.getNum(s.var);
          if ((stepV > 0 && cur > toV) || (stepV < 0 && cur < toV)) break;
          await this.execBody(s.body);
          this.setNum(s.var, this.getNum(s.var) + stepV);
        }
        return;
      }
      case "while": {
        while (toNum(await this.eval(s.cond)) !== 0) {
          await this.execBody(s.body);
        }
        return;
      }
      case "repeat": {
        do {
          await this.execBody(s.body);
        } while (toNum(await this.eval(s.cond)) === 0);
        return;
      }
      case "sub": {
        // Already pre-registered; nothing to execute at the definition site.
        this.subs.set(s.name.toLowerCase(), s);
        return;
      }
      case "return": {
        let v: Value;
        if (s.expr) v = await this.eval(s.expr);
        else v = "";
        throw new ReturnSignal(v);
      }
      case "expr": {
        await this.eval(s.expr);
        return;
      }
      case "end":
        throw new EndProgram();
    }
  }

  private async eval(e: Expr): Promise<Value> {
    switch (e.kind) {
      case "num":
        return e.value;
      case "str":
        return e.value;
      case "var":
        return e.isString ? this.getStr(e.name) : this.getNum(e.name);
      case "unary": {
        const v = await this.eval(e.expr);
        if (e.op === "-") return -toNum(v);
        if (e.op === "NOT") return toNum(v) === 0 ? 1 : 0;
        return 0;
      }
      case "binary": {
        const l = await this.eval(e.left);
        const r = await this.eval(e.right);
        return applyBinary(e.op, l, r);
      }
      case "call": {
        const args: Value[] = [];
        for (const a of e.args) args.push(await this.eval(a));
        // 1) Array indexing takes priority over builtins/subs.
        if (args.length === 1) {
          if (e.isString) {
            const arr = this.strArrays.get(e.name);
            if (arr) {
              const idx = Math.floor(toNum(args[0]));
              if (idx < 0 || idx >= arr.length)
                throw new RuntimeError(`array index out of range: ${e.name}(${idx})`);
              return arr[idx];
            }
          } else {
            const arr = this.numArrays.get(e.name);
            if (arr) {
              const idx = Math.floor(toNum(args[0]));
              if (idx < 0 || idx >= arr.length)
                throw new RuntimeError(`array index out of range: ${e.name}(${idx})`);
              return arr[idx];
            }
          }
        }
        // 2) User-defined SUB.
        const sub = this.subs.get(e.name.toLowerCase());
        if (sub) {
          if (sub.params.length !== args.length) {
            throw new RuntimeError(
              `${e.name} expects ${sub.params.length} args, got ${args.length}`
            );
          }
          const frame = new Frame();
          for (let i = 0; i < sub.params.length; i++) {
            const p = sub.params[i];
            if (p.isString) frame.strVars.set(p.name, toStr(args[i]));
            else frame.numVars.set(p.name, toNum(args[i]));
          }
          this.callStack.push(frame);
          let returnValue: Value = sub.isString ? "" : 0;
          try {
            await this.execBody(sub.body);
          } catch (sig) {
            if (sig instanceof ReturnSignal) returnValue = sig.value;
            else throw sig;
          } finally {
            this.callStack.pop();
          }
          return sub.isString ? toStr(returnValue) : toNum(returnValue);
        }
        // 3) Builtin.
        const upper = e.name.toUpperCase();
        const builtin = this.builtins[upper];
        if (!builtin) throw new RuntimeError(`unknown function/array: ${e.name}`);
        const result = await builtin(args);
        if (e.isString) return toStr(result);
        return result;
      }
    }
  }
}

function applyBinary(op: string, l: Value, r: Value): Value {
  if (op === "+") {
    if (typeof l === "string" || typeof r === "string") {
      return toStr(l) + toStr(r);
    }
    return l + r;
  }
  if (op === "=") return equals(l, r) ? 1 : 0;
  if (op === "<>") return equals(l, r) ? 0 : 1;
  if (op === "<") return compare(l, r) < 0 ? 1 : 0;
  if (op === ">") return compare(l, r) > 0 ? 1 : 0;
  if (op === "<=") return compare(l, r) <= 0 ? 1 : 0;
  if (op === ">=") return compare(l, r) >= 0 ? 1 : 0;
  const a = toNum(l);
  const b = toNum(r);
  switch (op) {
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) throw new RuntimeError("division by zero");
      return a / b;
    case "MOD":
      if (b === 0) throw new RuntimeError("division by zero");
      return a - Math.floor(a / b) * b;
    case "^":
      return Math.pow(a, b);
    case "AND":
      return a !== 0 && b !== 0 ? 1 : 0;
    case "OR":
      return a !== 0 || b !== 0 ? 1 : 0;
  }
  throw new RuntimeError(`unknown operator: ${op}`);
}

function equals(l: Value, r: Value): boolean {
  if (typeof l === "string" || typeof r === "string") {
    return toStr(l) === toStr(r);
  }
  return l === r;
}
function compare(l: Value, r: Value): number {
  if (typeof l === "string" || typeof r === "string") {
    const a = toStr(l);
    const b = toStr(r);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return (l as number) - (r as number);
}

export function toNum(v: Value): number {
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
export function toStr(v: Value): string {
  if (typeof v === "string") return v;
  if (Number.isInteger(v)) return v.toFixed(0);
  return String(v);
}

function getCryptoBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(out);
    return out;
  }
  // Fallback for test environments without globalThis.crypto.
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export const defaultBuiltins: Builtins = {
  LEN: ([s]) => toStr(s).length,
  "MID$": ([s, start, len]) => {
    const str = toStr(s);
    const i = Math.max(1, Math.floor(toNum(start)));
    const idx = i - 1;
    if (len === undefined) return str.slice(idx);
    return str.slice(idx, idx + Math.max(0, Math.floor(toNum(len))));
  },
  "LEFT$": ([s, n]) => toStr(s).slice(0, Math.max(0, Math.floor(toNum(n)))),
  "RIGHT$": ([s, n]) => {
    const str = toStr(s);
    const k = Math.max(0, Math.floor(toNum(n)));
    return k === 0 ? "" : str.slice(-k);
  },
  "STR$": ([n]) => toStr(toNum(n)),
  VAL: ([s]) => toNum(s),
  "CHR$": ([n]) => String.fromCharCode(Math.floor(toNum(n))),
  ASC: ([s]) => {
    const str = toStr(s);
    return str.length === 0 ? 0 : str.charCodeAt(0);
  },
  "UPPER$": ([s]) => toStr(s).toUpperCase(),
  "LOWER$": ([s]) => toStr(s).toLowerCase(),
  "TRIM$": ([s]) => toStr(s).trim(),
  INT: ([n]) => Math.floor(toNum(n)),
  ABS: ([n]) => Math.abs(toNum(n)),
  SQRT: ([n]) => Math.sqrt(toNum(n)),
  SIN: ([n]) => Math.sin(toNum(n)),
  COS: ([n]) => Math.cos(toNum(n)),
  TAN: ([n]) => Math.tan(toNum(n)),
  EXP: ([n]) => Math.exp(toNum(n)),
  LOG: ([n]) => Math.log(toNum(n)),
  RND: () => Math.random(),

  // 32-bit bitwise primitives (results are unsigned 32-bit).
  BITAND: ([a, b]) => ((toNum(a) & toNum(b)) >>> 0),
  BITOR: ([a, b]) => ((toNum(a) | toNum(b)) >>> 0),
  BITXOR: ([a, b]) => ((toNum(a) ^ toNum(b)) >>> 0),
  BITNOT: ([a]) => ((~toNum(a)) >>> 0),
  SHL: ([a, n]) => ((toNum(a) << (toNum(n) & 31)) >>> 0),
  SHR: ([a, n]) => ((toNum(a) >>> (toNum(n) & 31)) >>> 0),
  ROTR: ([a, n]) => {
    const x = toNum(a) >>> 0;
    const k = toNum(n) & 31;
    if (k === 0) return x;
    return ((x >>> k) | (x << (32 - k))) >>> 0;
  },
  ROTL: ([a, n]) => {
    const x = toNum(a) >>> 0;
    const k = toNum(n) & 31;
    if (k === 0) return x;
    return ((x << k) | (x >>> (32 - k))) >>> 0;
  },
  // 32-bit modular addition (a+b mod 2^32). Useful for SHA-256 etc.
  ADD32: ([a, b]) => (((toNum(a) >>> 0) + (toNum(b) >>> 0)) >>> 0),

  // Random byte 0..255 from a CSPRNG.
  RAND_BYTE: () => getCryptoBytes(1)[0],
};
