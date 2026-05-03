export type TokenType =
  | "NUMBER"
  | "STRING"
  | "IDENT"
  | "STRIDENT"
  | "KEYWORD"
  | "OP"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "SEMI"
  | "COLON"
  | "NEWLINE"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS = new Set([
  "LET",
  "PRINT",
  "INPUT",
  "IF",
  "THEN",
  "ELSE",
  "ELSIF",
  "ENDIF",
  "END",
  "FOR",
  "TO",
  "STEP",
  "NEXT",
  "WHILE",
  "WEND",
  "REPEAT",
  "UNTIL",
  "REM",
  "AND",
  "OR",
  "NOT",
  "MOD",
  "TRUE",
  "FALSE",
  "STOP",
  "DIM",
  "SUB",
  "RETURN",
  "LOCAL",
]);

export class LexError extends Error {
  constructor(public line: number, public col: number, msg: string) {
    super(`Line ${line}:${col}: ${msg}`);
  }
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const peek = (off = 0) => src[i + off];
  const advance = () => {
    const c = src[i++];
    if (c === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return c;
  };

  while (i < src.length) {
    const startLine = line;
    const startCol = col;
    const c = peek();

    if (c === " " || c === "\t" || c === "\r") {
      advance();
      continue;
    }

    if (c === "\n") {
      advance();
      tokens.push({ type: "NEWLINE", value: "\n", line: startLine, col: startCol });
      continue;
    }

    // Line continuation: a trailing backslash before newline
    if (c === "\\" && peek(1) === "\n") {
      advance();
      advance();
      continue;
    }

    // Comments: REM..., //..., '..., #...
    if (c === "/" && peek(1) === "/") {
      while (i < src.length && peek() !== "\n") advance();
      continue;
    }
    if (c === "'" || c === "#") {
      while (i < src.length && peek() !== "\n") advance();
      continue;
    }

    // String literal
    if (c === '"') {
      advance();
      let s = "";
      while (i < src.length && peek() !== '"') {
        if (peek() === "\\") {
          advance();
          const esc = advance();
          switch (esc) {
            case "n":
              s += "\n";
              break;
            case "t":
              s += "\t";
              break;
            case "r":
              s += "\r";
              break;
            case "\\":
              s += "\\";
              break;
            case '"':
              s += '"';
              break;
            default:
              s += esc;
          }
        } else {
          s += advance();
        }
      }
      if (i >= src.length) {
        throw new LexError(startLine, startCol, "unterminated string literal");
      }
      advance(); // closing quote
      tokens.push({ type: "STRING", value: s, line: startLine, col: startCol });
      continue;
    }

    // Number
    if (isDigit(c) || (c === "." && isDigit(peek(1)))) {
      let n = "";
      while (i < src.length && isDigit(peek())) n += advance();
      if (peek() === ".") {
        n += advance();
        while (i < src.length && isDigit(peek())) n += advance();
      }
      if (peek() === "e" || peek() === "E") {
        n += advance();
        if (peek() === "+" || peek() === "-") n += advance();
        while (i < src.length && isDigit(peek())) n += advance();
      }
      tokens.push({ type: "NUMBER", value: n, line: startLine, col: startCol });
      continue;
    }

    // Identifier / keyword
    if (isAlpha(c) || c === "_") {
      let id = "";
      while (i < src.length && (isAlnum(peek()) || peek() === "_")) id += advance();
      let isString = false;
      if (peek() === "$") {
        id += advance();
        isString = true;
      }
      const upper = id.toUpperCase();
      if (!isString && KEYWORDS.has(upper)) {
        // REM swallows rest of line as comment
        if (upper === "REM") {
          while (i < src.length && peek() !== "\n") advance();
          continue;
        }
        tokens.push({ type: "KEYWORD", value: upper, line: startLine, col: startCol });
      } else {
        tokens.push({
          type: isString ? "STRIDENT" : "IDENT",
          value: id,
          line: startLine,
          col: startCol,
        });
      }
      continue;
    }

    // Operators / punctuation
    if (c === "(") {
      advance();
      tokens.push({ type: "LPAREN", value: "(", line: startLine, col: startCol });
      continue;
    }
    if (c === ")") {
      advance();
      tokens.push({ type: "RPAREN", value: ")", line: startLine, col: startCol });
      continue;
    }
    if (c === ",") {
      advance();
      tokens.push({ type: "COMMA", value: ",", line: startLine, col: startCol });
      continue;
    }
    if (c === ";") {
      advance();
      tokens.push({ type: "SEMI", value: ";", line: startLine, col: startCol });
      continue;
    }
    if (c === ":") {
      advance();
      tokens.push({ type: "COLON", value: ":", line: startLine, col: startCol });
      continue;
    }

    // Multi-char operators
    if (c === "<" && peek(1) === "=") {
      advance();
      advance();
      tokens.push({ type: "OP", value: "<=", line: startLine, col: startCol });
      continue;
    }
    if (c === ">" && peek(1) === "=") {
      advance();
      advance();
      tokens.push({ type: "OP", value: ">=", line: startLine, col: startCol });
      continue;
    }
    if (c === "<" && peek(1) === ">") {
      advance();
      advance();
      tokens.push({ type: "OP", value: "<>", line: startLine, col: startCol });
      continue;
    }

    if ("+-*/^=<>".includes(c)) {
      advance();
      tokens.push({ type: "OP", value: c, line: startLine, col: startCol });
      continue;
    }

    throw new LexError(startLine, startCol, `unexpected character '${c}'`);
  }

  tokens.push({ type: "EOF", value: "", line, col });
  return tokens;
}

function isDigit(c: string | undefined): boolean {
  return !!c && c >= "0" && c <= "9";
}

function isAlpha(c: string | undefined): boolean {
  return !!c && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
}

function isAlnum(c: string | undefined): boolean {
  return isAlpha(c) || isDigit(c);
}
