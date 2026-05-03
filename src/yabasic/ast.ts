export type Expr =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "var"; name: string; isString: boolean }
  | { kind: "unary"; op: "-" | "NOT"; expr: Expr }
  | {
      kind: "binary";
      op:
        | "+"
        | "-"
        | "*"
        | "/"
        | "^"
        | "MOD"
        | "="
        | "<>"
        | "<"
        | ">"
        | "<="
        | ">="
        | "AND"
        | "OR";
      left: Expr;
      right: Expr;
    }
  | { kind: "call"; name: string; isString: boolean; args: Expr[] };

export type PrintItem = {
  expr: Expr | null; // null for trailing separator only
  sep: "comma" | "semi" | "none";
};

export type Stmt =
  | { kind: "let"; name: string; isString: boolean; expr: Expr }
  | { kind: "print"; items: PrintItem[]; newline: boolean }
  | { kind: "input"; prompt: string | null; name: string; isString: boolean }
  | { kind: "if"; cond: Expr; then: Stmt[]; else: Stmt[] }
  | {
      kind: "for";
      var: string;
      from: Expr;
      to: Expr;
      step: Expr | null;
      body: Stmt[];
    }
  | { kind: "while"; cond: Expr; body: Stmt[] }
  | { kind: "repeat"; body: Stmt[]; cond: Expr }
  | { kind: "expr"; expr: Expr }
  | { kind: "end" };
