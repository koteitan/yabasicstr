import type { Token } from "./lexer.js";
import type { Expr, PrintItem, Stmt } from "./ast.js";

export class ParseError extends Error {
  constructor(public line: number, public col: number, msg: string) {
    super(`Line ${line}:${col}: ${msg}`);
  }
}

export function parse(tokens: Token[]): Stmt[] {
  const p = new Parser(tokens);
  return p.parseProgram();
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(off = 0): Token {
    return this.tokens[this.pos + off];
  }
  private advance(): Token {
    return this.tokens[this.pos++];
  }
  private check(type: string, value?: string): boolean {
    const t = this.peek();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }
  private match(type: string, value?: string): Token | null {
    if (this.check(type, value)) return this.advance();
    return null;
  }
  private expect(type: string, value?: string, msg?: string): Token {
    if (this.check(type, value)) return this.advance();
    const t = this.peek();
    throw new ParseError(
      t.line,
      t.col,
      msg ?? `expected ${type}${value ? ` '${value}'` : ""} but got ${t.type} '${t.value}'`
    );
  }

  parseProgram(): Stmt[] {
    const stmts: Stmt[] = [];
    this.skipTerminators();
    while (!this.check("EOF")) {
      stmts.push(this.parseStatement());
      this.endOfStatement();
    }
    return stmts;
  }

  private endOfStatement() {
    // Statement terminator: NEWLINE, COLON, or EOF
    if (this.check("EOF")) return;
    if (this.match("COLON") || this.match("NEWLINE")) {
      this.skipTerminators();
      return;
    }
    const t = this.peek();
    throw new ParseError(
      t.line,
      t.col,
      `expected end of statement but got ${t.type} '${t.value}'`
    );
  }

  private skipTerminators() {
    while (this.match("NEWLINE") || this.match("COLON")) {}
  }

  private parseStatement(): Stmt {
    const t = this.peek();
    if (t.type === "KEYWORD") {
      switch (t.value) {
        case "LET":
          this.advance();
          return this.parseLet();
        case "PRINT":
          this.advance();
          return this.parsePrint();
        case "INPUT":
          this.advance();
          return this.parseInput();
        case "IF":
          this.advance();
          return this.parseIf();
        case "FOR":
          this.advance();
          return this.parseFor();
        case "WHILE":
          this.advance();
          return this.parseWhile();
        case "REPEAT":
          this.advance();
          return this.parseRepeat();
        case "DIM":
          this.advance();
          return this.parseDim();
        case "SUB":
          this.advance();
          return this.parseSub();
        case "RETURN":
          this.advance();
          return this.parseReturn();
        case "END":
        case "STOP":
          this.advance();
          return { kind: "end" };
      }
    }
    // Implicit LET: ident '=' ...   OR   ident '(' ... ')' '=' ...
    if (t.type === "IDENT" || t.type === "STRIDENT") {
      const next = this.peek(1);
      if (next.type === "OP" && next.value === "=") {
        return this.parseLet();
      }
      if (next.type === "LPAREN") {
        // Scan past the matching RPAREN to see if next is '='
        let depth = 0;
        let i = 1;
        const limit = this.tokens.length - this.pos;
        while (i < limit) {
          const tk = this.tokens[this.pos + i];
          if (tk.type === "EOF" || tk.type === "NEWLINE" || tk.type === "COLON") break;
          if (tk.type === "LPAREN") depth++;
          else if (tk.type === "RPAREN") {
            depth--;
            if (depth === 0) {
              const after = this.tokens[this.pos + i + 1];
              if (after && after.type === "OP" && after.value === "=") {
                return this.parseLet();
              }
              break;
            }
          }
          i++;
        }
      }
    }
    // Otherwise expression statement (eg function call)
    const expr = this.parseExpr();
    return { kind: "expr", expr };
  }

  private parseLet(): Stmt {
    const nameTok = this.peek();
    if (nameTok.type !== "IDENT" && nameTok.type !== "STRIDENT") {
      throw new ParseError(nameTok.line, nameTok.col, "expected variable name");
    }
    this.advance();
    let index: Expr | null = null;
    if (this.match("LPAREN")) {
      index = this.parseExpr();
      this.expect("RPAREN", undefined, "expected ')'");
    }
    this.expect("OP", "=", "expected '=' in assignment");
    const expr = this.parseExpr();
    if (index !== null) {
      return {
        kind: "letidx",
        name: nameTok.value,
        isString: nameTok.type === "STRIDENT",
        index,
        expr,
      };
    }
    return {
      kind: "let",
      name: nameTok.value,
      isString: nameTok.type === "STRIDENT",
      expr,
    };
  }

  private parseDim(): Stmt {
    const nameTok = this.peek();
    if (nameTok.type !== "IDENT" && nameTok.type !== "STRIDENT") {
      throw new ParseError(nameTok.line, nameTok.col, "expected array name in DIM");
    }
    this.advance();
    this.expect("LPAREN", undefined, "expected '(' in DIM");
    const size = this.parseExpr();
    this.expect("RPAREN", undefined, "expected ')' in DIM");
    return {
      kind: "dim",
      name: nameTok.value,
      isString: nameTok.type === "STRIDENT",
      size,
    };
  }

  private parseSub(): Stmt {
    const nameTok = this.peek();
    if (nameTok.type !== "IDENT" && nameTok.type !== "STRIDENT") {
      throw new ParseError(nameTok.line, nameTok.col, "expected SUB name");
    }
    this.advance();
    this.expect("LPAREN", undefined, "expected '('");
    const params: { name: string; isString: boolean }[] = [];
    if (!this.check("RPAREN")) {
      while (true) {
        const pt = this.peek();
        if (pt.type !== "IDENT" && pt.type !== "STRIDENT") {
          throw new ParseError(pt.line, pt.col, "expected parameter name");
        }
        this.advance();
        params.push({ name: pt.value, isString: pt.type === "STRIDENT" });
        if (!this.match("COMMA")) break;
      }
    }
    this.expect("RPAREN", undefined, "expected ')'");
    this.skipTerminators();
    const body: Stmt[] = [];
    while (!this.isEndSub() && !this.check("EOF")) {
      body.push(this.parseStatement());
      this.endOfStatement();
    }
    this.expect("KEYWORD", "END", "expected END SUB");
    this.expect("KEYWORD", "SUB", "expected END SUB");
    return {
      kind: "sub",
      name: nameTok.value,
      isString: nameTok.type === "STRIDENT",
      params,
      body,
    };
  }

  private isEndSub(): boolean {
    const t = this.peek();
    if (t.type !== "KEYWORD" || t.value !== "END") return false;
    const t2 = this.peek(1);
    return t2 != null && t2.type === "KEYWORD" && t2.value === "SUB";
  }

  private parseReturn(): Stmt {
    if (this.atStmtEnd()) return { kind: "return", expr: null };
    return { kind: "return", expr: this.parseExpr() };
  }

  private parsePrint(): Stmt {
    const items: PrintItem[] = [];
    let newline = true;
    // Empty PRINT
    if (this.atStmtEnd()) {
      return { kind: "print", items, newline };
    }
    while (true) {
      // separators that come without expression (handle leading comma uncommon)
      if (this.check("COMMA") || this.check("SEMI")) {
        const sepTok = this.advance();
        items.push({ expr: null, sep: sepTok.type === "COMMA" ? "comma" : "semi" });
        if (this.atStmtEnd()) {
          newline = sepTok.type === "COMMA";
          break;
        }
        continue;
      }
      const expr = this.parseExpr();
      let sep: "comma" | "semi" | "none" = "none";
      if (this.match("COMMA")) sep = "comma";
      else if (this.match("SEMI")) sep = "semi";
      items.push({ expr, sep });
      if (sep === "none") {
        newline = true;
        break;
      }
      if (this.atStmtEnd()) {
        newline = false; // trailing ; or , suppresses newline
        break;
      }
    }
    return { kind: "print", items, newline };
  }

  private atStmtEnd(): boolean {
    return this.check("NEWLINE") || this.check("COLON") || this.check("EOF");
  }

  private parseInput(): Stmt {
    let prompt: string | null = null;
    if (this.check("STRING")) {
      prompt = this.advance().value;
      // optional comma or semicolon between prompt and var
      if (this.match("COMMA") || this.match("SEMI")) {
        /* ok */
      }
    }
    const nameTok = this.peek();
    if (nameTok.type !== "IDENT" && nameTok.type !== "STRIDENT") {
      throw new ParseError(nameTok.line, nameTok.col, "expected variable name in INPUT");
    }
    this.advance();
    return {
      kind: "input",
      prompt,
      name: nameTok.value,
      isString: nameTok.type === "STRIDENT",
    };
  }

  private parseIf(): Stmt {
    const cond = this.parseExpr();
    this.expect("KEYWORD", "THEN", "expected THEN");
    // Block form vs single-line form: if NEWLINE follows THEN, block form.
    if (this.check("NEWLINE") || this.check("COLON")) {
      this.skipTerminators();
      const thenBody: Stmt[] = [];
      const elseBody: Stmt[] = [];
      while (
        !this.check("KEYWORD", "ELSE") &&
        !this.check("KEYWORD", "ELSIF") &&
        !this.check("KEYWORD", "ENDIF") &&
        !this.check("EOF")
      ) {
        thenBody.push(this.parseStatement());
        this.endOfStatement();
      }
      if (this.match("KEYWORD", "ELSIF")) {
        // Treat ELSIF as ELSE { IF ... ENDIF }
        const inner = this.parseIf();
        elseBody.push(inner);
        return { kind: "if", cond, then: thenBody, else: elseBody };
      }
      if (this.match("KEYWORD", "ELSE")) {
        this.skipTerminators();
        while (!this.check("KEYWORD", "ENDIF") && !this.check("EOF")) {
          elseBody.push(this.parseStatement());
          this.endOfStatement();
        }
      }
      this.expect("KEYWORD", "ENDIF", "expected ENDIF");
      return { kind: "if", cond, then: thenBody, else: elseBody };
    }
    // Single-line: IF expr THEN stmt [ELSE stmt]
    const thenStmt = this.parseStatement();
    let elseBody: Stmt[] = [];
    if (this.match("KEYWORD", "ELSE")) {
      elseBody = [this.parseStatement()];
    }
    return { kind: "if", cond, then: [thenStmt], else: elseBody };
  }

  private parseFor(): Stmt {
    const varTok = this.peek();
    if (varTok.type !== "IDENT") {
      throw new ParseError(varTok.line, varTok.col, "FOR variable must be numeric");
    }
    this.advance();
    this.expect("OP", "=", "expected '='");
    const from = this.parseExpr();
    this.expect("KEYWORD", "TO", "expected TO");
    const to = this.parseExpr();
    let step: Expr | null = null;
    if (this.match("KEYWORD", "STEP")) step = this.parseExpr();
    this.endOfStatement();
    const body: Stmt[] = [];
    while (!this.check("KEYWORD", "NEXT") && !this.check("EOF")) {
      body.push(this.parseStatement());
      this.endOfStatement();
    }
    this.expect("KEYWORD", "NEXT", "expected NEXT");
    // Optional NEXT identifier
    if (this.check("IDENT")) this.advance();
    return { kind: "for", var: varTok.value, from, to, step, body };
  }

  private parseWhile(): Stmt {
    const cond = this.parseExpr();
    this.endOfStatement();
    const body: Stmt[] = [];
    while (!this.check("KEYWORD", "WEND") && !this.check("EOF")) {
      body.push(this.parseStatement());
      this.endOfStatement();
    }
    this.expect("KEYWORD", "WEND", "expected WEND");
    return { kind: "while", cond, body };
  }

  private parseRepeat(): Stmt {
    this.endOfStatement();
    const body: Stmt[] = [];
    while (!this.check("KEYWORD", "UNTIL") && !this.check("EOF")) {
      body.push(this.parseStatement());
      this.endOfStatement();
    }
    this.expect("KEYWORD", "UNTIL", "expected UNTIL");
    const cond = this.parseExpr();
    return { kind: "repeat", body, cond };
  }

  // Expression parsing (precedence climbing)
  private parseExpr(): Expr {
    return this.parseOr();
  }
  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.match("KEYWORD", "OR")) {
      const right = this.parseAnd();
      left = { kind: "binary", op: "OR", left, right };
    }
    return left;
  }
  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.match("KEYWORD", "AND")) {
      const right = this.parseNot();
      left = { kind: "binary", op: "AND", left, right };
    }
    return left;
  }
  private parseNot(): Expr {
    if (this.match("KEYWORD", "NOT")) {
      const expr = this.parseNot();
      return { kind: "unary", op: "NOT", expr };
    }
    return this.parseCompare();
  }
  private parseCompare(): Expr {
    let left = this.parseAddSub();
    while (
      this.check("OP", "=") ||
      this.check("OP", "<>") ||
      this.check("OP", "<") ||
      this.check("OP", ">") ||
      this.check("OP", "<=") ||
      this.check("OP", ">=")
    ) {
      const op = this.advance().value as "=" | "<>" | "<" | ">" | "<=" | ">=";
      const right = this.parseAddSub();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }
  private parseAddSub(): Expr {
    let left = this.parseMulDiv();
    while (this.check("OP", "+") || this.check("OP", "-")) {
      const op = this.advance().value as "+" | "-";
      const right = this.parseMulDiv();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }
  private parseMulDiv(): Expr {
    let left = this.parsePow();
    while (
      this.check("OP", "*") ||
      this.check("OP", "/") ||
      this.check("KEYWORD", "MOD")
    ) {
      const op = this.advance().value as "*" | "/" | "MOD";
      const right = this.parsePow();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }
  private parsePow(): Expr {
    const left = this.parseUnary();
    if (this.match("OP", "^")) {
      const right = this.parsePow(); // right-assoc
      return { kind: "binary", op: "^", left, right };
    }
    return left;
  }
  private parseUnary(): Expr {
    if (this.match("OP", "-")) {
      const expr = this.parseUnary();
      return { kind: "unary", op: "-", expr };
    }
    if (this.match("OP", "+")) {
      return this.parseUnary();
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === "NUMBER") {
      this.advance();
      return { kind: "num", value: parseFloat(t.value) };
    }
    if (t.type === "STRING") {
      this.advance();
      return { kind: "str", value: t.value };
    }
    if (t.type === "KEYWORD" && (t.value === "TRUE" || t.value === "FALSE")) {
      this.advance();
      return { kind: "num", value: t.value === "TRUE" ? 1 : 0 };
    }
    if (t.type === "IDENT" || t.type === "STRIDENT") {
      this.advance();
      const isString = t.type === "STRIDENT";
      if (this.match("LPAREN")) {
        const args: Expr[] = [];
        if (!this.check("RPAREN")) {
          args.push(this.parseExpr());
          while (this.match("COMMA")) args.push(this.parseExpr());
        }
        this.expect("RPAREN", undefined, "expected ')'");
        return { kind: "call", name: t.value, isString, args };
      }
      return { kind: "var", name: t.value, isString };
    }
    if (this.match("LPAREN")) {
      const e = this.parseExpr();
      this.expect("RPAREN", undefined, "expected ')'");
      return e;
    }
    throw new ParseError(t.line, t.col, `unexpected token ${t.type} '${t.value}'`);
  }
}
