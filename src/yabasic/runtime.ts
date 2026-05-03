import type { Expr, Stmt } from "./ast";
import { tokenize } from "./lexer";
import { parse } from "./parser";

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

class Scope {
  private numVars = new Map<string, number>();
  private strVars = new Map<string, string>();

  getNum(name: string): number {
    return this.numVars.get(name) ?? 0;
  }
  getStr(name: string): string {
    return this.strVars.get(name) ?? "";
  }
  setNum(name: string, value: number) {
    this.numVars.set(name, value);
  }
  setStr(name: string, value: string) {
    this.strVars.set(name, value);
  }
}

class Interpreter {
  private scope = new Scope();
  constructor(private io: IO, private builtins: Builtins) {}

  async execBlock(stmts: Stmt[]): Promise<void> {
    for (const s of stmts) {
      await this.exec(s);
    }
  }

  private async exec(s: Stmt): Promise<void> {
    switch (s.kind) {
      case "let": {
        const v = await this.eval(s.expr);
        if (s.isString) {
          this.scope.setStr(s.name, toStr(v));
        } else {
          this.scope.setNum(s.name, toNum(v));
        }
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
          // semi: no separator
        }
        if (s.newline) line += "\n";
        this.io.print(line);
        return;
      }
      case "input": {
        const promptStr = s.prompt ?? "";
        if (promptStr) this.io.print(promptStr);
        const value = await this.io.input(s.prompt);
        if (s.isString) {
          this.scope.setStr(s.name, value);
        } else {
          const n = parseFloat(value);
          this.scope.setNum(s.name, isNaN(n) ? 0 : n);
        }
        return;
      }
      case "if": {
        const c = toNum(await this.eval(s.cond));
        if (c !== 0) await this.execBlock(s.then);
        else await this.execBlock(s.else);
        return;
      }
      case "for": {
        const fromV = toNum(await this.eval(s.from));
        const toV = toNum(await this.eval(s.to));
        const stepV = s.step !== null ? toNum(await this.eval(s.step)) : 1;
        if (stepV === 0) throw new RuntimeError("FOR STEP cannot be zero");
        this.scope.setNum(s.var, fromV);
        while (true) {
          const cur = this.scope.getNum(s.var);
          if ((stepV > 0 && cur > toV) || (stepV < 0 && cur < toV)) break;
          await this.execBlock(s.body);
          this.scope.setNum(s.var, this.scope.getNum(s.var) + stepV);
        }
        return;
      }
      case "while": {
        while (toNum(await this.eval(s.cond)) !== 0) {
          await this.execBlock(s.body);
        }
        return;
      }
      case "repeat": {
        do {
          await this.execBlock(s.body);
        } while (toNum(await this.eval(s.cond)) === 0);
        return;
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
        return e.isString ? this.scope.getStr(e.name) : this.scope.getNum(e.name);
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
        const args = [];
        for (const a of e.args) args.push(await this.eval(a));
        const upper = e.name.toUpperCase();
        const builtin = this.builtins[upper];
        if (!builtin) throw new RuntimeError(`unknown function: ${e.name}`);
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
};
