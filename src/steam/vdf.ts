export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue;
}

type Token = { type: "open" } | { type: "close" } | { type: "string"; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    if (/\s/.test(char)) {
      i++;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (char === "{") {
      tokens.push({ type: "open" });
      i++;
    } else if (char === "}") {
      tokens.push({ type: "close" });
      i++;
    } else if (char === '"') {
      let value = "";
      i++;
      for (;; i++) {
        if (i >= text.length) throw new Error("VDF: unterminated string");
        const current = text[i]!;
        if (current === '"') {
          i++;
          break;
        }
        if (current === "\\" && i + 1 < text.length) {
          i++;
          const escaped = text[i]!;
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        } else {
          value += current;
        }
      }
      tokens.push({ type: "string", value });
    } else {
      throw new Error(`VDF: unexpected character '${char}'`);
    }
  }

  return tokens;
}

export function parseVdf(text: string): VdfObject {
  const tokens = tokenize(text);
  let position = 0;

  const parseObject = (nested: boolean): VdfObject => {
    const result = Object.create(null) as VdfObject;

    while (position < tokens.length) {
      const key = tokens[position++]!;
      if (key.type === "close") {
        if (!nested) throw new Error("VDF: unexpected '}'");
        return result;
      }
      if (key.type !== "string") throw new Error("VDF: expected a key");

      const next = tokens[position++];
      if (next?.type === "open") result[key.value] = parseObject(true);
      else if (next?.type === "string") result[key.value] = next.value;
      else throw new Error(`VDF: missing value for "${key.value}"`);
    }

    if (nested) throw new Error("VDF: missing '}'");
    return result;
  };

  return parseObject(false);
}
