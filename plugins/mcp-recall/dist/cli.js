// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// package.json
var require_package = __commonJS((exports, module) => {
  module.exports = {
    name: "mcp-recall",
    version: "1.7.0",
    description: "Context compression and persistent retrieval for Claude Code",
    author: {
      name: "sakebomb",
      url: "https://github.com/sakebomb"
    },
    license: "MIT",
    homepage: "https://github.com/sakebomb/mcp-recall#readme",
    repository: {
      type: "git",
      url: "https://github.com/sakebomb/mcp-recall"
    },
    bugs: {
      url: "https://github.com/sakebomb/mcp-recall/issues"
    },
    keywords: ["mcp", "claude", "claude-code", "context", "compression", "memory", "sqlite", "plugin"],
    engines: {
      bun: ">=1.1.0"
    },
    bin: {
      "mcp-recall": "./bin/recall"
    },
    files: [
      "bin/",
      "src/",
      "plugins/mcp-recall/dist/",
      "plugins/mcp-recall/hooks/",
      "plugins/mcp-recall/profiles/",
      "profiles/",
      "hooks/",
      ".claude-plugin/",
      "LICENSE",
      "README.md",
      "CHANGELOG.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "tsconfig.json"
    ],
    module: "src/server.ts",
    type: "module",
    scripts: {
      start: "bun run src/server.ts",
      test: "bun test",
      dev: "bun --watch src/server.ts",
      typecheck: "tsc --noEmit",
      build: "bun build src/server.ts --target bun --outfile plugins/mcp-recall/dist/server.js && bun build src/cli.ts --target bun --outfile plugins/mcp-recall/dist/cli.js && cp hooks/hooks.json plugins/mcp-recall/hooks/hooks.json && rm -rf plugins/mcp-recall/profiles && cp -r profiles plugins/mcp-recall/profiles",
      prepare: "git config core.hooksPath .githooks"
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.27.1",
      "smol-toml": "^1.6.0",
      zod: "^3.24.0"
    },
    devDependencies: {
      "@types/bun": "latest",
      typescript: "^5.7.0"
    }
  };
});

// node_modules/smol-toml/dist/error.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1;i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += `
`;
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += `^
`;
    }
  }
  return codeblock;
}

class TomlError extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
}

// node_modules/smol-toml/dist/util.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function isEscaped(str, ptr) {
  let i = 0;
  while (str[ptr - ++i] === "\\")
    ;
  return --i && i % 2;
}
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf(`
`, start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr;i < str.length; i++) {
    let c = str[i];
    if (c === `
`)
      return i;
    if (c === "\r" && str[i + 1] === `
`)
      return i + 1;
    if (c < " " && c !== "\t" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while ((c = str[ptr]) === " " || c === "\t" || !banNewLines && (c === `
` || c === "\r" && str[ptr + 1] === `
`))
    ptr++;
  return banComments || c !== "#" ? ptr : skipVoid(str, skipComment(str, ptr), banNewLines);
}
function skipUntil(str, ptr, sep, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr;i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep) {
      return i + 1;
    } else if (c === end || banNewLines && (c === `
` || c === "\r" && str[i + 1] === `
`)) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
function getStringEnd(str, seek) {
  let first = str[seek];
  let target = first === str[seek + 1] && str[seek + 1] === str[seek + 2] ? str.slice(seek, seek + 3) : first;
  seek += target.length - 1;
  do
    seek = str.indexOf(target, ++seek);
  while (seek > -1 && first !== "'" && isEscaped(str, seek));
  if (seek > -1) {
    seek += target.length;
    if (target.length > 1) {
      if (str[seek] === first)
        seek++;
      if (str[seek] === first)
        seek++;
    }
  }
  return seek;
}

// node_modules/smol-toml/dist/date.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;

class TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 60000);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
}

// node_modules/smol-toml/dist/primitive.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
var ESCAPE_REGEX = /^[0-9a-f]{2,8}$/i;
var ESC_MAP = {
  b: "\b",
  t: "\t",
  n: `
`,
  f: "\f",
  r: "\r",
  e: "\x1B",
  '"': '"',
  "\\": "\\"
};
function parseString(str, ptr = 0, endPtr = str.length) {
  let isLiteral = str[ptr] === "'";
  let isMultiline = str[ptr++] === str[ptr] && str[ptr] === str[ptr + 1];
  if (isMultiline) {
    endPtr -= 2;
    if (str[ptr += 2] === "\r")
      ptr++;
    if (str[ptr] === `
`)
      ptr++;
  }
  let tmp = 0;
  let isEscape;
  let parsed = "";
  let sliceStart = ptr;
  while (ptr < endPtr - 1) {
    let c = str[ptr++];
    if (c === `
` || c === "\r" && str[ptr] === `
`) {
      if (!isMultiline) {
        throw new TomlError("newlines are not allowed in strings", {
          toml: str,
          ptr: ptr - 1
        });
      }
    } else if (c < " " && c !== "\t" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: ptr - 1
      });
    }
    if (isEscape) {
      isEscape = false;
      if (c === "x" || c === "u" || c === "U") {
        let code = str.slice(ptr, ptr += c === "x" ? 2 : c === "u" ? 4 : 8);
        if (!ESCAPE_REGEX.test(code)) {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
        try {
          parsed += String.fromCodePoint(parseInt(code, 16));
        } catch {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
      } else if (isMultiline && (c === `
` || c === " " || c === "\t" || c === "\r")) {
        ptr = skipVoid(str, ptr - 1, true);
        if (str[ptr] !== `
` && str[ptr] !== "\r") {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: str,
            ptr: tmp
          });
        }
        ptr = skipVoid(str, ptr);
      } else if (c in ESC_MAP) {
        parsed += ESC_MAP[c];
      } else {
        throw new TomlError("unrecognized escape sequence", {
          toml: str,
          ptr: tmp
        });
      }
      sliceStart = ptr;
    } else if (!isLiteral && c === "\\") {
      tmp = ptr - 1;
      isEscape = true;
      parsed += str.slice(sliceStart, tmp);
    }
  }
  return parsed + str.slice(sliceStart, endPtr - 1);
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// node_modules/smol-toml/dist/extract.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  let endPtr;
  if (c === '"' || c === "'") {
    endPtr = getStringEnd(str, ptr);
    let parsed = parseString(str, ptr, endPtr);
    if (end) {
      endPtr = skipVoid(str, endPtr);
      if (str[endPtr] && str[endPtr] !== "," && str[endPtr] !== end && str[endPtr] !== `
` && str[endPtr] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr
        });
      }
      endPtr += +(str[endPtr] === ",");
    }
    return [parsed, endPtr];
  }
  endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - +(str[endPtr - 1] === ","));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    endPtr += +(str[endPtr] === ",");
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}

// node_modules/smol-toml/dist/struct.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "\t") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let eos = getStringEnd(str, ptr);
        if (eos < 0) {
          throw new TomlError("unfinished string encountered", {
            toml: str,
            ptr
          });
        }
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(parseString(str, ptr, eos));
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = new Set;
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "\t" && c !== `
` && c !== "\r") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0;i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "\t" && c !== `
` && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// node_modules/smol-toml/dist/parse.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0;i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1000, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0);ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(k[0], res, meta, isTableArray ? 2 : 1);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(k[0], tbl, m, 0);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], undefined, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== `
` && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// node_modules/smol-toml/dist/stringify.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// node_modules/smol-toml/dist/index.js
/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// src/config.ts
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// node_modules/zod/v3/external.js
var exports_external = {};
__export(exports_external, {
  void: () => voidType,
  util: () => util,
  unknown: () => unknownType,
  union: () => unionType,
  undefined: () => undefinedType,
  tuple: () => tupleType,
  transformer: () => effectsType,
  symbol: () => symbolType,
  string: () => stringType,
  strictObject: () => strictObjectType,
  setErrorMap: () => setErrorMap,
  set: () => setType,
  record: () => recordType,
  quotelessJson: () => quotelessJson,
  promise: () => promiseType,
  preprocess: () => preprocessType,
  pipeline: () => pipelineType,
  ostring: () => ostring,
  optional: () => optionalType,
  onumber: () => onumber,
  oboolean: () => oboolean,
  objectUtil: () => objectUtil,
  object: () => objectType,
  number: () => numberType,
  nullable: () => nullableType,
  null: () => nullType,
  never: () => neverType,
  nativeEnum: () => nativeEnumType,
  nan: () => nanType,
  map: () => mapType,
  makeIssue: () => makeIssue,
  literal: () => literalType,
  lazy: () => lazyType,
  late: () => late,
  isValid: () => isValid,
  isDirty: () => isDirty,
  isAsync: () => isAsync,
  isAborted: () => isAborted,
  intersection: () => intersectionType,
  instanceof: () => instanceOfType,
  getParsedType: () => getParsedType,
  getErrorMap: () => getErrorMap,
  function: () => functionType,
  enum: () => enumType,
  effect: () => effectsType,
  discriminatedUnion: () => discriminatedUnionType,
  defaultErrorMap: () => en_default,
  datetimeRegex: () => datetimeRegex,
  date: () => dateType,
  custom: () => custom,
  coerce: () => coerce,
  boolean: () => booleanType,
  bigint: () => bigIntType,
  array: () => arrayType,
  any: () => anyType,
  addIssueToContext: () => addIssueToContext,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransformer: () => ZodEffects,
  ZodSymbol: () => ZodSymbol,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodSchema: () => ZodType,
  ZodRecord: () => ZodRecord,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPipeline: () => ZodPipeline,
  ZodParsedType: () => ZodParsedType,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNever: () => ZodNever,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodIssueCode: () => ZodIssueCode,
  ZodIntersection: () => ZodIntersection,
  ZodFunction: () => ZodFunction,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodError: () => ZodError,
  ZodEnum: () => ZodEnum,
  ZodEffects: () => ZodEffects,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCatch: () => ZodCatch,
  ZodBranded: () => ZodBranded,
  ZodBoolean: () => ZodBoolean,
  ZodBigInt: () => ZodBigInt,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny,
  Schema: () => ZodType,
  ParseStatus: () => ParseStatus,
  OK: () => OK,
  NEVER: () => NEVER,
  INVALID: () => INVALID,
  EMPTY_PATH: () => EMPTY_PATH,
  DIRTY: () => DIRTY,
  BRAND: () => BRAND
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {};
  function assertIs(_arg) {}
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error;
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};

class ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
}
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== undefined) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      ctx.schemaErrorMap,
      overrideMap,
      overrideMap === en_default ? undefined : en_default
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}

class ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
}
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
class ParseInputLazyPath {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
}
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}

class ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus,
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(undefined).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}

class ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus;
    let ctx = undefined;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}

class ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = undefined;
    const status = new ParseStatus;
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
}
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};

class ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = undefined;
    const status = new ParseStatus;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
}
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};

class ZodBoolean extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};

class ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus;
    let ctx = undefined;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
}
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};

class ZodSymbol extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};

class ZodUndefined extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};

class ZodNull extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};

class ZodAny extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};

class ZodUnknown extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};

class ZodNever extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
}
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};

class ZodVoid extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};

class ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : undefined,
          maximum: tooBig ? def.exactLength.value : undefined,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}

class ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {} else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== undefined ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  extend(augmentation) {
    return new ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  merge(merging) {
    const merged = new ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  catchall(index) {
    return new ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
}
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};

class ZodUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = undefined;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
}
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [undefined];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [undefined, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};

class ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  static create(discriminator, options, params) {
    const optionsMap = new Map;
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
}
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}

class ZodIntersection extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
}
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};

class ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new ZodTuple({
      ...this._def,
      rest
    });
  }
}
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};

class ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
}

class ZodMap extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = new Map;
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = new Map;
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
}
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};

class ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = new Set;
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};

class ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
}

class ZodLazy extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
}
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};

class ZodLiteral extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
}
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}

class ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
}
ZodEnum.create = createZodEnum;

class ZodNativeEnum extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
}
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};

class ZodPromise extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
}
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};

class ZodEffects extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
}
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
class ZodOptional extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(undefined);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};

class ZodNullable extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};

class ZodDefault extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};

class ZodCatch extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
}
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};

class ZodNaN extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
}
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");

class ZodBranded extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
}

class ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
}

class ZodReadonly extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true })
};
var NEVER = INVALID;
// src/config.ts
var RecallConfigSchema = exports_external.object({
  store: exports_external.object({
    expire_after_session_days: exports_external.number().positive(),
    key: exports_external.enum(["git_root", "cwd"]),
    max_size_mb: exports_external.number().positive(),
    pin_recommendation_threshold: exports_external.number().int().positive(),
    stale_item_days: exports_external.number().int().positive()
  }),
  retrieve: exports_external.object({
    default_max_bytes: exports_external.number().positive()
  }),
  denylist: exports_external.object({
    additional: exports_external.array(exports_external.string()),
    override_defaults: exports_external.array(exports_external.string()),
    allowlist: exports_external.array(exports_external.string())
  }),
  profiles: exports_external.object({
    verify_signature: exports_external.enum(["warn", "error", "skip"])
  }),
  debug: exports_external.object({
    enabled: exports_external.boolean()
  })
});
var PartialConfigSchema = RecallConfigSchema.deepPartial();
var DEFAULTS = {
  store: {
    expire_after_session_days: 30,
    key: "git_root",
    max_size_mb: 500,
    pin_recommendation_threshold: 5,
    stale_item_days: 3
  },
  retrieve: {
    default_max_bytes: 8192
  },
  denylist: {
    additional: [],
    override_defaults: [],
    allowlist: []
  },
  profiles: {
    verify_signature: "warn"
  },
  debug: {
    enabled: false
  }
};
function getConfigPath() {
  return process.env.RECALL_CONFIG_PATH ?? join(homedir(), ".config", "mcp-recall", "config.toml");
}
function deepMerge(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const override = overrides[key];
    const def = defaults[key];
    if (override !== undefined && override !== null && typeof override === "object" && !Array.isArray(override) && typeof def === "object" && def !== null && !Array.isArray(def)) {
      result[key] = deepMerge(def, override);
    } else if (override !== undefined) {
      result[key] = override;
    }
  }
  return result;
}
var cached = null;
function loadConfig() {
  if (cached)
    return cached;
  try {
    const raw = readFileSync(getConfigPath(), "utf8");
    const result = PartialConfigSchema.safeParse(parse(raw));
    if (result.success) {
      cached = deepMerge(DEFAULTS, result.data);
    } else {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      process.stderr.write(`[recall] invalid config (${issues}); using defaults
`);
      cached = deepMerge(DEFAULTS, {});
    }
  } catch (err) {
    const isNotFound = err instanceof Error && "code" in err && err.code === "ENOENT";
    if (!isNotFound) {
      process.stderr.write(`[recall] failed to load config: ${err}; using defaults
`);
    }
    cached = deepMerge(DEFAULTS, {});
  }
  return cached;
}

// src/project-key.ts
import { createHash } from "crypto";
import { spawnSync } from "child_process";
var pathCache = new Map;
function getProjectKey(cwd) {
  const resolved = resolveProjectPath(cwd);
  return hashPath(resolved);
}
function resolveProjectPath(cwd) {
  const cached2 = pathCache.get(cwd);
  if (cached2 !== undefined)
    return cached2;
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  const resolved = result.status === 0 && result.stdout ? result.stdout.trim() : cwd;
  pathCache.set(cwd, resolved);
  return resolved;
}
function hashPath(path) {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}

// src/db/index.ts
import { Database } from "bun:sqlite";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";
import { mkdirSync } from "fs";
import { randomBytes } from "crypto";
var SCHEMA = `
  CREATE TABLE IF NOT EXISTS stored_outputs (
    id TEXT PRIMARY KEY,
    project_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    full_content TEXT NOT NULL,
    original_size INTEGER NOT NULL,
    summary_size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed INTEGER,
    input_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_so_project_key ON stored_outputs(project_key);
  CREATE INDEX IF NOT EXISTS idx_so_created_at  ON stored_outputs(created_at);
  CREATE INDEX IF NOT EXISTS idx_so_tool_name   ON stored_outputs(tool_name);
  CREATE INDEX IF NOT EXISTS idx_so_input_hash  ON stored_outputs(project_key, input_hash);

  CREATE VIRTUAL TABLE IF NOT EXISTS outputs_fts USING fts5(
    id UNINDEXED,
    tool_name,
    summary,
    full_content
  );

  CREATE TRIGGER IF NOT EXISTS outputs_ai AFTER INSERT ON stored_outputs BEGIN
    INSERT INTO outputs_fts(rowid, id, tool_name, summary, full_content)
    VALUES (new.rowid, new.id, new.tool_name, new.summary, new.full_content);
  END;

  CREATE TRIGGER IF NOT EXISTS outputs_ad AFTER DELETE ON stored_outputs BEGIN
    DELETE FROM outputs_fts WHERE rowid = old.rowid;
  END;

  CREATE VIRTUAL TABLE IF NOT EXISTS content_chunks USING fts5(
    output_id UNINDEXED,
    chunk_index UNINDEXED,
    content
  );

  CREATE TRIGGER IF NOT EXISTS outputs_ad_chunks AFTER DELETE ON stored_outputs BEGIN
    DELETE FROM content_chunks WHERE output_id = old.id;
  END;

  CREATE TABLE IF NOT EXISTS sessions (
    date TEXT PRIMARY KEY
  );
`;
var MIGRATIONS = [
  "ALTER TABLE stored_outputs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stored_outputs ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE stored_outputs ADD COLUMN last_accessed INTEGER",
  "ALTER TABLE stored_outputs ADD COLUMN input_hash TEXT"
];
function applyMigrations(db) {
  for (const sql of MIGRATIONS) {
    try {
      db.run(sql);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("duplicate column")) {
        throw e;
      }
    }
  }
}
var instance = null;
function defaultDbPath(projectKey) {
  return process.env.RECALL_DB_PATH ?? join2(homedir2(), ".local", "share", "mcp-recall", `${projectKey}.db`);
}
function getDb(path) {
  if (instance)
    return instance;
  if (path !== ":memory:") {
    mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  }
  instance = new Database(path);
  instance.run("PRAGMA journal_mode=WAL");
  instance.run("PRAGMA foreign_keys=ON");
  instance.run(SCHEMA);
  applyMigrations(instance);
  return instance;
}
var CHUNK_SIZE = 512;
var CHUNK_OVERLAP = 64;
function chunkText(text) {
  if (text.length === 0)
    return [];
  if (text.length <= CHUNK_SIZE)
    return [text];
  const chunks = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  for (let pos = 0;pos < text.length; pos += step) {
    chunks.push(text.slice(pos, pos + CHUNK_SIZE));
  }
  return chunks;
}
function storeChunks(db, id, full_content) {
  const chunks = chunkText(full_content);
  const stmt = db.prepare(`INSERT INTO content_chunks (output_id, chunk_index, content) VALUES (?, ?, ?)`);
  for (let i = 0;i < chunks.length; i++) {
    stmt.run(id, i, chunks[i]);
  }
}
function generateId() {
  return `recall_${randomBytes(4).toString("hex")}`;
}
function storeOutput(db, input) {
  const id = generateId();
  const summary_size = Buffer.byteLength(input.summary, "utf8");
  const created_at = Math.floor(Date.now() / 1000);
  const input_hash = input.input_hash ?? null;
  const insertAndChunk = db.transaction(() => {
    db.prepare(`
      INSERT INTO stored_outputs
        (id, project_key, session_id, tool_name, summary, full_content,
         original_size, summary_size, created_at, input_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.project_key, input.session_id, input.tool_name, input.summary, input.full_content, input.original_size, summary_size, created_at, input_hash);
    storeChunks(db, id, input.full_content);
  });
  insertAndChunk();
  return {
    id,
    ...input,
    summary_size,
    created_at,
    pinned: 0,
    access_count: 0,
    last_accessed: null,
    input_hash
  };
}
function checkDedup(db, project_key, input_hash) {
  return db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND input_hash = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(project_key, input_hash);
}
function evictIfNeeded(db, project_key, max_size_mb) {
  const max_bytes = max_size_mb * 1024 * 1024;
  let evicted = 0;
  while (true) {
    const total = db.prepare(`
      SELECT COALESCE(SUM(original_size), 0) as n
      FROM stored_outputs WHERE project_key = ?
    `).get(project_key).n;
    if (total <= max_bytes)
      break;
    const candidate = db.prepare(`
      SELECT id FROM stored_outputs
      WHERE project_key = ? AND pinned = 0
      ORDER BY access_count ASC, last_accessed ASC NULLS FIRST, created_at ASC
      LIMIT 1
    `).get(project_key);
    if (!candidate)
      break;
    db.prepare(`DELETE FROM stored_outputs WHERE id = ?`).run(candidate.id);
    evicted++;
  }
  return evicted;
}
function countAndDelete(db, where, params) {
  const count = db.prepare(`SELECT COUNT(*) as n FROM stored_outputs WHERE ${where}`).get(...params).n;
  if (count > 0) {
    db.prepare(`DELETE FROM stored_outputs WHERE ${where}`).run(...params);
  }
  return count;
}
function getToolBreakdown(db, project_key) {
  return db.prepare(`
    SELECT
      tool_name,
      COUNT(*)                       AS items,
      COALESCE(SUM(original_size),0) AS original_bytes,
      COALESCE(SUM(summary_size),0)  AS summary_bytes
    FROM stored_outputs
    WHERE project_key = ?
    GROUP BY tool_name
    ORDER BY original_bytes DESC
  `).all(project_key);
}
function sampleOutputs(db, project_key, tool_name, limit) {
  return db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND tool_name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(project_key, tool_name, limit);
}
function getContext(db, project_key, opts = {}) {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 5;
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const today = new Date().toISOString().slice(0, 10);
  const pinned = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 1
    ORDER BY last_accessed DESC NULLS LAST, created_at DESC
  `).all(project_key);
  const notes = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 0 AND tool_name = 'recall__note'
    ORDER BY created_at DESC
    LIMIT 10
  `).all(project_key);
  const recent = db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND pinned = 0 AND tool_name != 'recall__note'
      AND last_accessed >= ?
    ORDER BY last_accessed DESC
    LIMIT ?
  `).all(project_key, cutoff, limit);
  const sessionDays = getSessionDays(db);
  const pastDays = sessionDays.filter((d) => d < today);
  let last_session = null;
  let lastDate = null;
  if (pastDays.length > 0) {
    lastDate = pastDays[0];
    const summary = getSessionSummary(db, project_key, { date: lastDate });
    if (summary.stored_count > 0) {
      last_session = {
        date: lastDate,
        stored_count: summary.stored_count,
        total_original_bytes: summary.total_original_bytes,
        total_summary_bytes: summary.total_summary_bytes
      };
    }
  }
  const hot = [];
  if (lastDate) {
    const startOfDay = Math.floor(new Date(`${lastDate}T00:00:00Z`).getTime() / 1000);
    const endOfDay = startOfDay + 86400;
    const excludeIds = [...pinned, ...notes, ...recent].map((i) => i.id);
    const notIn = excludeIds.length > 0 ? `AND id NOT IN (${excludeIds.map(() => "?").join(",")})` : "";
    const rows = db.prepare(`
      SELECT * FROM stored_outputs
      WHERE project_key = ?
        AND pinned = 0
        AND tool_name != 'recall__note'
        AND created_at >= ? AND created_at < ?
        AND access_count > 0
        ${notIn}
      ORDER BY access_count DESC
      LIMIT 5
    `).all(project_key, startOfDay, endOfDay, ...excludeIds);
    hot.push(...rows);
  }
  return { pinned, notes, recent, hot, last_session };
}
function getSessionSummary(db, project_key, opts = {}) {
  let filter;
  let filterParams;
  let label;
  if (opts.session_id) {
    filter = "session_id = ?";
    filterParams = [opts.session_id];
    label = opts.session_id;
  } else {
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const startOfDay = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    const endOfDay = startOfDay + 86400;
    filter = "created_at >= ? AND created_at < ?";
    filterParams = [startOfDay, endOfDay];
    label = date;
  }
  const base = `WHERE project_key = ? AND ${filter}`;
  const bp = [project_key, ...filterParams];
  const agg = db.prepare(`
    SELECT
      COUNT(*) as stored_count,
      COALESCE(SUM(original_size), 0) as total_original_bytes,
      COALESCE(SUM(summary_size), 0) as total_summary_bytes,
      COUNT(CASE WHEN access_count > 0 THEN 1 END) as accessed_count,
      COALESCE(SUM(access_count), 0) as total_accesses
    FROM stored_outputs ${base}
  `).get(...bp);
  const tool_counts = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM stored_outputs ${base}
    GROUP BY tool_name
    ORDER BY count DESC
  `).all(...bp);
  const top_accessed = db.prepare(`
    SELECT id, tool_name, summary, access_count
    FROM stored_outputs ${base} AND access_count > 0
    ORDER BY access_count DESC
    LIMIT 5
  `).all(...bp);
  const pinned = db.prepare(`
    SELECT id, tool_name, summary
    FROM stored_outputs ${base} AND pinned = 1
    ORDER BY created_at DESC
  `).all(...bp);
  const notes = db.prepare(`
    SELECT id, summary
    FROM stored_outputs ${base} AND tool_name = 'recall__note'
    ORDER BY created_at DESC
  `).all(...bp);
  return { label, ...agg, tool_counts, top_accessed, pinned, notes };
}
function pruneExpired(db, project_key, calendar_days) {
  const cutoff = Math.floor(Date.now() / 1000) - calendar_days * 86400;
  return countAndDelete(db, "created_at < ? AND project_key = ? AND pinned = 0", [cutoff, project_key]);
}
function recordSession(db, date) {
  db.prepare(`INSERT OR IGNORE INTO sessions (date) VALUES (?)`).run(date);
}
function getSessionDays(db) {
  return db.prepare(`SELECT date FROM sessions ORDER BY date DESC`).all().map((r) => r.date);
}

// src/format.ts
function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes}B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function formatRelativeTime(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60)
    return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// src/tools.ts
function formatDate(unixSecs) {
  return new Date(unixSecs * 1000).toISOString().slice(0, 10);
}
function reductionPct(original, summary) {
  if (original === 0)
    return "0%";
  return `${((1 - summary / original) * 100).toFixed(0)}%`;
}
function toolContext(db, projectKey, args) {
  const data = getContext(db, projectKey, args);
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const isEmpty = data.pinned.length === 0 && data.notes.length === 0 && data.recent.length === 0 && data.hot.length === 0 && data.last_session === null;
  if (isEmpty) {
    return `[recall: no context available yet \u2014 use recall tools to build up your context store]`;
  }
  const lines = [
    `Context \u2014 ${today}`,
    "\u2550".repeat(36),
    `Generated ${formatRelativeTime(Date.now() - now)}`
  ];
  if (data.pinned.length > 0) {
    lines.push("", `Pinned (${data.pinned.length}):`);
    for (const item of data.pinned) {
      const excerpt = item.summary.slice(0, 100).replace(/\n/g, " ");
      const ellipsis = item.summary.length > 100 ? "\u2026" : "";
      lines.push(`  \uD83D\uDCCC ${item.id}  ${item.tool_name.padEnd(40)}  ${formatDate(item.created_at)}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }
  if (data.notes.length > 0) {
    lines.push("", `Notes (${data.notes.length}):`);
    for (const note of data.notes) {
      const excerpt = note.summary.slice(0, 100).replace(/\n/g, " ");
      const ellipsis = note.summary.length > 100 ? "\u2026" : "";
      lines.push(`  ${note.id}  ${formatDate(note.created_at)}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }
  if (data.recent.length > 0) {
    const days = args.days ?? 7;
    lines.push("", `Recently accessed (last ${days} day${days === 1 ? "" : "s"}, ${data.recent.length} item${data.recent.length === 1 ? "" : "s"}):`);
    for (const item of data.recent) {
      const excerpt = item.summary.slice(0, 100).replace(/\n/g, " ");
      const ellipsis = item.summary.length > 100 ? "\u2026" : "";
      lines.push(`  ${item.id}  ${item.tool_name.padEnd(40)}  ${formatDate(item.created_at)}  \xD7${item.access_count}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }
  if (data.hot.length > 0) {
    const date = data.last_session?.date ?? "";
    lines.push("", `Hot from last session (${date}, ${data.hot.length} item${data.hot.length === 1 ? "" : "s"}):`);
    for (const item of data.hot) {
      const excerpt = item.summary.slice(0, 100).replace(/\n/g, " ");
      const ellipsis = item.summary.length > 100 ? "\u2026" : "";
      lines.push(`  ${item.id}  ${item.tool_name.padEnd(40)}  ${formatDate(item.created_at)}  \xD7${item.access_count}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }
  if (data.last_session) {
    const s = data.last_session;
    const reductionStr = reductionPct(s.total_original_bytes, s.total_summary_bytes);
    lines.push("", `Last session (${s.date}):`);
    lines.push(`  ${s.stored_count} item${s.stored_count === 1 ? "" : "s"} stored \xB7 ${formatBytes(s.total_original_bytes)} \u2192 ${formatBytes(s.total_summary_bytes)} (${reductionStr} reduction)`);
  }
  return lines.join(`
`);
}

// src/debug.ts
function dbg(msg) {
  if (process.env.RECALL_DEBUG || loadConfig().debug.enabled) {
    process.stderr.write(`[recall:debug] ${msg}
`);
  }
}

// src/hooks/session-start.ts
var INJECT_MAX_CHARS = 2000;
function handleSessionStart(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(`[mcp-recall] error: session-start received invalid JSON \u2014 skipping
`);
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    process.stderr.write(`[mcp-recall] error: session-start received unexpected input shape \u2014 skipping
`);
    return;
  }
  const input = parsed;
  const config = loadConfig();
  const projectKey = getProjectKey(input.cwd);
  const db = getDb(defaultDbPath(projectKey));
  const today = new Date().toISOString().slice(0, 10);
  recordSession(db, today);
  pruneExpired(db, projectKey, config.store.expire_after_session_days);
  const data = getContext(db, projectKey);
  const isEmpty = data.pinned.length === 0 && data.notes.length === 0 && data.recent.length === 0 && data.hot.length === 0 && data.last_session === null;
  if (!isEmpty) {
    let snapshot = toolContext(db, projectKey, {});
    if (snapshot.length > INJECT_MAX_CHARS) {
      snapshot = snapshot.slice(0, INJECT_MAX_CHARS) + `
\u2026 (truncated \u2014 call recall__context for the full view)`;
    }
    process.stdout.write(snapshot + `
`);
    dbg(`session-start \xB7 project=${projectKey.slice(0, 8)} \xB7 injected ${snapshot.length} chars`);
  } else {
    dbg(`session-start \xB7 project=${projectKey.slice(0, 8)} \xB7 nothing to inject`);
  }
}

// src/hooks/post-tool-use.ts
import { createHash as createHash2 } from "crypto";

// src/denylist.ts
var BUILTIN_PATTERNS = [
  "mcp__recall__*",
  "mcp__1password__*",
  "mcp__bitwarden__*",
  "mcp__lastpass__*",
  "mcp__dashlane__*",
  "mcp__keeper__*",
  "mcp__hashicorp_vault__*",
  "mcp__vault__*",
  "mcp__doppler__*",
  "mcp__infisical__*",
  "*secret*",
  "*password*",
  "*credential*",
  "*token*",
  "*api_key*",
  "*access_key*",
  "*private_key*",
  "*signing_key*",
  "*encrypt*key*",
  "*oauth*",
  "*auth_token*",
  "*authenticate*",
  "*env_var*",
  "*dotenv*"
];
function isDenied(toolName, config) {
  if (config.denylist.allowlist.some((p) => matchesPattern(toolName, p))) {
    return false;
  }
  const base = config.denylist.override_defaults.length > 0 ? config.denylist.override_defaults : BUILTIN_PATTERNS;
  const patterns = [...base, ...config.denylist.additional];
  return patterns.some((p) => matchesPattern(toolName, p));
}
var regexCache = new Map;
function matchesPattern(toolName, pattern) {
  let re = regexCache.get(pattern);
  if (!re) {
    const escaped = pattern.split("*").map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join(".*");
    re = new RegExp(`^${escaped}$`);
    regexCache.set(pattern, re);
  }
  return re.test(toolName);
}

// src/secrets.ts
var SECRET_PATTERNS = [
  {
    name: "PEM private key",
    pattern: /-----BEGIN .{0,20}PRIVATE KEY-----/
  },
  {
    name: "GitHub PAT (classic)",
    pattern: /ghp_[A-Za-z0-9]{36}/
  },
  {
    name: "GitHub PAT (fine-grained)",
    pattern: /github_pat_[A-Za-z0-9_]{82}/
  },
  {
    name: "GitHub OAuth token",
    pattern: /gho_[A-Za-z0-9]{36}/
  },
  {
    name: "OpenAI API key",
    pattern: /sk-[A-Za-z0-9]{32,}/
  },
  {
    name: "AWS access key ID",
    pattern: /AKIA[0-9A-Z]{16}/
  },
  {
    name: "AWS secret access key",
    pattern: /aws.{0,20}secret.{0,20}[A-Za-z0-9/+=]{40}/i
  },
  {
    name: "Anthropic API key",
    pattern: /sk-ant-[A-Za-z0-9\-_]{32,}/
  },
  {
    name: "Generic Bearer token",
    pattern: /Bearer [A-Za-z0-9\-._~+/]{32,}/
  },
  {
    name: "SSH private key",
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/
  }
];
function findSecrets(content) {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(({ name }) => name);
}

// src/handlers/types.ts
function extractText(output) {
  if (typeof output === "string")
    return output;
  if (output !== null && typeof output === "object") {
    const obj = output;
    if (Array.isArray(obj["content"])) {
      const text = obj["content"].filter((c) => typeof c === "object" && c !== null && c["type"] === "text" && typeof c["text"] === "string").map((c) => c.text).join(`
`);
      if (text.length > 0)
        return text;
    }
  }
  return JSON.stringify(output);
}

// src/handlers/playwright.ts
var INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "input",
  "checkbox",
  "radio",
  "select",
  "combobox",
  "menuitem",
  "tab",
  "searchbox",
  "spinbutton",
  "slider",
  "switch"
]);
var TEXT_ROLES = new Set([
  "heading",
  "paragraph",
  "statictext",
  "text",
  "label",
  "status",
  "alert",
  "cell",
  "columnheader",
  "rowheader"
]);
var MAX_INTERACTIVE = 20;
var MAX_TEXT_CHARS = 400;
var playwrightHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const interactive = [];
  const textChunks = [];
  for (const line of raw.split(`
`)) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    const match = trimmed.match(/^-\s+(\w+)\s+"([^"]*)"(.*)$/i);
    if (!match)
      continue;
    const [, role, label] = match;
    const roleLower = role.toLowerCase();
    if (INTERACTIVE_ROLES.has(roleLower) && interactive.length < MAX_INTERACTIVE) {
      interactive.push(`[${roleLower} "${label}"]`);
    } else if (TEXT_ROLES.has(roleLower) && label.trim().length > 0) {
      textChunks.push(label.trim());
    }
  }
  const textContent = textChunks.join(" ").slice(0, MAX_TEXT_CHARS).trimEnd();
  const parts = [];
  if (interactive.length > 0) {
    parts.push(`Interactive: ${interactive.join(", ")}`);
  }
  if (textContent.length > 0) {
    parts.push(`Visible text: ${textContent}`);
  }
  const summary = parts.length > 0 ? parts.join(`
`) : "[snapshot: no interactive elements or visible text extracted]";
  return { summary, originalSize };
};

// src/handlers/github.ts
var BODY_EXCERPT_CHARS = 200;
function summariseItem(item) {
  const parts = [];
  if (typeof item["number"] === "number")
    parts.push(`#${item["number"]}`);
  if (typeof item["title"] === "string")
    parts.push(`"${item["title"]}"`);
  if (typeof item["state"] === "string")
    parts.push(`[${item["state"]}]`);
  if (typeof item["name"] === "string" && !item["title"])
    parts.push(item["name"]);
  const url = item["html_url"] ?? item["url"];
  if (typeof url === "string")
    parts.push(url);
  const labels = item["labels"];
  if (Array.isArray(labels) && labels.length > 0) {
    const names = labels.map((l) => typeof l === "object" && l !== null && typeof l["name"] === "string" ? l["name"] : String(l)).join(", ");
    parts.push(`labels: ${names}`);
  }
  if (typeof item["body"] === "string" && item["body"].length > 0) {
    const excerpt = item["body"].slice(0, BODY_EXCERPT_CHARS).trimEnd();
    const truncated = item["body"].length > BODY_EXCERPT_CHARS ? "\u2026" : "";
    parts.push(`body: ${excerpt}${truncated}`);
  }
  return parts.join(" \xB7 ");
}
var githubHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  if (Array.isArray(parsed)) {
    const items = parsed;
    const lines = items.slice(0, 10).map((item) => typeof item === "object" && item !== null ? summariseItem(item) : String(item));
    const more = items.length > 10 ? `
\u2026and ${items.length - 10} more` : "";
    return { summary: lines.join(`
`) + more, originalSize };
  }
  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summariseItem(parsed), originalSize };
  }
  return { summary: String(parsed), originalSize };
};

// src/handlers/gitlab.ts
var DESCRIPTION_EXCERPT_CHARS = 200;
function summariseItem2(item) {
  const parts = [];
  if (typeof item["iid"] === "number")
    parts.push(`!${item["iid"]}`);
  else if (typeof item["id"] === "number" && !item["iid"])
    parts.push(`#${item["id"]}`);
  if (typeof item["title"] === "string")
    parts.push(`"${item["title"]}"`);
  if (typeof item["state"] === "string")
    parts.push(`[${item["state"]}]`);
  if (typeof item["name"] === "string" && !item["title"])
    parts.push(item["name"]);
  if (typeof item["web_url"] === "string")
    parts.push(item["web_url"]);
  const labels = item["labels"];
  if (Array.isArray(labels) && labels.length > 0) {
    const names = labels.map((l) => String(l)).join(", ");
    parts.push(`labels: ${names}`);
  }
  const body = item["description"] ?? item["body"];
  if (typeof body === "string" && body.length > 0) {
    const excerpt = body.slice(0, DESCRIPTION_EXCERPT_CHARS).trimEnd();
    const truncated = body.length > DESCRIPTION_EXCERPT_CHARS ? "\u2026" : "";
    parts.push(`description: ${excerpt}${truncated}`);
  }
  return parts.join(" \xB7 ");
}
var gitlabHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  if (Array.isArray(parsed)) {
    const items = parsed;
    const lines = items.slice(0, 10).map((item) => typeof item === "object" && item !== null ? summariseItem2(item) : String(item));
    const more = items.length > 10 ? `
\u2026and ${items.length - 10} more` : "";
    return { summary: lines.join(`
`) + more, originalSize };
  }
  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summariseItem2(parsed), originalSize };
  }
  return { summary: String(parsed), originalSize };
};

// src/handlers/filesystem.ts
var HEAD_LINES = 50;
var filesystemHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const lines = raw.split(`
`);
  const totalLines = lines.length;
  const head = lines.slice(0, HEAD_LINES).join(`
`);
  const truncated = totalLines > HEAD_LINES;
  const header = `[${totalLines} line${totalLines === 1 ? "" : "s"}${truncated ? `, showing first ${HEAD_LINES}` : ""}]`;
  const summary = `${header}
${head}${truncated ? `
\u2026` : ""}`;
  return { summary, originalSize };
};

// src/handlers/json.ts
var MAX_DEPTH = 3;
var MAX_ARRAY_ITEMS = 3;
function truncate(value, depth) {
  if (depth > MAX_DEPTH)
    return "\u2026";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((v) => truncate(v, depth + 1));
    const more = value.length - MAX_ARRAY_ITEMS;
    if (more > 0)
      items.push(`\u2026${more} more`);
    return items;
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = truncate(v, depth + 1);
    }
    return result;
  }
  return value;
}
var jsonHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  const truncated = truncate(parsed, 0);
  const summary = JSON.stringify(truncated, null, 2);
  return { summary, originalSize };
};

// src/handlers/shell.ts
var HEAD_STDOUT = 25;
var HEAD_STDERR = 20;
var ANSI_RE = /[\x1b\x9b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
function stripAnsi(text) {
  return text.replace(ANSI_RE, "");
}
var SSH_NOISE_RE = /^\*\* .+/;
function stripSshNoise(text) {
  const lines = text.split(`
`);
  const filtered = lines.filter((line) => !SSH_NOISE_RE.test(line));
  const result = [];
  let prevBlank = false;
  for (const line of filtered) {
    const blank = line.trim() === "";
    if (blank && prevBlank)
      continue;
    result.push(line);
    prevBlank = blank;
  }
  while (result.length > 0 && result[0].trim() === "")
    result.shift();
  return result.join(`
`);
}
function trimTrailingEmpty(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "")
    end--;
  return lines.slice(0, end);
}
function formatLines(text, max) {
  const lines = trimTrailingEmpty(text.split(`
`));
  const total = lines.length;
  const truncated = total > max;
  const head = lines.slice(0, max).join(`
`);
  const overflow = truncated ? `
\u2026 (+${total - max} more lines)` : "";
  return {
    header: `${total} line${total === 1 ? "" : "s"}`,
    body: `${head}${overflow}`
  };
}
function parseStructured(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && (("stdout" in parsed) || ("stderr" in parsed) || ("output" in parsed))) {
      return parsed;
    }
  } catch {}
  return null;
}
var shellHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const structured = parseStructured(raw);
  if (structured) {
    const stdout = stripSshNoise(stripAnsi(structured.stdout ?? structured.output ?? ""));
    const stderr = stripSshNoise(stripAnsi(structured.stderr ?? ""));
    const exitCode = structured.returncode ?? structured.exit_code;
    const trimmedStdout = stdout.trim();
    if (trimmedStdout.startsWith("{") || trimmedStdout.startsWith("[")) {
      try {
        JSON.parse(trimmedStdout);
        const { summary } = jsonHandler(_toolName, trimmedStdout);
        return { summary, originalSize };
      } catch {}
    }
    const exitStr = exitCode !== undefined ? `exit:${exitCode} \xB7 ` : "";
    const stdoutFmt = formatLines(stdout, HEAD_STDOUT);
    const hasStderr = stderr.trim().length > 0;
    const stderrFmt = hasStderr ? formatLines(stderr, HEAD_STDERR) : null;
    const stderrDesc = stderrFmt ? ` \xB7 ${stderrFmt.header} stderr` : "";
    const header = `[bash \xB7 ${exitStr}${stdoutFmt.header} stdout${stderrDesc}]`;
    const parts = [header];
    if (stdout.trim())
      parts.push(stdoutFmt.body);
    if (stderrFmt) {
      parts.push("stderr:");
      parts.push(stderrFmt.body);
    }
    return { summary: parts.join(`
`), originalSize };
  }
  const text = stripSshNoise(stripAnsi(raw));
  const trimmedText = text.trim();
  if (trimmedText.startsWith("{") || trimmedText.startsWith("[")) {
    try {
      JSON.parse(trimmedText);
      const { summary } = jsonHandler(_toolName, trimmedText);
      return { summary, originalSize };
    } catch {}
  }
  const fmt = formatLines(text, HEAD_STDOUT);
  return {
    summary: `[bash \xB7 ${fmt.header}]
${fmt.body}`,
    originalSize
  };
};

// src/handlers/bash.ts
var MAX_LOG_COMMITS = 20;
var MAX_TERRAFORM_RESOURCES = 10;
var MAX_DOCKER_CONTAINERS = 20;
var MAX_BUILD_ERRORS = 20;
function extractStdout(output) {
  if (output !== null && typeof output === "object") {
    const obj = output;
    if (typeof obj.stdout === "string")
      return stripSshNoise(stripAnsi(obj.stdout));
    if (typeof obj.output === "string")
      return stripSshNoise(stripAnsi(obj.output));
  }
  const text = extractText(output);
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const p = parsed;
      if (typeof p.stdout === "string")
        return stripSshNoise(stripAnsi(p.stdout));
      if (typeof p.output === "string")
        return stripSshNoise(stripAnsi(p.output));
    }
  } catch {}
  return stripSshNoise(stripAnsi(text));
}
function extractStderr(output) {
  if (output !== null && typeof output === "object") {
    const obj = output;
    if (typeof obj.stderr === "string")
      return stripAnsi(obj.stderr);
  }
  return "";
}
function extractCommand(input) {
  if (input !== null && typeof input === "object") {
    const obj = input;
    if (typeof obj.command === "string")
      return obj.command.trim();
  }
  return null;
}
function parseGitDiff(text) {
  const files = [];
  let current = null;
  for (const line of text.split(`
`)) {
    if (line.startsWith("diff --git ")) {
      if (current)
        files.push(current);
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      const path = match ? match[1] : line.slice(11);
      current = { path, additions: 0, deletions: 0, hunks: 0 };
    } else if (current) {
      if (line.startsWith("@@ ")) {
        current.hunks++;
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        current.additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        current.deletions++;
      }
    }
  }
  if (current)
    files.push(current);
  return files;
}
var gitDiffHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  if (!stdout.trim()) {
    return { summary: "[git diff \u2014 no changes]", originalSize };
  }
  const files = parseGitDiff(stdout);
  if (files.length === 0) {
    return shellHandler(toolName, output);
  }
  const totalAdded = files.reduce((s, f) => s + f.additions, 0);
  const totalDeleted = files.reduce((s, f) => s + f.deletions, 0);
  const header = `git diff \u2014 ${files.length} file${files.length === 1 ? "" : "s"} changed, +${totalAdded} -${totalDeleted}`;
  const fileLines = files.map((f) => {
    const stats = `+${f.additions} -${f.deletions}`;
    const hunks = `(${f.hunks} hunk${f.hunks === 1 ? "" : "s"})`;
    return `  ${f.path.padEnd(48)}  ${stats.padEnd(10)}  ${hunks}`;
  });
  return { summary: [header, ...fileLines].join(`
`), originalSize };
};
var gitLogHandler = (_toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const lines = stdout.trim().split(`
`).filter((l) => l.trim());
  if (lines.length === 0) {
    return { summary: "[git log \u2014 no commits]", originalSize };
  }
  const isOneline = lines.every((l) => /^[0-9a-f]{6,40}\s/.test(l.trim()));
  if (isOneline) {
    const total2 = lines.length;
    const shown2 = lines.slice(0, MAX_LOG_COMMITS);
    const overflow2 = total2 > MAX_LOG_COMMITS ? `
\u2026 (+${total2 - MAX_LOG_COMMITS} more commits)` : "";
    const summary = `git log \u2014 ${total2} commit${total2 === 1 ? "" : "s"}
` + shown2.map((l) => `  ${l}`).join(`
`) + overflow2;
    return { summary, originalSize };
  }
  const commits = [];
  let hash = "";
  let seenBlank = false;
  for (const line of stdout.split(`
`)) {
    if (line.startsWith("commit ")) {
      hash = line.slice(7, 14);
      seenBlank = false;
    } else if (hash && line.trim() === "" && !seenBlank) {
      seenBlank = true;
    } else if (hash && seenBlank && line.startsWith("    ") && line.trim()) {
      const subject = line.trim().slice(0, 72);
      commits.push(`  ${hash}  ${subject}`);
      hash = "";
      seenBlank = false;
    }
  }
  const total = commits.length;
  const shown = commits.slice(0, MAX_LOG_COMMITS);
  const overflow = total > MAX_LOG_COMMITS ? `
\u2026 (+${total - MAX_LOG_COMMITS} more commits)` : "";
  const header = `git log \u2014 ${total} commit${total === 1 ? "" : "s"}`;
  return {
    summary: [header, ...shown].join(`
`) + overflow,
    originalSize
  };
};
var gitStatusHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  if (!stdout.trim()) {
    return { summary: "[git status \u2014 clean working tree]", originalSize };
  }
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const conflicts = [];
  let section = null;
  for (const line of stdout.split(`
`)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Changes to be committed")) {
      section = "staged";
      continue;
    }
    if (trimmed.startsWith("Changes not staged")) {
      section = "unstaged";
      continue;
    }
    if (trimmed.startsWith("Untracked files")) {
      section = "untracked";
      continue;
    }
    if (trimmed.startsWith("both modified") || trimmed.startsWith("both added")) {
      conflicts.push(trimmed);
      continue;
    }
    if (!trimmed || trimmed.startsWith("(") || trimmed.startsWith("no changes"))
      continue;
    if (trimmed.startsWith("On branch") || trimmed.startsWith("HEAD") || trimmed.startsWith("Your branch") || trimmed.startsWith("nothing"))
      continue;
    const porcelain = line.match(/^([MADRCU?!]{1,2})\s+(.+)$/);
    if (porcelain) {
      const [, code, file] = porcelain;
      if (code.startsWith("?"))
        untracked.push(file);
      else if (code[0] !== " " && code[0] !== "?")
        staged.push(`${code[0]} ${file}`);
      if (code[1] && code[1] !== " " && code[1] !== "?")
        unstaged.push(`${code[1]} ${file}`);
      continue;
    }
    if (section === "staged" && trimmed.match(/^(modified|new file|deleted|renamed):/)) {
      staged.push(trimmed);
    } else if (section === "unstaged" && trimmed.match(/^(modified|deleted):/)) {
      unstaged.push(trimmed);
    } else if (section === "untracked" && trimmed && !trimmed.startsWith("(")) {
      untracked.push(trimmed);
    }
  }
  if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && conflicts.length === 0) {
    return shellHandler(toolName, output);
  }
  const lines = ["git status"];
  if (conflicts.length > 0)
    lines.push(`  conflicts (${conflicts.length}): ${conflicts.slice(0, 5).join(", ")}`);
  if (staged.length > 0)
    lines.push(`  staged (${staged.length}): ${staged.slice(0, 5).map((f) => f.replace(/^(modified|new file|deleted|renamed):\s*/, "")).join(", ")}${staged.length > 5 ? ` +${staged.length - 5} more` : ""}`);
  if (unstaged.length > 0)
    lines.push(`  unstaged (${unstaged.length}): ${unstaged.slice(0, 5).map((f) => f.replace(/^(modified|deleted):\s*/, "")).join(", ")}${unstaged.length > 5 ? ` +${unstaged.length - 5} more` : ""}`);
  if (untracked.length > 0)
    lines.push(`  untracked (${untracked.length}): ${untracked.slice(0, 5).join(", ")}${untracked.length > 5 ? ` +${untracked.length - 5} more` : ""}`);
  return { summary: lines.join(`
`), originalSize };
};
var TERRAFORM_RESOURCE_RE = /^\s+#\s+(.+?)\s+will\s+be\s+(created|destroyed|updated in-place|replaced)/;
var TERRAFORM_PLAN_SUMMARY_RE = /^Plan:\s+.+$/m;
var TERRAFORM_SYMBOL = {
  created: "+",
  destroyed: "-",
  "updated in-place": "~",
  replaced: "-/+"
};
var terraformPlanHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const summaryMatch = stdout.match(TERRAFORM_PLAN_SUMMARY_RE);
  const summaryLine = summaryMatch ? summaryMatch[0] : null;
  const resources = [];
  for (const line of stdout.split(`
`)) {
    const match = line.match(TERRAFORM_RESOURCE_RE);
    if (match) {
      const [, resource, action] = match;
      const symbol = TERRAFORM_SYMBOL[action] ?? "?";
      resources.push(`  ${symbol} ${resource}`);
    }
  }
  if (!summaryLine && resources.length === 0) {
    return shellHandler(toolName, output);
  }
  const lines = ["terraform plan"];
  if (summaryLine)
    lines.push(`  ${summaryLine}`);
  lines.push(...resources.slice(0, MAX_TERRAFORM_RESOURCES));
  if (resources.length > MAX_TERRAFORM_RESOURCES) {
    lines.push(`  \u2026 (+${resources.length - MAX_TERRAFORM_RESOURCES} more resources)`);
  }
  return { summary: lines.join(`
`), originalSize };
};
var packageInstallHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}
${stderr}`.trim();
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const warnings = [];
  const errors2 = [];
  for (const line of combined.split(`
`)) {
    const t = line.trim();
    if (!t)
      continue;
    if (/^(npm warn|warn |warning )/i.test(t))
      warnings.push(t.slice(0, 100));
    else if (/^(npm error|error |err )/i.test(t))
      errors2.push(t.slice(0, 100));
  }
  let countLine = null;
  const bunMatch = combined.match(/(\d+)\s+packages?\s+installed/i);
  if (bunMatch)
    countLine = `${bunMatch[1]} packages installed`;
  if (!countLine) {
    const npmMatch = combined.match(/added\s+(\d+)[^,\n]*/i);
    if (npmMatch)
      countLine = npmMatch[0].trim().slice(0, 60);
  }
  if (!countLine) {
    const pipMatch = combined.match(/Successfully installed (.+)/);
    if (pipMatch) {
      const pkgs = pipMatch[1].trim().split(/\s+/);
      countLine = `pip: ${pkgs.length} package${pkgs.length === 1 ? "" : "s"} installed`;
    }
  }
  if (!countLine) {
    const yarnMatch = combined.match(/success Saved (\d+) new dependenc/i);
    if (yarnMatch)
      countLine = `yarn: ${yarnMatch[1]} new dependencies saved`;
  }
  if (!countLine && errors2.length === 0) {
    return shellHandler(toolName, output);
  }
  const lines = [countLine ?? "package install"];
  if (warnings.length > 0)
    lines.push(`  ${warnings.length} warning${warnings.length === 1 ? "" : "s"}${warnings.length <= 3 ? ": " + warnings.join("; ") : ""}`);
  if (errors2.length > 0)
    lines.push(...errors2.slice(0, 5).map((e) => `  error: ${e}`));
  return { summary: lines.join(`
`), originalSize };
};
var testRunnerHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}
${stderr}`.trim();
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const failureLines = [];
  for (const line of combined.split(`
`)) {
    const t = line.trim();
    if (!t)
      continue;
    if (/^(FAILED|FAIL)\s+/.test(t) || /^[\u2715\u2717\u00D7\u25CF]\s/.test(t) || /^\(fail\)\s/.test(t) || /^--- FAIL:/.test(t)) {
      failureLines.push(t.slice(0, 120));
    }
  }
  let passed = 0, failed = 0, skipped = 0;
  let foundSummary = false;
  for (const line of combined.split(`
`)) {
    const t = line.trim();
    const bunPass = t.match(/^(\d+)\s+pass$/);
    const bunFail = t.match(/^(\d+)\s+fail$/);
    if (bunPass) {
      passed = parseInt(bunPass[1]);
      foundSummary = true;
    }
    if (bunFail) {
      failed = parseInt(bunFail[1]);
      foundSummary = true;
    }
    const pytestMatch = t.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+(?:skipped|warning))?/);
    if (pytestMatch) {
      passed = parseInt(pytestMatch[1]);
      if (pytestMatch[2])
        failed = parseInt(pytestMatch[2]);
      if (pytestMatch[3])
        skipped = parseInt(pytestMatch[3]);
      foundSummary = true;
    }
    const jestMatch = t.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed(?:,\s+(\d+)\s+skipped)?/);
    if (jestMatch) {
      if (jestMatch[1])
        failed = parseInt(jestMatch[1]);
      passed = parseInt(jestMatch[2]);
      if (jestMatch[3])
        skipped = parseInt(jestMatch[3]);
      foundSummary = true;
    }
    const goOk = t.match(/^ok\s+\S+/);
    const goFail = t.match(/^FAIL\s+\S+/);
    if (goOk) {
      passed++;
      foundSummary = true;
    }
    if (goFail) {
      failed++;
      foundSummary = true;
    }
  }
  if (!foundSummary && failureLines.length === 0) {
    return shellHandler(toolName, output);
  }
  const total = passed + failed + skipped;
  const status = failed > 0 ? "FAIL" : "pass";
  const parts = [];
  if (passed > 0)
    parts.push(`${passed} passed`);
  if (failed > 0)
    parts.push(`${failed} failed`);
  if (skipped > 0)
    parts.push(`${skipped} skipped`);
  const summaryStr = parts.length > 0 ? parts.join(", ") : "no results";
  const lines = [`test runner \u2014 ${status}: ${summaryStr}${total > 0 ? ` (${total} total)` : ""}`];
  if (failureLines.length > 0) {
    lines.push(`  failures:`);
    lines.push(...failureLines.slice(0, MAX_BUILD_ERRORS).map((l) => `    ${l}`));
    if (failureLines.length > MAX_BUILD_ERRORS) {
      lines.push(`    \u2026 (+${failureLines.length - MAX_BUILD_ERRORS} more)`);
    }
  }
  return { summary: lines.join(`
`), originalSize };
};
var dockerPsHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const lines = stdout.trim().split(`
`).filter((l) => l.trim());
  if (lines.length === 0) {
    return { summary: "[docker ps \u2014 no containers]", originalSize };
  }
  const dataLines = lines[0]?.toUpperCase().includes("CONTAINER") ? lines.slice(1) : lines;
  if (dataLines.length === 0) {
    return { summary: "[docker ps \u2014 no containers running]", originalSize };
  }
  const containers = [];
  for (const line of dataLines) {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length < 2)
      continue;
    const name = parts[parts.length - 1] ?? "";
    const statusPart = parts.find((p) => /^(Up|Exited|Restarting|Created|Paused|Dead)/i.test(p)) ?? "";
    const portsPart = parts.find((p) => p.includes("->") || p.includes("0.0.0.0:")) ?? "";
    if (!name)
      continue;
    const statusShort = statusPart.slice(0, 20);
    const portsShort = portsPart.slice(0, 40);
    containers.push({ name, status: statusShort, ports: portsShort });
  }
  if (containers.length === 0) {
    return shellHandler(toolName, output);
  }
  const shown = containers.slice(0, MAX_DOCKER_CONTAINERS);
  const overflow = containers.length > MAX_DOCKER_CONTAINERS ? `
  \u2026 (+${containers.length - MAX_DOCKER_CONTAINERS} more)` : "";
  const rows = shown.map((c) => {
    const name = c.name.padEnd(30);
    const status = c.status.padEnd(22);
    return `  ${name}  ${status}  ${c.ports}`;
  });
  const header = `docker ps \u2014 ${containers.length} container${containers.length === 1 ? "" : "s"}`;
  return {
    summary: [header, ...rows].join(`
`) + overflow,
    originalSize
  };
};
var buildToolHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}
${stderr}`.trim();
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const errorLines = [];
  const targetLines = [];
  for (const line of combined.split(`
`)) {
    const t = line.trim();
    if (!t)
      continue;
    if (/^make(\[\d+\])?:\s/.test(t)) {
      if (t.includes("Error") || t.includes("***"))
        errorLines.push(t.slice(0, 120));
      else if (t.includes("Leaving directory") || t.includes("Entering directory"))
        continue;
      else
        targetLines.push(t.slice(0, 80));
      continue;
    }
    if (/^(error:|justfile|warning:)\s/i.test(t)) {
      errorLines.push(t.slice(0, 120));
      continue;
    }
    if (/^[^\s]+:\d+:\d*:?\s*(error|fatal error):/i.test(t) || /^error\[/.test(t) || /^\s*\^\s*$/.test(t)) {
      errorLines.push(t.slice(0, 120));
    }
  }
  if (errorLines.length === 0 && targetLines.length === 0) {
    return shellHandler(toolName, output);
  }
  const exitCode = output?.exit_code;
  const status = exitCode === 0 ? "\u2713" : exitCode !== undefined ? "\u2717" : "";
  const lines = [`${status ? status + " " : ""}build`];
  if (errorLines.length > 0) {
    lines.push(`  errors (${errorLines.length}):`);
    lines.push(...errorLines.slice(0, MAX_BUILD_ERRORS).map((e) => `    ${e}`));
    if (errorLines.length > MAX_BUILD_ERRORS) {
      lines.push(`    \u2026 (+${errorLines.length - MAX_BUILD_ERRORS} more)`);
    }
  } else {
    lines.push(`  completed successfully`);
  }
  return { summary: lines.join(`
`), originalSize };
};
var ghHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(extractText(output), "utf8");
  const lines = stdout.trim().split(`
`).filter((l) => l.trim());
  if (lines.length <= 5)
    return shellHandler(toolName, output);
  const listLines = lines.filter((l) => /^#?\d+\t/.test(l));
  if (listLines.length >= Math.ceil(lines.length * 0.5)) {
    const shown = listLines.slice(0, 10);
    const overflow = listLines.length > 10 ? `
  \u2026 (+${listLines.length - 10} more)` : "";
    const rows = shown.map((l) => {
      const parts = l.split("\t").slice(0, 3);
      return `  ${parts.join("  ").slice(0, 100)}`;
    });
    return {
      summary: `gh \u2014 ${listLines.length} item${listLines.length === 1 ? "" : "s"}
` + rows.join(`
`) + overflow,
      originalSize
    };
  }
  const passCount = lines.filter((l) => /\tpass\b/i.test(l)).length;
  const failCount = lines.filter((l) => /\tfail\b/i.test(l)).length;
  if (passCount + failCount >= Math.ceil(lines.length * 0.4)) {
    const failLines = lines.filter((l) => /\tfail\b/i.test(l)).slice(0, 5).map((l) => `  fail: ${l.split("\t")[0].trim().slice(0, 80)}`);
    return {
      summary: [`gh checks \u2014 ${passCount} pass, ${failCount} fail`, ...failLines].join(`
`),
      originalSize
    };
  }
  const kvLines = lines.filter((l) => /^(title|state|author|labels|number|assignees|milestone):\t/i.test(l));
  if (kvLines.length >= 2) {
    const meta = kvLines.slice(0, 5).map((l) => {
      const [key, ...vals] = l.split("\t");
      return `  ${(key ?? "").replace(/:$/, "")}: ${vals.join(" ").trim().slice(0, 100)}`;
    });
    return {
      summary: `gh view
${meta.join(`
`)}`,
      originalSize
    };
  }
  return shellHandler(toolName, output);
};
function getBashHandler(input) {
  const command = extractCommand(input);
  if (!command)
    return shellHandler;
  if (/^git\s+(diff|show)(\s|$)/.test(command))
    return gitDiffHandler;
  if (/^git\s+log(\s|$)/.test(command))
    return gitLogHandler;
  if (/^git\s+status(\s|$)/.test(command))
    return gitStatusHandler;
  if (/^terraform\s+plan(\s|$)/.test(command))
    return terraformPlanHandler;
  if (/^(npm|bun|yarn|pnpm)\s+install(\s|$)/.test(command) || /^pip\d*\s+install(\s|$)/.test(command))
    return packageInstallHandler;
  if (/^(pytest|python\s+-m\s+pytest)(\s|$)/.test(command) || /^(jest|npx\s+jest|bun\s+test|vitest|npx\s+vitest)(\s|$)/.test(command) || /^go\s+test(\s|$)/.test(command))
    return testRunnerHandler;
  if (/^docker(-compose)?\s+(ps|compose\s+ps)(\s|$)/.test(command) || /^docker\s+compose\s+ps(\s|$)/.test(command))
    return dockerPsHandler;
  if (/^(make|just)(\s|$)/.test(command))
    return buildToolHandler;
  if (/^gh\s+/.test(command))
    return ghHandler;
  return shellHandler;
}

// src/handlers/linear.ts
var PRIORITY_LABEL = {
  0: "No Priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low"
};
var DESC_CHARS = 200;
var MAX_LIST_ITEMS = 10;
function priorityLabel(priority) {
  if (typeof priority === "number" && priority in PRIORITY_LABEL) {
    return PRIORITY_LABEL[priority];
  }
  if (typeof priority === "string" && priority.length > 0)
    return priority;
  return null;
}
function stateLabel(state) {
  if (typeof state === "object" && state !== null) {
    const name = state["name"];
    if (typeof name === "string")
      return name;
  }
  if (typeof state === "string")
    return state;
  return null;
}
function summariseIssue(issue, includeDesc = true) {
  const parts = [];
  const id = issue["identifier"] ?? issue["id"];
  if (id != null)
    parts.push(String(id));
  if (typeof issue["title"] === "string")
    parts.push(`"${issue["title"]}"`);
  const state = stateLabel(issue["state"] ?? issue["stateName"]);
  if (state)
    parts.push(`[${state}]`);
  const priority = priorityLabel(issue["priority"]);
  if (priority)
    parts.push(`Priority: ${priority}`);
  const url = issue["url"] ?? issue["branchName"];
  if (typeof url === "string" && url.startsWith("http"))
    parts.push(url);
  const lines = [parts.join(" \xB7 ")];
  if (includeDesc) {
    const desc = issue["description"];
    if (typeof desc === "string" && desc.length > 0) {
      const excerpt = desc.slice(0, DESC_CHARS).trimEnd();
      const truncated = desc.length > DESC_CHARS ? "\u2026" : "";
      lines.push(`Description: ${excerpt}${truncated}`);
    }
  }
  return lines.join(`
`);
}
function extractIssues(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.filter((i) => typeof i === "object" && i !== null);
  }
  if (typeof parsed !== "object" || parsed === null)
    return null;
  const obj = parsed;
  const data = obj["data"];
  if (typeof data === "object" && data !== null) {
    const d = data;
    if (typeof d["issue"] === "object" && d["issue"] !== null) {
      return [d["issue"]];
    }
    const issues = d["issues"];
    if (typeof issues === "object" && issues !== null) {
      const nodes = issues["nodes"];
      if (Array.isArray(nodes)) {
        return nodes.filter((i) => typeof i === "object" && i !== null);
      }
    }
  }
  if (Array.isArray(obj["nodes"])) {
    return obj["nodes"].filter((i) => typeof i === "object" && i !== null);
  }
  if (obj["identifier"] != null || typeof obj["title"] === "string") {
    return [obj];
  }
  return null;
}
var linearHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 500), originalSize };
  }
  const issues = extractIssues(parsed);
  if (!issues || issues.length === 0) {
    return { summary: raw.slice(0, 500), originalSize };
  }
  if (issues.length === 1) {
    return { summary: summariseIssue(issues[0], true), originalSize };
  }
  const lines = issues.slice(0, MAX_LIST_ITEMS).map((issue, i) => `${i + 1}. ${summariseIssue(issue, false)}`);
  const more = issues.length > MAX_LIST_ITEMS ? `
\u2026and ${issues.length - MAX_LIST_ITEMS} more` : "";
  return {
    summary: `${issues.length} Linear issues:
${lines.join(`
`)}${more}`,
    originalSize
  };
};

// src/handlers/slack.ts
var MSG_CHARS = 200;
var MAX_MESSAGES = 10;
function formatSlackTs(ts) {
  if (typeof ts !== "string" && typeof ts !== "number")
    return "";
  const secs = typeof ts === "string" ? parseFloat(ts) : ts;
  if (isNaN(secs))
    return "";
  return new Date(secs * 1000).toISOString().slice(0, 16).replace("T", " ");
}
function resolveUser(msg) {
  const profile = msg["user_profile"] ?? msg["profile"];
  if (typeof profile === "object" && profile !== null) {
    const p = profile;
    const name = p["display_name"] ?? p["real_name"] ?? p["name"];
    if (typeof name === "string" && name.length > 0)
      return name;
  }
  return (typeof msg["username"] === "string" ? msg["username"] : null) ?? (typeof msg["user"] === "string" ? msg["user"] : null) ?? "unknown";
}
function summariseMessage(msg) {
  const ts = formatSlackTs(msg["ts"]);
  const user = resolveUser(msg);
  const text = typeof msg["text"] === "string" ? msg["text"] : "";
  const excerpt = text.slice(0, MSG_CHARS).replace(/\n/g, " ").trimEnd();
  const truncated = text.length > MSG_CHARS ? "\u2026" : "";
  const prefix = ts ? `[${ts}] ` : "";
  return `${prefix}${user}: ${excerpt}${truncated}`;
}
function resolveChannel(obj) {
  const ch = obj["channel"];
  if (typeof ch === "string")
    return ch;
  if (typeof ch === "object" && ch !== null) {
    const name = ch["name"] ?? ch["id"];
    if (typeof name === "string")
      return `#${name}`;
  }
  if (typeof obj["channelId"] === "string")
    return obj["channelId"];
  return null;
}
function extractMessages(parsed) {
  if (Array.isArray(parsed)) {
    const msgs = parsed.filter((m) => typeof m === "object" && m !== null);
    if (msgs.length > 0 && (msgs[0]["ts"] != null || msgs[0]["text"] != null)) {
      return { messages: msgs, channel: null };
    }
    return null;
  }
  if (typeof parsed !== "object" || parsed === null)
    return null;
  const obj = parsed;
  if (obj["ts"] != null && obj["text"] != null) {
    return { messages: [obj], channel: resolveChannel(obj) };
  }
  if (Array.isArray(obj["messages"])) {
    const msgs = obj["messages"].filter((m) => typeof m === "object" && m !== null);
    return { messages: msgs, channel: resolveChannel(obj) };
  }
  return null;
}
var slackHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 500), originalSize };
  }
  const result = extractMessages(parsed);
  if (!result || result.messages.length === 0) {
    return { summary: raw.slice(0, 500), originalSize };
  }
  const { messages, channel } = result;
  const channelPrefix = channel ? `${channel} \u2014 ` : "";
  const count = messages.length;
  const lines = messages.slice(0, MAX_MESSAGES).map((msg, i) => `${i + 1}. ${summariseMessage(msg)}`);
  const more = count > MAX_MESSAGES ? `
\u2026and ${count - MAX_MESSAGES} more messages` : "";
  return {
    summary: `${channelPrefix}${count} message${count === 1 ? "" : "s"}:
${lines.join(`
`)}${more}`,
    originalSize
  };
};

// src/handlers/tavily.ts
var SNIPPET_CHARS = 150;
var MAX_RESULTS = 10;
function summariseResult(result) {
  const parts = [];
  if (typeof result["title"] === "string" && result["title"].length > 0) {
    parts.push(result["title"]);
  }
  if (typeof result["url"] === "string") {
    parts.push(result["url"]);
  }
  const content = typeof result["content"] === "string" ? result["content"] : "";
  if (content.length > 0) {
    const snippet = content.slice(0, SNIPPET_CHARS).trimEnd();
    const truncated = content.length > SNIPPET_CHARS ? "\u2026" : "";
    parts.push(`${snippet}${truncated}`);
  }
  return parts.join(" \xB7 ");
}
var tavilyHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { summary: String(parsed), originalSize };
  }
  const obj = parsed;
  const lines = [];
  if (typeof obj["query"] === "string" && obj["query"].length > 0) {
    lines.push(`Query: ${obj["query"]}`);
  }
  if (typeof obj["answer"] === "string" && obj["answer"].length > 0) {
    lines.push(`Answer: ${obj["answer"]}`);
  }
  const results = Array.isArray(obj["results"]) ? obj["results"] : [];
  if (results.length > 0) {
    const shown = results.slice(0, MAX_RESULTS);
    const more = results.length > MAX_RESULTS ? results.length - MAX_RESULTS : 0;
    lines.push(`Results (${results.length}):`);
    for (const result of shown) {
      if (typeof result === "object" && result !== null) {
        lines.push(`  ${summariseResult(result)}`);
      }
    }
    if (more > 0) {
      lines.push(`  \u2026and ${more} more`);
    }
  }
  if (lines.length === 0) {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  return { summary: lines.join(`
`), originalSize };
};

// src/handlers/database.ts
var MAX_PREVIEW_ROWS = 10;
var MAX_COLS_DISPLAY = 8;
function formatRow(index, row, cols) {
  const pairs = cols.slice(0, MAX_COLS_DISPLAY).map((col) => {
    const val = row[col];
    const str = val === null || val === undefined ? "NULL" : String(val);
    return `${col}=${str.length > 50 ? str.slice(0, 50) + "\u2026" : str}`;
  }).join(", ");
  const overflow = cols.length > MAX_COLS_DISPLAY ? ` [+${cols.length - MAX_COLS_DISPLAY} cols]` : "";
  return `  row ${index + 1}: ${pairs}${overflow}`;
}
function extractRows(parsed) {
  if (typeof parsed === "object" && parsed !== null && Array.isArray(parsed["rows"])) {
    const obj = parsed;
    const rows = obj["rows"].filter((r) => typeof r === "object" && r !== null);
    const fields = obj["fields"];
    let cols;
    if (Array.isArray(fields) && fields.length > 0) {
      cols = fields.map((f) => typeof f === "object" && f !== null && typeof f["name"] === "string" ? String(f["name"]) : "").filter(Boolean);
    } else {
      cols = rows.length > 0 ? Object.keys(rows[0]) : [];
    }
    return { rows, cols };
  }
  if (typeof parsed === "object" && parsed !== null && Array.isArray(parsed["results"])) {
    const rows = parsed["results"].filter((r) => typeof r === "object" && r !== null);
    const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, cols };
  }
  if (Array.isArray(parsed)) {
    const rows = parsed.filter((r) => typeof r === "object" && r !== null);
    const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, cols };
  }
  return null;
}
var databaseHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  const extracted = extractRows(parsed);
  if (!extracted) {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  const { rows, cols } = extracted;
  if (rows.length === 0) {
    return { summary: `[0 rows \xD7 ${cols.length} cols]
(empty result set)`, originalSize };
  }
  const colHeader = `headers: ${cols.slice(0, MAX_COLS_DISPLAY).join(", ")}` + (cols.length > MAX_COLS_DISPLAY ? ` [+${cols.length - MAX_COLS_DISPLAY} more]` : "");
  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS).map((row, i) => formatRow(i, row, cols));
  const more = rows.length > MAX_PREVIEW_ROWS ? `
[\u2026${rows.length - MAX_PREVIEW_ROWS} more rows]` : "";
  const summary = [
    `[${rows.length} rows \xD7 ${cols.length} cols]`,
    colHeader,
    ...previewRows
  ].join(`
`) + more;
  return { summary, originalSize };
};

// src/handlers/sentry.ts
var MAX_FRAMES = 8;
function formatFrame(frame) {
  const location = [frame.filename, frame.lineno ? `:${frame.lineno}` : ""].join("");
  const fn = frame.function ?? "<anonymous>";
  return `  ${location} in ${fn}`;
}
function summariseSentryEvent(event) {
  const parts = [];
  const exceptionObj = event["exception"];
  const values = exceptionObj?.["values"];
  const firstException = values?.[0];
  if (firstException) {
    const type = firstException.type ?? "Error";
    const msg = firstException.value ?? "(no message)";
    parts.push(`${type}: ${msg}`);
  }
  const meta = [];
  if (typeof event["level"] === "string")
    meta.push(`[${event["level"]}]`);
  if (typeof event["environment"] === "string")
    meta.push(`env:${event["environment"]}`);
  if (typeof event["release"] === "string")
    meta.push(`release:${event["release"]}`);
  if (typeof event["event_id"] === "string")
    meta.push(`id:${event["event_id"].slice(0, 8)}`);
  if (meta.length > 0)
    parts.push(meta.join(" "));
  const frames = firstException?.stacktrace?.frames;
  if (frames && frames.length > 0) {
    const relevant = frames.slice(-MAX_FRAMES);
    const skipped = frames.length - relevant.length;
    const header = skipped > 0 ? `Stack (last ${relevant.length} of ${frames.length} frames):` : `Stack (${frames.length} frame${frames.length === 1 ? "" : "s"}):`;
    parts.push(header);
    parts.push(...relevant.map(formatFrame));
  }
  return parts.join(`
`);
}
var sentryHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, 500).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  if (Array.isArray(parsed)) {
    const events = parsed;
    const lines = events.slice(0, 5).map((e) => typeof e === "object" && e !== null ? summariseSentryEvent(e) : String(e));
    const more = events.length > 5 ? `
\u2026and ${events.length - 5} more` : "";
    return { summary: lines.join(`
---
`) + more, originalSize };
  }
  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summariseSentryEvent(parsed), originalSize };
  }
  return { summary: String(parsed), originalSize };
};

// src/handlers/stripe.ts
var ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "gnf",
  "isk",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "xaf",
  "xof",
  "xpf"
]);
function formatAmount(amount, currency) {
  if (typeof amount !== "number")
    return "";
  const curr = typeof currency === "string" ? currency.toLowerCase() : "usd";
  const value = ZERO_DECIMAL.has(curr) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: curr.toUpperCase(),
      minimumFractionDigits: ZERO_DECIMAL.has(curr) ? 0 : 2
    }).format(value);
  } catch {
    return `${curr.toUpperCase()} ${value.toFixed(ZERO_DECIMAL.has(curr) ? 0 : 2)}`;
  }
}
function summariseCustomer(item) {
  const parts = [];
  if (typeof item["id"] === "string")
    parts.push(item["id"]);
  if (typeof item["name"] === "string" && item["name"])
    parts.push(`"${item["name"]}"`);
  if (typeof item["email"] === "string")
    parts.push(item["email"]);
  if (typeof item["phone"] === "string" && item["phone"])
    parts.push(item["phone"]);
  if (item["delinquent"] === true)
    parts.push("[delinquent]");
  return parts.join(" \xB7 ");
}
function summariseInvoice(item) {
  const parts = [];
  if (typeof item["id"] === "string")
    parts.push(item["id"]);
  if (typeof item["status"] === "string")
    parts.push(`[${item["status"]}]`);
  const amountDue = item["amount_due"];
  const amountPaid = item["amount_paid"];
  const curr = item["currency"];
  if (typeof amountDue === "number")
    parts.push(`due: ${formatAmount(amountDue, curr)}`);
  if (typeof amountPaid === "number" && amountPaid > 0)
    parts.push(`paid: ${formatAmount(amountPaid, curr)}`);
  const name = item["customer_name"] ?? item["customer_email"];
  if (typeof name === "string" && name)
    parts.push(name);
  if (typeof item["billing_reason"] === "string")
    parts.push(`reason: ${item["billing_reason"]}`);
  return parts.join(" \xB7 ");
}
function summarisePaymentIntent(item) {
  const parts = [];
  if (typeof item["id"] === "string")
    parts.push(item["id"]);
  parts.push(formatAmount(item["amount"], item["currency"]));
  if (typeof item["status"] === "string")
    parts.push(`[${item["status"]}]`);
  if (typeof item["customer"] === "string" && item["customer"])
    parts.push(`customer: ${item["customer"]}`);
  if (typeof item["description"] === "string" && item["description"]) {
    parts.push(item["description"].slice(0, 100));
  }
  return parts.filter(Boolean).join(" \xB7 ");
}
function summariseSubscription(item) {
  const parts = [];
  if (typeof item["id"] === "string")
    parts.push(item["id"]);
  if (typeof item["status"] === "string")
    parts.push(`[${item["status"]}]`);
  const plan = item["plan"];
  if (plan) {
    if (typeof plan["id"] === "string")
      parts.push(`plan: ${plan["id"]}`);
    const planAmount = formatAmount(plan["amount"], plan["currency"] ?? item["currency"]);
    if (planAmount)
      parts.push(planAmount);
  }
  if (typeof item["customer"] === "string")
    parts.push(`customer: ${item["customer"]}`);
  if (item["cancel_at_period_end"] === true)
    parts.push("cancels at period end");
  return parts.join(" \xB7 ");
}
function summariseProduct(item) {
  const parts = [];
  if (typeof item["id"] === "string")
    parts.push(item["id"]);
  if (typeof item["name"] === "string")
    parts.push(`"${item["name"]}"`);
  if (item["active"] === false)
    parts.push("[inactive]");
  if (typeof item["description"] === "string" && item["description"]) {
    parts.push(item["description"].slice(0, 100));
  }
  return parts.join(" \xB7 ");
}
function summarisePrice(item) {
  const parts = [];
  if (typeof item["id"] === "string")
    parts.push(item["id"]);
  const amount = formatAmount(item["unit_amount"], item["currency"]);
  if (amount)
    parts.push(amount);
  const recurring = item["recurring"];
  if (recurring) {
    const count = recurring["interval_count"];
    const interval = recurring["interval"];
    parts.push(count && count !== 1 ? `every ${count} ${interval}s` : `per ${interval}`);
  }
  if (typeof item["product"] === "string")
    parts.push(`product: ${item["product"]}`);
  return parts.join(" \xB7 ");
}
function summariseDispute(item) {
  const parts = [];
  if (typeof item["id"] === "string")
    parts.push(item["id"]);
  const amount = formatAmount(item["amount"], item["currency"]);
  if (amount)
    parts.push(amount);
  if (typeof item["status"] === "string")
    parts.push(`[${item["status"]}]`);
  if (typeof item["reason"] === "string")
    parts.push(`reason: ${item["reason"]}`);
  if (typeof item["charge"] === "string")
    parts.push(`charge: ${item["charge"]}`);
  return parts.join(" \xB7 ");
}
function summariseBalance(obj) {
  const lines = [];
  const available = obj["available"];
  const pending = obj["pending"];
  for (const b of available ?? [])
    lines.push(`available: ${formatAmount(b.amount, b.currency)}`);
  for (const b of pending ?? []) {
    if (b.amount !== 0)
      lines.push(`pending: ${formatAmount(b.amount, b.currency)}`);
  }
  return lines.join(" \xB7 ") || "Balance: $0.00";
}
function summariseAccount(obj) {
  const parts = [];
  if (typeof obj["id"] === "string")
    parts.push(obj["id"]);
  if (typeof obj["display_name"] === "string")
    parts.push(`"${obj["display_name"]}"`);
  if (typeof obj["email"] === "string")
    parts.push(obj["email"]);
  if (typeof obj["country"] === "string")
    parts.push(obj["country"]);
  return parts.join(" \xB7 ");
}
function summarisePaymentLink(obj) {
  const parts = [];
  if (typeof obj["id"] === "string")
    parts.push(obj["id"]);
  if (typeof obj["url"] === "string")
    parts.push(obj["url"]);
  if (obj["active"] === false)
    parts.push("[inactive]");
  return parts.join(" \xB7 ");
}
function summariseByObjectType(item) {
  switch (item["object"]) {
    case "customer":
      return summariseCustomer(item);
    case "invoice":
      return summariseInvoice(item);
    case "payment_intent":
      return summarisePaymentIntent(item);
    case "subscription":
      return summariseSubscription(item);
    case "product":
      return summariseProduct(item);
    case "price":
      return summarisePrice(item);
    case "dispute":
      return summariseDispute(item);
    case "payment_link":
      return summarisePaymentLink(item);
    default: {
      const parts = [];
      if (typeof item["id"] === "string")
        parts.push(item["id"]);
      if (typeof item["object"] === "string")
        parts.push(`[${item["object"]}]`);
      if (typeof item["status"] === "string")
        parts.push(`[${item["status"]}]`);
      return parts.join(" \xB7 ");
    }
  }
}
function pickSummariser(suffix) {
  if (suffix.includes("customer"))
    return summariseCustomer;
  if (suffix.includes("invoice"))
    return summariseInvoice;
  if (suffix.includes("payment_intent"))
    return summarisePaymentIntent;
  if (suffix.includes("subscription"))
    return summariseSubscription;
  if (suffix.includes("product"))
    return summariseProduct;
  if (suffix.includes("price"))
    return summarisePrice;
  if (suffix.includes("dispute"))
    return summariseDispute;
  if (suffix.includes("payment_link"))
    return summarisePaymentLink;
  return summariseByObjectType;
}
var MAX_ITEMS = 10;
function summariseList(items, summarise) {
  const lines = items.slice(0, MAX_ITEMS).map((item) => typeof item === "object" && item !== null ? summarise(item) : String(item));
  const overflow = items.length > MAX_ITEMS ? `
\u2026and ${items.length - MAX_ITEMS} more` : "";
  return lines.join(`
`) + overflow;
}
var stripeHandler = (toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const suffix = toolName.split("__").pop() ?? "";
  if (suffix === "retrieve_balance") {
    let parsed2;
    try {
      parsed2 = JSON.parse(raw);
    } catch {
      return { summary: raw.slice(0, 500), originalSize };
    }
    return { summary: summariseBalance(parsed2), originalSize };
  }
  if (suffix === "get_stripe_account_info") {
    let parsed2;
    try {
      parsed2 = JSON.parse(raw);
    } catch {
      return { summary: raw.slice(0, 500), originalSize };
    }
    return { summary: summariseAccount(parsed2), originalSize };
  }
  if (suffix === "search_stripe_documentation") {
    return { summary: raw.slice(0, 500).trimEnd(), originalSize };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, 500).trimEnd(), originalSize };
  }
  const summarise = pickSummariser(suffix);
  if (typeof parsed === "object" && parsed !== null && Array.isArray(parsed["data"])) {
    const items = parsed["data"];
    if (items.length === 0)
      return { summary: "No items.", originalSize };
    return { summary: summariseList(items, summarise), originalSize };
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0)
      return { summary: "No items.", originalSize };
    return { summary: summariseList(parsed, summarise), originalSize };
  }
  if (typeof parsed === "object" && parsed !== null) {
    return { summary: summarise(parsed), originalSize };
  }
  return { summary: String(parsed), originalSize };
};

// src/handlers/csv.ts
var MAX_PREVIEW_ROWS2 = 5;
function splitCsvRow(row) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (const char of row) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}
var csvHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const lines = raw.split(`
`).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { summary: "(empty CSV)", originalSize };
  }
  const headerCols = splitCsvRow(lines[0]);
  const dataRows = lines.slice(1);
  const totalRows = dataRows.length;
  const previewLines = dataRows.slice(0, MAX_PREVIEW_ROWS2).map((line, i) => {
    const vals = splitCsvRow(line);
    const pairs = headerCols.slice(0, 5).map((col, ci) => `${col}=${vals[ci] ?? ""}`).join(", ");
    const overflow = headerCols.length > 5 ? ` [+${headerCols.length - 5} cols]` : "";
    return `  row ${i + 1}: ${pairs}${overflow}`;
  });
  const more = totalRows > MAX_PREVIEW_ROWS2 ? `
[\u2026${totalRows - MAX_PREVIEW_ROWS2} more rows]` : "";
  const summary = [
    `[${totalRows} rows \xD7 ${headerCols.length} cols]`,
    `headers: ${headerCols.slice(0, 10).join(", ")}${headerCols.length > 10 ? ` [+${headerCols.length - 10} more]` : ""}`,
    ...previewLines
  ].join(`
`) + more;
  return { summary, originalSize };
};
function looksLikeCsv(text) {
  const lines = text.split(`
`).filter((l) => l.trim().length > 0);
  if (lines.length < 3)
    return false;
  const firstLineCommas = (lines[0].match(/,/g) ?? []).length;
  return firstLineCommas >= 2;
}

// src/handlers/generic.ts
var MAX_CHARS = 500;
var genericHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const excerpt = raw.slice(0, MAX_CHARS).trimEnd();
  const truncated = raw.length > MAX_CHARS;
  const summary = truncated ? `${excerpt}
\u2026` : excerpt;
  return { summary, originalSize };
};

// src/profiles/loader.ts
import { readdirSync, readFileSync as readFileSync2, statSync } from "fs";
import { join as join3 } from "path";
import { homedir as homedir3 } from "os";
function getUserProfilesDir() {
  return process.env.RECALL_USER_PROFILES_PATH ?? join3(homedir3(), ".config", "mcp-recall", "profiles");
}
function getCommunityProfilesDir() {
  return process.env.RECALL_COMMUNITY_PROFILES_PATH ?? join3(homedir3(), ".local", "share", "mcp-recall", "profiles", "community");
}
function getBundledProfilesDir() {
  if (process.env.RECALL_BUNDLED_PROFILES_PATH) {
    return process.env.RECALL_BUNDLED_PROFILES_PATH;
  }
  const devPath = join3(import.meta.dir, "../../profiles");
  const distPath = join3(import.meta.dir, "../profiles");
  try {
    statSync(devPath);
    return devPath;
  } catch {
    return distPath;
  }
}
var fileCache = new Map;
function loadSpec(filePath) {
  let mtime;
  try {
    mtime = statSync(filePath).mtimeMs;
  } catch {
    fileCache.delete(filePath);
    return null;
  }
  const cached2 = fileCache.get(filePath);
  if (cached2 && cached2.mtime === mtime)
    return cached2.spec;
  let raw;
  try {
    raw = readFileSync2(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = parse(raw);
  } catch (e) {
    dbg(`profile parse error \xB7 ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  const spec = validateSpec(parsed, filePath);
  if (!spec)
    return null;
  fileCache.set(filePath, { mtime, spec });
  return spec;
}
var VALID_TYPES = new Set(["json_extract", "json_truncate", "text_truncate"]);
function validateSpec(raw, filePath) {
  if (typeof raw !== "object" || raw === null)
    return null;
  const obj = raw;
  const profile = obj["profile"];
  const strategy = obj["strategy"];
  if (!profile || !strategy) {
    dbg(`profile skip \xB7 missing [profile] or [strategy] \xB7 ${filePath}`);
    return null;
  }
  if (typeof profile["id"] !== "string" || typeof profile["version"] !== "string" || typeof profile["description"] !== "string" || typeof profile["mcp_pattern"] !== "string" && !Array.isArray(profile["mcp_pattern"])) {
    dbg(`profile skip \xB7 missing required fields \xB7 ${filePath}`);
    return null;
  }
  const type = strategy["type"];
  if (!VALID_TYPES.has(type)) {
    dbg(`profile skip \xB7 unknown strategy.type "${type}" \xB7 ${filePath}`);
    return null;
  }
  if (type === "json_extract") {
    const fields = strategy["fields"];
    if (!Array.isArray(fields) || fields.length === 0) {
      dbg(`profile skip \xB7 json_extract missing fields \xB7 ${filePath}`);
      return null;
    }
  }
  const numericCeilings = [
    ["max_depth", 20],
    ["max_items", 1000],
    ["max_array_items", 1000],
    ["max_chars", 1e6],
    ["max_chars_per_field", 1e5],
    ["fallback_chars", 1e5]
  ];
  for (const [field, ceiling] of numericCeilings) {
    const val = strategy[field];
    if (val !== undefined && typeof val === "number" && val > ceiling) {
      dbg(`profile skip \xB7 ${field} exceeds maximum allowed value of ${ceiling} \xB7 ${filePath}`);
      return null;
    }
  }
  return raw;
}
function scanDir(dir, tier) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    const full = join3(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...scanDir(full, tier));
    } else if (entry.endsWith(".toml")) {
      const spec = loadSpec(full);
      if (!spec)
        continue;
      const raw = spec.profile.mcp_pattern;
      const patterns = Array.isArray(raw) ? raw : [raw];
      results.push({ spec, tier, patterns, filePath: full });
    }
  }
  return results;
}
function loadProfiles() {
  return [
    ...scanDir(getUserProfilesDir(), "user"),
    ...scanDir(getCommunityProfilesDir(), "community"),
    ...scanDir(getBundledProfilesDir(), "bundled")
  ];
}
function clearProfileCache() {
  fileCache.clear();
}
function getShortName(spec) {
  return spec.profile.short_name ?? spec.profile.id.replace(/^mcp__/, "");
}

// src/profiles/strategies.ts
function resolvePath(obj, path) {
  if (path === "" || path === ".")
    return obj;
  return path.split(".").reduce((cur, key) => {
    if (cur === null || cur === undefined || typeof cur !== "object")
      return;
    return cur[key];
  }, obj);
}
function getLabel(fieldPath, labels) {
  if (labels?.[fieldPath])
    return labels[fieldPath];
  const parts = fieldPath.split(".");
  return parts[parts.length - 1] ?? fieldPath;
}
function fieldValue(obj, fieldPath, maxChars) {
  const val = resolvePath(obj, fieldPath);
  if (val === undefined || val === null)
    return "";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return str.length > maxChars ? str.slice(0, maxChars) + "\u2026" : str;
}
function resolveItems(parsed, itemsPaths) {
  const pathsToTry = itemsPaths.length > 0 ? itemsPaths : [""];
  for (const path of pathsToTry) {
    const val = resolvePath(parsed, path);
    if (Array.isArray(val))
      return val;
    if (val !== null && val !== undefined && typeof val === "object")
      return [val];
  }
  if (Array.isArray(parsed))
    return parsed;
  if (parsed !== null && typeof parsed === "object")
    return [parsed];
  return null;
}
function applyJsonExtract(strategy, _toolName, output) {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const fallbackChars = strategy.fallback_chars ?? 500;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: raw.slice(0, fallbackChars), originalSize };
  }
  const items = resolveItems(parsed, strategy.items_path ?? []);
  if (!items || items.length === 0) {
    return { summary: raw.slice(0, fallbackChars), originalSize };
  }
  const fields = strategy.fields ?? [];
  const maxItems = strategy.max_items ?? 10;
  const maxCharsPerField = strategy.max_chars_per_field ?? 200;
  const labels = strategy.labels;
  const count = items.length;
  const lines = items.slice(0, maxItems).map((item, i) => {
    const parts = fields.map((f) => {
      const val = fieldValue(item, f, maxCharsPerField);
      return val ? `${getLabel(f, labels)}: ${val}` : null;
    }).filter(Boolean);
    return `${i + 1}. ${parts.join(" \xB7 ")}`;
  });
  const more = count > maxItems ? `
\u2026and ${count - maxItems} more` : "";
  const summary = `${count} item${count === 1 ? "" : "s"}:
${lines.join(`
`)}${more}`;
  return { summary, originalSize };
}
function truncateJson(value, depth, maxDepth, maxArrayItems) {
  if (depth > maxDepth)
    return "\u2026";
  if (Array.isArray(value)) {
    const items = value.slice(0, maxArrayItems).map((v) => truncateJson(v, depth + 1, maxDepth, maxArrayItems));
    if (value.length > maxArrayItems)
      items.push(`\u2026${value.length - maxArrayItems} more`);
    return items;
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = truncateJson(v, depth + 1, maxDepth, maxArrayItems);
    }
    return result;
  }
  return value;
}
function applyJsonTruncate(strategy, _toolName, output) {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const fallbackChars = strategy.fallback_chars ?? 500;
  const maxDepth = strategy.max_depth ?? 3;
  const maxArrayItems = strategy.max_array_items ?? 3;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const excerpt = raw.slice(0, fallbackChars).trimEnd();
    return {
      summary: excerpt.length < raw.length ? `${excerpt}
\u2026` : excerpt,
      originalSize
    };
  }
  const truncated = truncateJson(parsed, 0, maxDepth, maxArrayItems);
  return { summary: JSON.stringify(truncated, null, 2), originalSize };
}
function applyTextTruncate(strategy, _toolName, output) {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const maxChars = strategy.max_chars ?? 500;
  const excerpt = raw.slice(0, maxChars).trimEnd();
  return {
    summary: raw.length > maxChars ? `${excerpt}
\u2026` : excerpt,
    originalSize
  };
}

// src/profiles/index.ts
function matchesPattern2(toolName, pattern) {
  if (pattern.endsWith("*"))
    return toolName.startsWith(pattern.slice(0, -1));
  return toolName === pattern;
}
function patternSpecificity(pattern) {
  return pattern.endsWith("*") ? pattern.length - 1 : Infinity;
}
function profileSpecificity(profile, toolName) {
  return Math.max(...profile.patterns.filter((p) => matchesPattern2(toolName, p)).map(patternSpecificity));
}
var TIER_ORDER = ["user", "community", "bundled"];
function resolveProfile(toolName, profiles, tiers = TIER_ORDER) {
  const candidates = profiles.filter((p) => tiers.includes(p.tier) && p.patterns.some((pat) => matchesPattern2(toolName, pat)));
  if (candidates.length === 0)
    return null;
  return candidates.reduce((best, cur) => {
    const bestTierIdx = TIER_ORDER.indexOf(best.tier);
    const curTierIdx = TIER_ORDER.indexOf(cur.tier);
    if (curTierIdx !== bestTierIdx)
      return curTierIdx < bestTierIdx ? cur : best;
    const bestScore = profileSpecificity(best, toolName);
    const curScore = profileSpecificity(cur, toolName);
    return curScore > bestScore ? cur : best;
  });
}
function makeHandler(profile) {
  const { spec } = profile;
  const handlerName = `profile:${spec.profile.id}`;
  const handler = function profileHandler(toolName, output) {
    const { strategy } = spec;
    switch (strategy.type) {
      case "json_extract":
        return applyJsonExtract(strategy, toolName, output);
      case "json_truncate":
        return applyJsonTruncate(strategy, toolName, output);
      case "text_truncate":
        return applyTextTruncate(strategy, toolName, output);
    }
  };
  Object.defineProperty(handler, "name", { value: handlerName });
  return handler;
}
function getProfileHandler(toolName, tiers = TIER_ORDER) {
  const profiles = loadProfiles();
  const match = resolveProfile(toolName, profiles, tiers);
  if (!match)
    return null;
  dbg(`profile match \xB7 ${match.spec.profile.id} (${match.tier}) \xB7 ${toolName}`);
  return makeHandler(match);
}

// src/handlers/index.ts
function getHandler(toolName, output, input) {
  if (toolName === "Bash") {
    return getBashHandler(input);
  }
  const highPriorityProfile = getProfileHandler(toolName, ["user", "community"]);
  if (highPriorityProfile)
    return highPriorityProfile;
  if (toolName.includes("playwright") && toolName.includes("snapshot")) {
    return playwrightHandler;
  }
  if (toolName.startsWith("mcp__github__")) {
    return githubHandler;
  }
  if (toolName.startsWith("mcp__gitlab__")) {
    return gitlabHandler;
  }
  if (toolName.startsWith("mcp__stripe__")) {
    return stripeHandler;
  }
  if (toolName.startsWith("mcp__filesystem__") || toolName.includes("read_file") || toolName.includes("get_file")) {
    return filesystemHandler;
  }
  if (toolName.includes("bash") || toolName.includes("shell") || toolName.includes("terminal") || toolName.includes("run_command") || toolName.includes("ssh_exec") || toolName.includes("exec_command") || toolName.includes("remote_exec") || toolName.includes("container_exec")) {
    return shellHandler;
  }
  if (toolName.includes("linear")) {
    return linearHandler;
  }
  if (toolName.includes("slack")) {
    return slackHandler;
  }
  if (toolName.includes("tavily")) {
    return tavilyHandler;
  }
  if (toolName.includes("postgres") || toolName.includes("mysql") || toolName.includes("sqlite") || toolName.includes("database")) {
    return databaseHandler;
  }
  if (toolName.includes("sentry")) {
    return sentryHandler;
  }
  if (toolName.includes("csv")) {
    return csvHandler;
  }
  const bundledProfile = getProfileHandler(toolName, ["bundled"]);
  if (bundledProfile)
    return bundledProfile;
  const text = extractText(output);
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return jsonHandler;
  }
  if (looksLikeCsv(text)) {
    return csvHandler;
  }
  return genericHandler;
}

// src/hooks/post-tool-use.ts
function handlePostToolUse(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(`[mcp-recall] error: post-tool-use received invalid JSON \u2014 skipping
`);
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    process.stderr.write(`[mcp-recall] error: post-tool-use received unexpected input shape \u2014 skipping
`);
    return {};
  }
  const input = parsed;
  const { tool_name, tool_input, tool_response, cwd, session_id } = input;
  const config = loadConfig();
  if (isDenied(tool_name, config)) {
    dbg(`SKIP denylist \xB7 ${tool_name}`);
    return {};
  }
  const fullContent = extractText(tool_response);
  dbg(`intercepted ${tool_name} \xB7 ${formatBytes(Buffer.byteLength(fullContent, "utf8"))}`);
  const secretNames = findSecrets(fullContent);
  if (secretNames.length > 0) {
    process.stderr.write(`[recall] skipped ${tool_name}: detected ${secretNames.join(", ")}
`);
    return {};
  }
  const projectKey = getProjectKey(cwd);
  const db = getDb(defaultDbPath(projectKey));
  const input_hash = tool_input !== undefined ? createHash2("sha256").update(tool_name + JSON.stringify(tool_input)).digest("hex") : null;
  if (input_hash) {
    const cached2 = checkDedup(db, projectKey, input_hash);
    if (cached2) {
      const cachedDate = new Date(cached2.created_at * 1000).toISOString().slice(0, 10);
      dbg(`CACHE HIT \xB7 ${tool_name} \xB7 id=${cached2.id} \xB7 cached ${cachedDate}`);
      const header2 = `[recall:${cached2.id} \xB7 cached \xB7 ${cachedDate}]`;
      return {
        updatedMCPToolOutput: `${header2}
${cached2.summary}`,
        suppressOutput: true
      };
    }
  }
  const handler = getHandler(tool_name, tool_response, tool_input);
  dbg(`handler: ${handler.name} \xB7 ${tool_name}`);
  const { summary, originalSize } = handler(tool_name, tool_response);
  const summarySize = Buffer.byteLength(summary, "utf8");
  if (summarySize >= originalSize) {
    dbg(`SKIP no-compression \xB7 ${tool_name} \xB7 ${formatBytes(summarySize)} \u2265 ${formatBytes(originalSize)}`);
    return {};
  }
  const stored = storeOutput(db, {
    project_key: projectKey,
    session_id,
    tool_name,
    summary,
    full_content: fullContent,
    original_size: originalSize,
    input_hash: input_hash ?? undefined
  });
  evictIfNeeded(db, projectKey, config.store.max_size_mb);
  const reduction = ((1 - summarySize / originalSize) * 100).toFixed(0);
  dbg(`STORED \xB7 ${tool_name} \xB7 id=${stored.id} \xB7 ${formatBytes(originalSize)}\u2192${formatBytes(summarySize)} (${reduction}% reduction)`);
  const header = `[recall:${stored.id} \xB7 ${formatBytes(originalSize)}\u2192${formatBytes(summarySize)} (${reduction}% reduction)]`;
  return {
    updatedMCPToolOutput: `${header}
${summary}`,
    suppressOutput: true
  };
}

// src/profiles/commands.ts
import { readFileSync as readFileSync4, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, rmSync, unlinkSync } from "fs";
import { join as join4 } from "path";
import { homedir as homedir4, tmpdir } from "os";
import { createHash as createHash3 } from "crypto";

// src/learn/retrain.ts
import { readFileSync as readFileSync3, writeFileSync } from "fs";
var MIN_SAMPLES = 3;
var MAX_SAMPLES = 5;
var DEFAULT_DEPTH = 3;
var MIN_FIELD_PCT = 0.5;
var ALL_TIERS = ["user", "community", "bundled"];
function detectItemsPath(parsed) {
  if (Array.isArray(parsed))
    return { path: "", items: parsed };
  if (parsed === null || typeof parsed !== "object")
    return null;
  const obj = parsed;
  let best = null;
  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val) && val.length > (best?.score ?? 0)) {
      best = { path: key, items: val, score: val.length };
    }
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      for (const [key2, val2] of Object.entries(val)) {
        if (Array.isArray(val2) && val2.length > (best?.score ?? 0)) {
          best = { path: `${key}.${key2}`, items: val2, score: val2.length };
        }
      }
    }
  }
  return best ? { path: best.path, items: best.items } : null;
}
function traverseObject(obj, prefix, depth, maxDepth, paths) {
  if (depth >= maxDepth)
    return;
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined)
      continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      if (val !== "")
        paths.add(path);
    } else if (typeof val === "object" && !Array.isArray(val)) {
      traverseObject(val, path, depth + 1, maxDepth, paths);
    }
  }
}
function collectFieldPaths(items, maxDepth) {
  const counts = new Map;
  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      continue;
    const paths = new Set;
    traverseObject(item, "", 0, maxDepth, paths);
    for (const p of paths)
      counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}
function scoreFields(pathMap, totalItems) {
  if (totalItems === 0)
    return [];
  return Array.from(pathMap.entries()).map(([path, count]) => ({ path, pct: count / totalItems })).filter(({ pct }) => pct >= MIN_FIELD_PCT).sort((a, b) => b.pct - a.pct);
}
function bumpPatch(version) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN))
    return version;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}
function applyRetrainToToml(tomlContent, newFields, date) {
  let result = tomlContent;
  const firstContentIdx = result.search(/^[^\s#]/m);
  const retrainLine = `# Retrained: ${date}
`;
  if (firstContentIdx <= 0) {
    result = retrainLine + result;
  } else {
    result = result.slice(0, firstContentIdx) + retrainLine + result.slice(firstContentIdx);
  }
  if (newFields.length > 0) {
    const openMatch = result.match(/^(\s*fields\s*=\s*\[)/m);
    if (openMatch?.index !== undefined) {
      const afterOpen = openMatch.index + openMatch[0].length;
      const closeIdx = result.indexOf("]", afterOpen);
      if (closeIdx !== -1) {
        const block = result.slice(afterOpen, closeIdx);
        const indentMatch = block.match(/^(\s+)/m);
        const indent = indentMatch ? indentMatch[1] : "  ";
        const newLines = newFields.map((f) => `${indent}"${f}",`).join(`
`);
        result = result.slice(0, closeIdx) + newLines + `
` + result.slice(closeIdx);
      }
    }
  }
  result = result.replace(/^(\s*version\s*=\s*")([^"]+)(")/m, (_, before, ver, after) => `${before}${bumpPatch(ver)}${after}`);
  return result;
}
function retrainProfile(samples, profile, maxDepth) {
  const base = {
    toolName: samples[0]?.tool_name ?? "",
    profileId: profile.spec.profile.id,
    profileTier: profile.tier,
    profileFilePath: profile.filePath,
    strategyType: profile.spec.strategy.type,
    sampleCount: samples.length,
    currentItemsPath: profile.spec.strategy.items_path ?? []
  };
  if (profile.spec.strategy.type !== "json_extract") {
    return { ...base, fields: [], newFields: [], detectedItemsPath: null, itemCount: 0 };
  }
  const currentFields = new Set(profile.spec.strategy.fields ?? []);
  const allItems = [];
  let detectedPath = null;
  let detectedPathCount = 0;
  for (const sample of samples) {
    let parsed;
    try {
      parsed = JSON.parse(sample.full_content);
    } catch {
      continue;
    }
    const detected = detectItemsPath(parsed);
    if (detected) {
      allItems.push(...detected.items);
      if (detected.path === (detectedPath ?? detected.path)) {
        detectedPathCount++;
        detectedPath = detected.path;
      }
    }
  }
  if (allItems.length === 0) {
    return {
      ...base,
      fields: [],
      newFields: [],
      detectedItemsPath: detectedPath,
      itemCount: 0,
      error: "no parseable JSON items found in samples"
    };
  }
  const pathMap = collectFieldPaths(allItems, maxDepth);
  const scored = scoreFields(pathMap, allItems.length);
  const fields = scored.map(({ path, pct }) => ({
    path,
    pct,
    inProfile: currentFields.has(path)
  }));
  const newFields = fields.filter((f) => !f.inProfile).map((f) => f.path);
  return {
    ...base,
    detectedItemsPath: detectedPathCount >= Math.ceil(samples.length / 2) ? detectedPath : null,
    itemCount: allItems.length,
    fields,
    newFields
  };
}
function printResult(result, apply) {
  const header = `${result.toolName} (${result.sampleCount} sample${result.sampleCount === 1 ? "" : "s"} \xB7 ${result.itemCount} item${result.itemCount === 1 ? "" : "s"}):`;
  console.log(`
${header}`);
  if (result.error) {
    console.log(`  \u26A0 ${result.error}`);
    return;
  }
  if (result.strategyType !== "json_extract") {
    console.log(`  Strategy is ${result.strategyType} \u2014 field extraction not applicable.`);
    console.log(`  Tip: if this tool returns structured lists, consider switching to json_extract.`);
    return;
  }
  if (result.detectedItemsPath !== null) {
    const inProfile = result.currentItemsPath.includes(result.detectedItemsPath);
    const status = inProfile ? "\u2713 matches profile" : "\u26A0 not in current profile items_path";
    console.log(`  items_path: "${result.detectedItemsPath}"  ${status}`);
  }
  if (result.fields.length === 0) {
    console.log(`  No fields found at \u226550% frequency.`);
    return;
  }
  console.log(`  Fields (\u226550% frequency):`);
  const colW = Math.min(45, Math.max(...result.fields.map((f) => f.path.length)) + 2);
  for (const f of result.fields) {
    const pctStr = `${(f.pct * 100).toFixed(0)}%`.padStart(4);
    const tag = f.inProfile ? "in profile" : "NEW";
    console.log(`    ${`"${f.path}"`.padEnd(colW)}  ${pctStr}  ${tag}`);
  }
  if (result.newFields.length === 0) {
    console.log(`  \u2713 Profile is up to date.`);
  } else if (!apply) {
    console.log(`  ${result.newFields.length} new field(s) found. Run with --apply to update.`);
  }
}
function applyResult(result, date) {
  if (result.newFields.length === 0)
    return;
  let toml;
  try {
    toml = readFileSync3(result.profileFilePath, "utf8");
  } catch (e) {
    console.log(`  \u2717 Could not read ${result.profileFilePath}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const oldVersion = toml.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "?";
  const updated = applyRetrainToToml(toml, result.newFields, date);
  const newVersion = updated.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "?";
  writeFileSync(result.profileFilePath, updated);
  console.log(`  \u2713 Updated: ${result.profileFilePath} (${oldVersion} \u2192 ${newVersion})`);
}
async function handleRetrainCommand(args) {
  const apply = args.includes("--apply");
  let cliDepth = null;
  for (let i = 0;i < args.length; i++) {
    if (args[i] === "--depth" && args[i + 1]) {
      cliDepth = parseInt(args[i + 1]);
      break;
    }
    if (args[i]?.startsWith("--depth=")) {
      cliDepth = parseInt(args[i].slice("--depth=".length));
      break;
    }
  }
  const targets = args.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const cwd = process.cwd();
  const projectKey = getProjectKey(cwd);
  const db = getDb(defaultDbPath(projectKey));
  const breakdown = getToolBreakdown(db, projectKey).filter((r) => r.items >= MIN_SAMPLES);
  if (breakdown.length === 0) {
    console.log(`No tools with \u2265${MIN_SAMPLES} stored samples. Run some MCP tools first.`);
    return;
  }
  const profiles = loadProfiles();
  const qualifying = breakdown.filter((r) => {
    if (targets.length > 0 && !targets.some((t) => r.tool_name.includes(t)))
      return false;
    return resolveProfile(r.tool_name, profiles, ALL_TIERS) !== null;
  });
  if (qualifying.length === 0) {
    console.log("No profiled tools with enough data found.");
    if (targets.length > 0)
      console.log(`(filter: ${targets.join(", ")})`);
    return;
  }
  console.log(`
Retraining from stored corpus\u2026`);
  const date = new Date().toISOString().slice(0, 10);
  let analyzed = 0;
  let totalNew = 0;
  let applied = 0;
  for (const row of qualifying) {
    const profile = resolveProfile(row.tool_name, profiles, ALL_TIERS);
    const maxDepth = cliDepth ?? profile.spec.retrain?.max_depth ?? DEFAULT_DEPTH;
    const samples = sampleOutputs(db, projectKey, row.tool_name, MAX_SAMPLES);
    const result = retrainProfile(samples, profile, maxDepth);
    printResult(result, apply);
    if (apply && result.newFields.length > 0 && !result.error) {
      applyResult(result, date);
      applied++;
    }
    analyzed++;
    totalNew += result.newFields.length;
  }
  console.log(`
${"\u2500".repeat(54)}`);
  if (apply) {
    console.log(`${analyzed} profile(s) analyzed \xB7 ${totalNew} new field(s) \xB7 ${applied} profile(s) updated.`);
    if (applied > 0)
      clearProfileCache();
  } else {
    console.log(`${analyzed} profile(s) analyzed \xB7 ${totalNew} new field(s) found.`);
    if (totalNew > 0)
      console.log(`Run with --apply to update profiles.`);
  }
}

// src/profiles/commands.ts
var MANIFEST_URL = "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/manifest.json";
var PROFILE_BASE_URL = "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/";
var COMMUNITY_REPO = "sakebomb/mcp-recall-profiles";
var SAFE_ID_RE = /^[a-z0-9_-]+$/;
var SAFE_FILE_RE = /^profiles\/[a-z0-9_-]+\/[a-z0-9_.-]+\.toml$/;
function assertSafeId(id) {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid profile id "${id}": must match /^[a-z0-9_-]+$/ (no path separators or special characters).`);
  }
}
function assertSafeFile(file) {
  if (!SAFE_FILE_RE.test(file)) {
    throw new Error(`Invalid profile file path "${file}": must match profiles/<id>/<name>.toml and contain no path traversal.`);
  }
}
function sanitize(value) {
  return value.replace(/[\x00-\x1F\x7F]|\x9B|\x1B\[[0-9;]*[a-zA-Z]/g, "");
}
function communityDir() {
  return process.env.RECALL_COMMUNITY_PROFILES_PATH ?? join4(homedir4(), ".local", "share", "mcp-recall", "profiles", "community");
}
function userDir() {
  return process.env.RECALL_USER_PROFILES_PATH ?? join4(homedir4(), ".config", "mcp-recall", "profiles");
}
function manifestShortName(e) {
  return e.short_name ?? e.id.replace(/^mcp__/, "");
}
async function fetchProfileContent(filePath) {
  const res = await fetch(`${PROFILE_BASE_URL}${filePath}`);
  if (!res.ok)
    throw new Error(`profile fetch failed (${filePath}): ${res.status}`);
  return res.text();
}
function verifyHash(content, expected, id) {
  if (!expected) {
    return;
  }
  const actual = createHash3("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(`Profile ${id}: hash mismatch (expected ${expected.slice(0, 8)}\u2026, got ${actual.slice(0, 8)}\u2026)`);
  }
}
function verifyManifest(manifestPath, mode) {
  if (mode === "skip")
    return;
  let ghAvailable = false;
  try {
    const probe = Bun.spawnSync(["gh", "--version"], { stderr: "ignore", stdout: "ignore" });
    ghAvailable = probe.exitCode === 0;
  } catch {}
  if (!ghAvailable) {
    process.stderr.write(`[recall] manifest signature verification skipped: gh CLI not found in PATH
`);
    return;
  }
  const result = Bun.spawnSync(["gh", "attestation", "verify", manifestPath, "--repo", COMMUNITY_REPO], { stderr: "pipe", stdout: "ignore" });
  if (result.exitCode !== 0) {
    const errText = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "";
    const msg = `[recall] manifest signature verification failed${errText ? `: ${errText}` : ""}
`;
    if (mode === "error") {
      throw new Error(msg.trim());
    }
    process.stderr.write(msg);
  }
}
async function fetchManifest(skipVerify = false) {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok)
    throw new Error(`manifest fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!skipVerify) {
    const tmpPath = join4(tmpdir(), `mcp-recall-manifest-${process.pid}.json`);
    try {
      writeFileSync2(tmpPath, text, "utf8");
      const config = loadConfig();
      verifyManifest(tmpPath, config.profiles.verify_signature);
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {}
    }
  }
  const data = JSON.parse(text);
  return data.profiles;
}
function saveToCommunityDir(profileId, content) {
  const dir = join4(communityDir(), profileId);
  mkdirSync2(dir, { recursive: true });
  const filePath = join4(dir, "default.toml");
  writeFileSync2(filePath, content);
  return filePath;
}
function installedCommunityMap() {
  const map = new Map;
  let entries;
  try {
    entries = readdirSync2(communityDir());
  } catch {
    return map;
  }
  for (const entry of entries) {
    const toml = join4(communityDir(), entry, "default.toml");
    try {
      const p = parse(readFileSync4(toml, "utf8"));
      const version = p["profile"]["version"];
      map.set(entry, version ?? "0.0.0");
    } catch {}
  }
  return map;
}
function patternsOverlap(a, b) {
  const aExact = !a.endsWith("*");
  const bExact = !b.endsWith("*");
  if (aExact && bExact)
    return a === b;
  if (aExact)
    return a.startsWith(b.slice(0, -1));
  if (bExact)
    return b.startsWith(a.slice(0, -1));
  const aPrefix = a.slice(0, -1);
  const bPrefix = b.slice(0, -1);
  return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
}
async function promptNumber(msg, min, max) {
  for (let attempt = 0;attempt < 3; attempt++) {
    process.stdout.write(msg);
    const line = await new Promise((resolve) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (d) => resolve(String(d).trim()));
    });
    const n = parseInt(line);
    if (!isNaN(n) && n >= min && n <= max)
      return n;
    console.error(`Invalid choice. Enter a number between ${min} and ${max}.`);
  }
  console.error("Too many invalid attempts.");
  process.exit(1);
}
async function resolveManifestEntry(nameOrId, entries) {
  const exact = entries.find((e) => e.id === nameOrId);
  if (exact)
    return exact;
  const matches = entries.filter((e) => manifestShortName(e) === nameOrId);
  if (matches.length === 1)
    return matches[0];
  if (matches.length === 0) {
    console.error(`Profile "${nameOrId}" not found.`);
    console.log(`Run: mcp-recall profiles available`);
    process.exit(1);
  }
  if (!process.stdin.isTTY) {
    const ids = matches.map((e) => e.id).join(", ");
    console.error(`Error: "${nameOrId}" is ambiguous. Matches: ${ids}. Use the full id to disambiguate.`);
    process.exit(1);
  }
  console.log(`
Multiple profiles match "${nameOrId}":`);
  matches.forEach((e, i) => {
    const pattern = Array.isArray(e.mcp_pattern) ? e.mcp_pattern[0] : e.mcp_pattern;
    const name = sanitize(manifestShortName(e)).padEnd(22);
    const pat = (pattern ?? "").padEnd(32);
    console.log(`  ${i + 1}. ${name} ${pat} ${sanitize(e.description).slice(0, 40)}`);
  });
  const choice = await promptNumber(`Pick one (1-${matches.length}): `, 1, matches.length);
  return matches[choice - 1];
}
function cmdList(args) {
  const machineReadable = args.includes("--machine-readable");
  const profiles = loadProfiles();
  if (machineReadable) {
    for (const p of profiles) {
      process.stdout.write(sanitize(getShortName(p.spec)) + `
`);
    }
    return;
  }
  if (profiles.length === 0) {
    console.log("No profiles installed.");
    console.log("Run: mcp-recall profiles seed");
    return;
  }
  const COL = { name: 20, tier: 10, pattern: 26 };
  const header = "Name".padEnd(COL.name) + "  " + "Tier".padEnd(COL.tier) + "  " + "Pattern".padEnd(COL.pattern) + "  Description";
  console.log(`
${header}`);
  console.log("\u2500".repeat(Math.min(header.length, 100)));
  for (const p of profiles) {
    const name = sanitize(getShortName(p.spec)).slice(0, COL.name - 1).padEnd(COL.name);
    const tier = p.tier.padEnd(COL.tier);
    const pattern = (p.patterns[0] ?? "").slice(0, COL.pattern - 1).padEnd(COL.pattern);
    const desc = sanitize(p.spec.profile.description).slice(0, 55);
    console.log(`${name}  ${tier}  ${pattern}  ${desc}`);
  }
  const counts = profiles.reduce((acc, p) => {
    acc[p.tier] = (acc[p.tier] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ");
  console.log(`
${profiles.length} total (${summary})
`);
}
async function cmdInstall(args) {
  const skipVerify = args.includes("--skip-verify");
  const nameOrId = args.find((a) => !a.startsWith("-"));
  if (!nameOrId) {
    console.error("Usage: mcp-recall profiles install <name> [--skip-verify]");
    process.exit(1);
  }
  process.stdout.write("Fetching manifest\u2026 ");
  const entries = await fetchManifest(skipVerify);
  console.log("done");
  const entry = await resolveManifestEntry(nameOrId, entries);
  assertSafeId(entry.id);
  assertSafeFile(entry.file);
  process.stdout.write(`Installing ${sanitize(entry.id)} v${sanitize(entry.version)}\u2026 `);
  const content = await fetchProfileContent(entry.file);
  verifyHash(content, entry.sha256, entry.id);
  const filePath = saveToCommunityDir(entry.id, content);
  clearProfileCache();
  console.log(`done
\u2713 ${filePath}`);
}
async function cmdUpdate(args = []) {
  const skipVerify = args.includes("--skip-verify");
  const installed = installedCommunityMap();
  if (installed.size === 0) {
    console.log("No community profiles installed.");
    return;
  }
  process.stdout.write("Fetching manifest\u2026 ");
  const entries = await fetchManifest(skipVerify);
  console.log(`done
`);
  let updated = 0;
  for (const [id, currentVersion] of installed) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      console.log(`  ${id}: not in registry (skipped)`);
      continue;
    }
    if (entry.version === currentVersion) {
      console.log(`  ${id}: up to date (${currentVersion})`);
      continue;
    }
    assertSafeId(entry.id);
    assertSafeFile(entry.file);
    const content = await fetchProfileContent(entry.file);
    verifyHash(content, entry.sha256, entry.id);
    saveToCommunityDir(id, content);
    console.log(`  \u2713 ${id}: ${currentVersion} \u2192 ${entry.version}`);
    updated++;
  }
  clearProfileCache();
  console.log(`
${updated} profile(s) updated.`);
}
function cmdRemove(args) {
  const nameOrId = args[0];
  if (!nameOrId) {
    console.error("Usage: mcp-recall profiles remove <name>");
    process.exit(1);
  }
  const allInstalled = loadProfiles();
  const target = allInstalled.find((p) => p.spec.profile.id === nameOrId) ?? allInstalled.find((p) => getShortName(p.spec) === nameOrId);
  if (!target) {
    console.error(`"${nameOrId}" is not installed.`);
    process.exit(1);
  }
  if (target.tier !== "community") {
    console.error(`"${nameOrId}" is a ${target.tier} profile and cannot be removed via this command.`);
    process.exit(1);
  }
  const id = target.spec.profile.id;
  assertSafeId(id);
  rmSync(join4(communityDir(), id), { recursive: true });
  clearProfileCache();
  console.log(`\u2713 Removed ${id}`);
}
async function cmdSeed(args) {
  const all = args.includes("--all");
  const skipVerify = args.includes("--skip-verify");
  process.stdout.write("Fetching manifest\u2026 ");
  const entries = await fetchManifest(skipVerify);
  console.log(`done
`);
  const installed = installedCommunityMap();
  let installCount = 0;
  let alreadyCount = 0;
  if (all) {
    for (const entry of entries) {
      if (installed.has(entry.id)) {
        console.log(`    ${entry.id}: already installed`);
        alreadyCount++;
        continue;
      }
      assertSafeId(entry.id);
      assertSafeFile(entry.file);
      const content = await fetchProfileContent(entry.file);
      verifyHash(content, entry.sha256, entry.id);
      saveToCommunityDir(entry.id, content);
      console.log(`  \u2713 ${entry.id} installed`);
      installCount++;
    }
    clearProfileCache();
    console.log(`
${installCount} profile(s) installed (${alreadyCount} already installed, ${entries.length} total available)`);
    return;
  }
  let serverKeys = [];
  try {
    const raw = JSON.parse(readFileSync4(join4(homedir4(), ".claude.json"), "utf8"));
    const mcpServers = raw["mcpServers"];
    serverKeys = Object.keys(mcpServers ?? {}).filter((k) => k !== "recall");
  } catch {
    console.log("Could not read ~/.claude.json \u2014 no MCPs detected.");
    return;
  }
  if (serverKeys.length === 0) {
    console.log("No MCP servers found in ~/.claude.json (other than recall).");
    return;
  }
  console.log(`Detected MCPs: ${serverKeys.join(", ")}`);
  for (const key of serverKeys) {
    const prefix = `mcp__${key.replace(/-/g, "_")}__`;
    const matches = entries.filter((e) => {
      const patterns = Array.isArray(e.mcp_pattern) ? e.mcp_pattern : [e.mcp_pattern];
      return patterns.some((pat) => {
        const stripped = pat.endsWith("*") ? pat.slice(0, -1) : pat;
        return stripped === prefix || prefix.startsWith(stripped);
      });
    });
    if (matches.length === 0) {
      console.log(`  ${key}: no community profile available`);
      continue;
    }
    for (const entry of matches) {
      if (installed.has(entry.id)) {
        console.log(`  ${entry.id}: already installed`);
        alreadyCount++;
        continue;
      }
      assertSafeId(entry.id);
      assertSafeFile(entry.file);
      const content = await fetchProfileContent(entry.file);
      verifyHash(content, entry.sha256, entry.id);
      saveToCommunityDir(entry.id, content);
      console.log(`  \u2713 ${entry.id} installed (matched ${key})`);
      installCount++;
    }
  }
  clearProfileCache();
  console.log(`
${installCount} profile(s) installed.`);
}
function cmdFeed(args) {
  const profilePath = args[0];
  if (!profilePath) {
    const dir = userDir();
    const files = [];
    try {
      for (const entry of readdirSync2(dir)) {
        if (entry.endsWith(".toml"))
          files.push(join4(dir, entry));
      }
    } catch {}
    console.log("Usage: mcp-recall profiles feed <path-to-profile.toml>");
    if (files.length > 0) {
      console.log(`
Your local profiles:`);
      for (const f of files)
        console.log(`  ${f}`);
    }
    return;
  }
  let content;
  try {
    content = readFileSync4(profilePath, "utf8");
  } catch {
    console.error(`Cannot read: ${profilePath}`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = parse(content);
  } catch (e) {
    console.error(`Invalid TOML: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const meta = parsed["profile"];
  if (!meta?.["id"] || !meta?.["version"] || !meta?.["mcp_pattern"]) {
    console.error("Profile missing required fields (id, version, mcp_pattern).");
    process.exit(1);
  }
  const id = meta["id"];
  const patterns = Array.isArray(meta["mcp_pattern"]) ? meta["mcp_pattern"].join(", ") : meta["mcp_pattern"];
  console.log(`
Profile: ${id} (v${meta["version"]})`);
  console.log(`Pattern: ${patterns}`);
  console.log(`
To submit to the community repo:`);
  console.log(`  1. Fork https://github.com/${COMMUNITY_REPO}`);
  console.log(`  2. Add your file as: profiles/${id}/default.toml`);
  console.log(`  3. gh pr create --repo ${COMMUNITY_REPO} --title "feat: ${id} profile" --body "..."`);
  const cmds = [
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
    ["pbcopy", []]
  ];
  for (const [bin, cargs] of cmds) {
    try {
      const proc = Bun.spawnSync([bin, ...cargs], {
        stdin: new TextEncoder().encode(content)
      });
      if (proc.exitCode === 0) {
        console.log(`
\u2713 Profile content copied to clipboard.`);
        return;
      }
    } catch {}
  }
  console.log(`
Profile content (copy manually):

${sanitize(content)}`);
}
function cmdCheck() {
  const profiles = loadProfiles();
  if (profiles.length === 0) {
    console.log("No profiles installed.");
    return;
  }
  const conflicts = [];
  for (let i = 0;i < profiles.length; i++) {
    for (let j = i + 1;j < profiles.length; j++) {
      const a = profiles[i];
      const b = profiles[j];
      if (a.tier !== b.tier)
        continue;
      for (const patA of a.patterns) {
        for (const patB of b.patterns) {
          if (patternsOverlap(patA, patB)) {
            conflicts.push({ a, b, patA, patB });
          }
        }
      }
    }
  }
  if (conflicts.length === 0) {
    console.log(`\u2713 No conflicts across ${profiles.length} profile(s).`);
    return;
  }
  console.log(`
${conflicts.length} conflict(s):
`);
  for (const { a, b, patA, patB } of conflicts) {
    console.log(`  [${a.tier}] ${a.spec.profile.id} (${patA})`);
    console.log(`  [${b.tier}] ${b.spec.profile.id} (${patB})`);
    console.log(`  \u2192 resolved by specificity (exact > wildcard, longer prefix > shorter)
`);
  }
}
function testProfile(toolName, content) {
  const profiles = loadProfiles();
  const matchedProfile = resolveProfile(toolName, profiles);
  const handler = getHandler(toolName, content);
  const { summary, originalSize } = handler(toolName, content);
  const outputBytes = Buffer.byteLength(summary, "utf8");
  const reductionPct2 = originalSize > 0 ? Math.round((1 - outputBytes / originalSize) * 100) : 0;
  return { toolName, matchedProfile, handlerName: handler.name, inputBytes: originalSize, outputBytes, reductionPct: reductionPct2, summary };
}
function cmdTest(args) {
  let toolName;
  let storedId;
  let inputFile;
  for (let i = 0;i < args.length; i++) {
    if (args[i] === "--stored" && args[i + 1]) {
      storedId = args[++i];
    } else if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[++i];
    } else if (!args[i].startsWith("-")) {
      toolName = args[i];
    }
  }
  if (!toolName) {
    console.error("Usage: mcp-recall profiles test <tool_name> [--stored <id>] [--input <file>]");
    console.error(`
Examples:`);
    console.error("  mcp-recall profiles test mcp__jira__search_issues --stored recall_abc123");
    console.error("  mcp-recall profiles test mcp__stripe__list_customers --input fixture.json");
    process.exit(1);
  }
  if (!storedId && !inputFile) {
    console.error(`Provide --stored <recall_id> or --input <file>
`);
    console.error(`To find a stored item:  recall__list_stored(tool: "${toolName}")`);
    process.exit(1);
  }
  let content;
  let contentSource;
  if (storedId) {
    const projectKey = getProjectKey(process.cwd());
    const db = getDb(defaultDbPath(projectKey));
    const row = db.prepare("SELECT full_content FROM stored_outputs WHERE id = ?").get(storedId);
    if (!row) {
      console.error(`No stored item found: ${storedId}`);
      process.exit(1);
    }
    content = row.full_content;
    contentSource = `stored:${storedId}`;
  } else {
    try {
      content = readFileSync4(inputFile, "utf8");
    } catch {
      console.error(`Cannot read: ${inputFile}`);
      process.exit(1);
    }
    contentSource = inputFile;
  }
  const config = loadConfig();
  if (isDenied(toolName, config)) {
    console.log(`Tool "${toolName}" is on the denylist \u2014 output will not be processed or stored.`);
    return;
  }
  const result = testProfile(toolName, content);
  if (result.matchedProfile) {
    const p = result.matchedProfile;
    console.log(`
Profile:  ${p.spec.profile.id} (${p.tier}) \u2014 ${p.patterns.join(", ")}`);
    console.log(`File:     ${p.filePath}`);
    console.log(`Strategy: ${p.spec.strategy.type}`);
  } else {
    console.log(`
No profile match for ${toolName}`);
    console.log(`Handler:  ${result.handlerName} (TypeScript fallback)`);
    console.log(`
To add a profile:`);
    console.log(`  mcp-recall learn`);
    console.log(`  https://github.com/sakebomb/mcp-recall/blob/main/docs/profile-schema.md`);
  }
  console.log(`
Input:  ${formatBytes(result.inputBytes)}  (${contentSource})`);
  console.log("\u2500".repeat(60));
  console.log(result.summary);
  console.log("\u2500".repeat(60));
  console.log(`Output: ${formatBytes(result.outputBytes)}  (${result.reductionPct}% reduction)
`);
}
async function cmdInfo(args) {
  const nameOrId = args[0];
  if (!nameOrId) {
    console.error("Usage: mcp-recall profiles info <name>");
    process.exit(1);
  }
  const allProfiles = loadProfiles();
  const local = allProfiles.find((p) => p.spec.profile.id === nameOrId) ?? allProfiles.find((p) => getShortName(p.spec) === nameOrId);
  let manifestEntry;
  try {
    process.stdout.write("Fetching manifest\u2026 ");
    const entries = await fetchManifest();
    console.log("done");
    const lookupId = local?.spec.profile.id ?? nameOrId;
    manifestEntry = entries.find((e) => e.id === lookupId) ?? entries.find((e) => manifestShortName(e) === nameOrId);
  } catch {
    console.log("(offline \u2014 showing local data only)");
  }
  if (!local && !manifestEntry) {
    console.error(`Profile "${nameOrId}" not found (not installed and not in community catalog).`);
    process.exit(1);
  }
  const id = local?.spec.profile.id ?? manifestEntry.id;
  const shortName = local ? getShortName(local.spec) : manifestShortName(manifestEntry);
  const version = local?.spec.profile.version ?? manifestEntry.version;
  const description = sanitize(local?.spec.profile.description ?? manifestEntry.description ?? "\u2014");
  const author = sanitize(String(local?.spec.profile.author ?? manifestEntry?.author ?? "\u2014"));
  const mcpUrl = sanitize(String(local?.spec.profile.mcp_url ?? manifestEntry?.mcp_url ?? "\u2014"));
  const patterns = local?.patterns ?? (Array.isArray(manifestEntry.mcp_pattern) ? manifestEntry.mcp_pattern : [manifestEntry.mcp_pattern]);
  const tier = local ? local.tier : "community (not installed)";
  console.log(`
${shortName} (${id} v${version})`);
  console.log(`  Description: ${description}`);
  console.log(`  Pattern:     ${patterns.join(", ")}`);
  console.log(`  Author:      ${author}`);
  console.log(`  MCP:         ${mcpUrl}`);
  if (local)
    console.log(`  Strategy:    ${local.spec.strategy.type}`);
  console.log(`  Tier:        ${tier}`);
  console.log(`  Installed:   ${local?.filePath ?? "not installed"}`);
  console.log();
}
async function cmdAvailable(args) {
  const verbose = args.includes("--verbose");
  process.stdout.write("Fetching manifest\u2026 ");
  const entries = await fetchManifest();
  console.log(`done
`);
  const installed = installedCommunityMap();
  const COL = { name: 20, desc: 46 };
  const statusLabel = "Status";
  const header = "Name".padEnd(COL.name) + "  " + "Description".padEnd(COL.desc) + "  " + statusLabel + (verbose ? "  MCP URL" : "");
  console.log(header);
  console.log("\u2500".repeat(Math.min(header.length + (verbose ? 50 : 0), 120)));
  let installedCount = 0;
  for (const e of entries) {
    const name = sanitize(manifestShortName(e)).slice(0, COL.name - 1).padEnd(COL.name);
    const desc = sanitize(e.description).slice(0, COL.desc - 1).padEnd(COL.desc);
    const isInstalled = installed.has(e.id);
    if (isInstalled)
      installedCount++;
    const status = isInstalled ? "installed" : "         ";
    const urlPart = verbose ? `  ${sanitize(e.mcp_url ?? "\u2014")}` : "";
    console.log(`${name}  ${desc}  ${status}${urlPart}`);
  }
  console.log(`
${entries.length} available, ${installedCount} installed
`);
}
async function handleProfilesCommand(args) {
  const cmd = args[0];
  const rest = args.slice(1);
  switch (cmd) {
    case "list":
      cmdList(rest);
      break;
    case "install":
      await cmdInstall(rest);
      break;
    case "update":
      await cmdUpdate(rest);
      break;
    case "remove":
      cmdRemove(rest);
      break;
    case "seed":
      await cmdSeed(rest);
      break;
    case "feed":
      cmdFeed(rest);
      break;
    case "check":
      cmdCheck();
      break;
    case "retrain":
      await handleRetrainCommand(rest);
      break;
    case "info":
      await cmdInfo(rest);
      break;
    case "available":
      await cmdAvailable(rest);
      break;
    case "test":
      cmdTest(rest);
      break;
    default:
      console.error(`Unknown subcommand: ${cmd ?? "(none)"}
`);
      console.error(`Usage: mcp-recall profiles <command>
`);
      console.error("Commands:");
      console.error("  list                    Show all installed profiles");
      console.error("  available [--verbose]   Browse the community catalog");
      console.error("  info <name>             Show full metadata for a profile");
      console.error("  install <name>          Install a community profile");
      console.error("  update                  Update all installed community profiles");
      console.error("  remove <name>           Remove a community profile");
      console.error("  seed [--all]            Install profiles for all detected MCPs (--all for entire catalog)");
      console.error("  feed [path]             Contribute a local profile to the community");
      console.error("  check                   Detect pattern conflicts");
      console.error("  retrain [--apply] [--depth N] [filter]  Suggest profile improvements from stored corpus");
      console.error("  test <tool> [--stored <id>] [--input <file>]  Test a profile against real input");
      process.exit(1);
  }
}

// src/learn/index.ts
import { readFileSync as readFileSync5, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3 } from "fs";
import { join as join5 } from "path";
import { homedir as homedir5 } from "os";

// src/learn/client.ts
class LineReader {
  buf = "";
  reader;
  dec = new TextDecoder;
  constructor(stream) {
    this.reader = stream.getReader();
  }
  async readLine(timeoutMs) {
    const timer = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const read = this._nextLine();
    return Promise.race([read, timer]);
  }
  async _nextLine() {
    while (true) {
      const nl = this.buf.indexOf(`
`);
      if (nl !== -1) {
        const line = this.buf.slice(0, nl).trimEnd();
        this.buf = this.buf.slice(nl + 1);
        return line;
      }
      const { done, value } = await this.reader.read();
      if (done) {
        const line = this.buf.trim();
        this.buf = "";
        return line.length > 0 ? line : null;
      }
      this.buf += this.dec.decode(value, { stream: true });
    }
  }
  release() {
    this.reader.releaseLock();
  }
}
async function awaitResponse(reader, id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const line = await reader.readLine(remaining);
    if (line === null)
      throw new Error("server closed stdout");
    if (!line.startsWith("{"))
      continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id !== id)
      continue;
    if (msg.error)
      throw new Error(`MCP error: ${msg.error.message}`);
    return msg.result;
  }
  throw new Error("timeout waiting for MCP response");
}
async function listMcpTools(command, args, env, timeoutMs = 1e4) {
  const proc = Bun.spawn([command, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, ...env }
  });
  const reader = new LineReader(proc.stdout);
  function send(msg) {
    proc.stdin.write(JSON.stringify(msg) + `
`);
  }
  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mcp-recall-learn", version: "1.0.0" }
      }
    });
    await awaitResponse(reader, 1, timeoutMs);
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const result = await awaitResponse(reader, 2, timeoutMs);
    return result?.tools ?? [];
  } finally {
    reader.release();
    proc.stdin.end();
    proc.kill();
  }
}

// src/learn/generate.ts
var LIST_VERBS = /^(list|search|find|query|get_all|fetch_all)/i;
var SINGLE_VERBS = /^(get|fetch|read|describe|show|retrieve)/i;
var WRITE_VERBS = /^(create|update|delete|remove|set|add|post|put|patch)/i;
var COMMON_FIELDS = ["id", "title", "name", "status", "description"];
function impliesList(toolName, description) {
  const base = toolName.split("__").pop() ?? toolName;
  if (LIST_VERBS.test(base))
    return true;
  if (WRITE_VERBS.test(base))
    return false;
  if (SINGLE_VERBS.test(base))
    return false;
  if (description) {
    const d = description.toLowerCase();
    return d.includes("list") || d.includes("search") || d.includes("results");
  }
  return false;
}
function schemaFields(inputSchema) {
  if (!inputSchema)
    return [];
  const props = inputSchema["properties"];
  if (!props)
    return [];
  return Object.keys(props).filter((k) => !["limit", "cursor", "offset", "page", "query", "filter"].includes(k));
}
function suggestItemsPaths(serverKey, tools) {
  const allNames = tools.map((t) => t.name.toLowerCase()).join(" ");
  const paths = [];
  const keywords = [
    ["issue", "issues"],
    ["ticket", "tickets"],
    ["page", "pages"],
    ["item", "items"],
    ["result", "results"],
    ["task", "tasks"],
    ["record", "records"],
    ["node", "nodes"],
    ["message", "messages"]
  ];
  for (const [keyword, path] of keywords) {
    if (allNames.includes(keyword) || serverKey.includes(keyword))
      paths.push(path);
  }
  for (const fb of ["items", "results", "data", "nodes"]) {
    if (!paths.includes(fb))
      paths.push(fb);
  }
  return paths.slice(0, 6);
}
function generateProfile(serverKey, tools) {
  const id = `mcp__${serverKey.replace(/-/g, "_")}`;
  const pattern = `mcp__${serverKey.replace(/-/g, "_")}__*`;
  const toolCount = tools.length;
  const listTools = tools.filter((t) => impliesList(t.name, t.description));
  const useExtract = listTools.length > 0;
  const description = `Auto-generated profile for ${serverKey} (${toolCount} tool${toolCount === 1 ? "" : "s"} \u2014 run mcp-recall learn to regenerate)`;
  if (!useExtract) {
    return [
      `# Generated by: mcp-recall learn`,
      `# Tools: ${tools.map((t) => t.name.split("__").pop()).join(", ")}`,
      `# Refine strategy.fields after observing real tool output.`,
      ``,
      `[profile]`,
      `id          = "${id}"`,
      `version     = "1.0.0"`,
      `description = "${description}"`,
      `mcp_pattern = "${pattern}"`,
      ``,
      `[strategy]`,
      `type            = "json_truncate"`,
      `max_depth       = 3`,
      `max_array_items = 5`,
      `fallback_chars  = 500`
    ].join(`
`) + `
`;
  }
  const schemaHints = listTools.flatMap((t) => schemaFields(t.inputSchema));
  const candidateFields = [...new Set([...COMMON_FIELDS, ...schemaHints])].slice(0, 8);
  const itemsPaths = suggestItemsPaths(serverKey, tools);
  const fieldsToml = candidateFields.map((f) => `  "${f}",`).join(`
`);
  const pathsToml = itemsPaths.map((p) => `  "${p}",`).join(`
`);
  return [
    `# Generated by: mcp-recall learn`,
    `# List tools detected: ${listTools.map((t) => t.name.split("__").pop()).join(", ")}`,
    `# Refine items_path and fields after observing real tool output.`,
    ``,
    `[profile]`,
    `id          = "${id}"`,
    `version     = "1.0.0"`,
    `description = "${description}"`,
    `mcp_pattern = "${pattern}"`,
    ``,
    `[strategy]`,
    `type = "json_extract"`,
    `items_path = [`,
    pathsToml,
    `]`,
    `fields = [`,
    fieldsToml,
    `]`,
    `max_items           = 10`,
    `max_chars_per_field = 200`,
    `fallback_chars      = 500`
  ].join(`
`) + `
`;
}

// src/learn/index.ts
function userProfilesDir() {
  return process.env.RECALL_USER_PROFILES_PATH ?? join5(homedir5(), ".config", "mcp-recall", "profiles");
}
function readClaudeJson() {
  const path = join5(homedir5(), ".claude.json");
  const raw = JSON.parse(readFileSync5(path, "utf8"));
  return raw["mcpServers"] ?? {};
}
async function handleLearnCommand(args) {
  const dryRun = args.includes("--dry-run");
  const targets = args.filter((a) => !a.startsWith("--"));
  let servers;
  try {
    servers = readClaudeJson();
  } catch {
    console.error("Could not read ~/.claude.json");
    process.exit(1);
  }
  const candidates = Object.entries(servers).filter(([key, cfg]) => {
    if (key === "recall")
      return false;
    if (targets.length > 0 && !targets.includes(key))
      return false;
    if (!cfg.command) {
      console.log(`  ${key}: skipped (HTTP/SSE server \u2014 only stdio supported)`);
      return false;
    }
    return true;
  });
  if (candidates.length === 0) {
    console.log("No stdio MCP servers found to learn from.");
    return;
  }
  console.log(`
Learning from ${candidates.length} MCP server(s)\u2026
`);
  const outputDir = userProfilesDir();
  let written = 0;
  let skipped = 0;
  for (const [key, cfg] of candidates) {
    process.stdout.write(`  ${key}: connecting\u2026 `);
    let tools;
    try {
      tools = await listMcpTools(cfg.command, cfg.args ?? [], cfg.env ?? {}, 1e4);
    } catch (e) {
      console.log(`failed \u2014 ${e instanceof Error ? e.message : String(e)}`);
      skipped++;
      continue;
    }
    console.log(`${tools.length} tool(s) found`);
    const toml = generateProfile(key, tools);
    if (dryRun) {
      console.log(`
\u2500\u2500\u2500 ${key} \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
      console.log(toml);
      continue;
    }
    const profileDir = join5(outputDir, `mcp__${key.replace(/-/g, "_")}`);
    mkdirSync3(profileDir, { recursive: true });
    const filePath = join5(profileDir, "default.toml");
    writeFileSync3(filePath, toml);
    console.log(`     \u2192 ${filePath}`);
    written++;
  }
  if (!dryRun) {
    clearProfileCache();
    console.log(`
${written} profile(s) written, ${skipped} skipped.`);
    if (written > 0) {
      console.log(`
Next steps:`);
      console.log(`  1. Run a tool from each MCP to see real output`);
      console.log(`  2. Refine items_path and fields in the generated profiles`);
      console.log(`  3. Run: mcp-recall profiles check`);
      console.log(`  4. Share good profiles: mcp-recall profiles feed <path>`);
    }
  }
}

// src/install/index.ts
import { existsSync } from "fs";
import { mkdir, rename, readFile } from "fs/promises";
import path from "path";
import os from "os";
var BOLD = "\x1B[1m";
var GREEN = "\x1B[32m";
var YELLOW = "\x1B[33m";
var RED = "\x1B[31m";
var DIM = "\x1B[2m";
var RESET = "\x1B[0m";
function defaultClaudeJsonPath() {
  return path.join(os.homedir(), ".claude.json");
}
function defaultSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}
function defaultClaudeMdPath() {
  return path.join(os.homedir(), ".claude", "CLAUDE.md");
}
function detectPaths() {
  const isBuilt = import.meta.path.endsWith(".js");
  const distDir = isBuilt ? import.meta.dir : path.resolve(import.meta.dir, "../../plugins/mcp-recall/dist");
  return {
    serverJs: path.join(distDir, "server.js"),
    cliJs: path.join(distDir, "cli.js")
  };
}
async function readJsonFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (e) {
    if (e instanceof Error && e.code === "ENOENT")
      return {};
    throw new Error(`Cannot parse ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
async function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + `
`;
  const tmp = filePath + ".tmp";
  await Bun.write(tmp, content);
  await rename(tmp, filePath);
}
var CLAUDE_MD_MARKER_START = "<!-- BEGIN mcp-recall -->";
var CLAUDE_MD_MARKER_END = "<!-- END mcp-recall -->";
var CLAUDE_MD_SNIPPET = `## mcp-recall

Session context from previous sessions is automatically injected at startup (pinned items, notes, recent activity). If it was truncated, call \`recall__context()\` for the full view.

When a tool output was compressed by mcp-recall (you'll see a summary with a recall ID like \`recall_abc123\`), call \`recall__retrieve("recall_abc123")\` when you need the full content.

Proactively:
- \`recall__note("\u2026")\` \u2014 save important decisions or context worth keeping across sessions
- \`recall__pin("recall_abc123")\` \u2014 protect frequently-needed items from expiry and eviction
- \`recall__search("query")\` \u2014 find stored outputs by content when you don't have an ID`;
var CLAUDE_MD_BLOCK = `${CLAUDE_MD_MARKER_START}
${CLAUDE_MD_SNIPPET}
${CLAUDE_MD_MARKER_END}`;
async function writeTextFile(filePath, content) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = filePath + ".tmp";
  await Bun.write(tmp, content);
  await rename(tmp, filePath);
}
function isClaudeMdInjected(content) {
  return content.includes(CLAUDE_MD_MARKER_START);
}
async function injectClaudeMd(filePath, dryRun = false) {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT")
      throw e;
  }
  const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
  const endIdx = existing.indexOf(CLAUDE_MD_MARKER_END);
  if (startIdx !== -1 && endIdx !== -1) {
    const currentBlock = existing.slice(startIdx, endIdx + CLAUDE_MD_MARKER_END.length);
    if (currentBlock === CLAUDE_MD_BLOCK)
      return "present";
    if (!dryRun) {
      const updated = existing.slice(0, startIdx) + CLAUDE_MD_BLOCK + existing.slice(endIdx + CLAUDE_MD_MARKER_END.length);
      await writeTextFile(filePath, updated);
    }
    return "updated";
  }
  if (!dryRun) {
    const newContent = existing ? existing.trimEnd() + `

` + CLAUDE_MD_BLOCK + `
` : CLAUDE_MD_BLOCK + `
`;
    await writeTextFile(filePath, newContent);
  }
  return "added";
}
async function removeClaudeMd(filePath) {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT")
      return false;
    throw e;
  }
  const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
  const endIdx = existing.indexOf(CLAUDE_MD_MARKER_END);
  if (startIdx === -1 || endIdx === -1)
    return false;
  const before = existing.slice(0, startIdx).trimEnd();
  const after = existing.slice(endIdx + CLAUDE_MD_MARKER_END.length).replace(/^\n+/, `
`);
  const result = (before + after).trimEnd();
  await writeTextFile(filePath, result ? result + `
` : "");
  return true;
}
var SESSION_START_MARKER = "session-start";
var POST_TOOL_USE_MARKER = "post-tool-use";
var POST_TOOL_USE_MATCHER = "(mcp__(?!recall__).*|Bash)";
function makeSessionStartEntry(cliJs) {
  return {
    hooks: [{ type: "command", command: `bun ${cliJs} session-start`, timeout: 10 }]
  };
}
function makePostToolUseEntry(cliJs) {
  return {
    matcher: POST_TOOL_USE_MATCHER,
    hooks: [{ type: "command", command: `bun ${cliJs} post-tool-use`, timeout: 10 }]
  };
}
function isOurSessionStartHook(entry) {
  if (!entry || typeof entry !== "object")
    return false;
  const hooks = entry["hooks"];
  if (!Array.isArray(hooks))
    return false;
  return hooks.some((h) => {
    const cmd = h["command"];
    return typeof cmd === "string" && cmd.includes("recall") && cmd.includes(SESSION_START_MARKER);
  });
}
function isOurPostToolUseHook(entry) {
  if (!entry || typeof entry !== "object")
    return false;
  const e = entry;
  if (e["matcher"] !== POST_TOOL_USE_MATCHER)
    return false;
  const hooks = e["hooks"];
  if (!Array.isArray(hooks))
    return false;
  return hooks.some((h) => {
    const cmd = h["command"];
    return typeof cmd === "string" && cmd.includes("recall") && cmd.includes(POST_TOOL_USE_MARKER);
  });
}
async function installCommand(opts = {}) {
  const {
    dryRun = false,
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath = defaultSettingsPath(),
    claudeMdPath = defaultClaudeMdPath()
  } = opts;
  const paths = detectPaths();
  if (!existsSync(paths.serverJs) || !existsSync(paths.cliJs)) {
    console.error(`${RED}\u2717 Build artifacts not found.${RESET}`);
    console.error(`  Expected: ${DIM}${paths.serverJs}${RESET}`);
    console.error(`  Run ${BOLD}bun run build${RESET} first.`);
    process.exit(1);
  }
  if (dryRun) {
    console.log(`${DIM}dry run \u2014 no files will be modified${RESET}
`);
  }
  let anyChange = false;
  const claudeJson = await readJsonFile(claudeJsonPath);
  const mcpServers = claudeJson["mcpServers"] ?? {};
  const newServer = { type: "stdio", command: "bun", args: [paths.serverJs] };
  const existing = mcpServers["recall"];
  const currentServerPath = existing?.["args"]?.[0];
  if (!existing) {
    if (!dryRun) {
      claudeJson["mcpServers"] = { ...mcpServers, recall: newServer };
      await writeJsonFile(claudeJsonPath, claudeJson);
    }
    console.log(`${GREEN}\u2713${RESET} MCP server registered     ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else if (currentServerPath !== paths.serverJs) {
    if (!dryRun) {
      claudeJson["mcpServers"] = { ...mcpServers, recall: newServer };
      await writeJsonFile(claudeJsonPath, claudeJson);
    }
    console.log(`${YELLOW}\u21BA${RESET} MCP server path updated    ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}\u2139 MCP server already registered${RESET}`);
  }
  const settings = await readJsonFile(settingsPath);
  const hooks = settings["hooks"] ?? {};
  let settingsChanged = false;
  const ssHooks = hooks["SessionStart"] ?? [];
  const ssIdx = ssHooks.findIndex(isOurSessionStartHook);
  const newSS = makeSessionStartEntry(paths.cliJs);
  if (ssIdx === -1) {
    hooks["SessionStart"] = [...ssHooks, newSS];
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}\u2713${RESET} SessionStart hook added    ${DIM}(${settingsPath})${RESET}`);
  } else {
    const currentCmd = ssHooks[ssIdx].hooks[0]?.command;
    if (currentCmd !== newSS.hooks[0].command) {
      ssHooks[ssIdx] = newSS;
      hooks["SessionStart"] = ssHooks;
      settingsChanged = true;
      anyChange = true;
      console.log(`${YELLOW}\u21BA${RESET} SessionStart hook updated   ${DIM}(${settingsPath})${RESET}`);
    } else {
      console.log(`${DIM}\u2139 SessionStart hook already registered${RESET}`);
    }
  }
  const ptuHooks = hooks["PostToolUse"] ?? [];
  const ptuIdx = ptuHooks.findIndex(isOurPostToolUseHook);
  const newPTU = makePostToolUseEntry(paths.cliJs);
  if (ptuIdx === -1) {
    hooks["PostToolUse"] = [...ptuHooks, newPTU];
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}\u2713${RESET} PostToolUse hook added     ${DIM}(${settingsPath})${RESET}`);
  } else {
    const currentCmd = ptuHooks[ptuIdx].hooks[0]?.command;
    if (currentCmd !== newPTU.hooks[0].command) {
      ptuHooks[ptuIdx] = newPTU;
      hooks["PostToolUse"] = ptuHooks;
      settingsChanged = true;
      anyChange = true;
      console.log(`${YELLOW}\u21BA${RESET} PostToolUse hook updated    ${DIM}(${settingsPath})${RESET}`);
    } else {
      console.log(`${DIM}\u2139 PostToolUse hook already registered${RESET}`);
    }
  }
  if (settingsChanged && !dryRun) {
    settings["hooks"] = hooks;
    await writeJsonFile(settingsPath, settings);
  }
  const claudeMdResult = await injectClaudeMd(claudeMdPath, dryRun);
  if (claudeMdResult === "added") {
    console.log(`${GREEN}\u2713${RESET} CLAUDE.md instructions added  ${DIM}(${claudeMdPath})${RESET}`);
    anyChange = true;
  } else if (claudeMdResult === "updated") {
    console.log(`${YELLOW}\u21BA${RESET} CLAUDE.md instructions updated ${DIM}(${claudeMdPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}\u2139 CLAUDE.md instructions already present${RESET}`);
  }
  if (anyChange && !dryRun) {
    console.log(`
Restart Claude Code to activate mcp-recall.`);
    console.log(`
Next steps:`);
    console.log(`  Install compression profiles for your MCPs:`);
    console.log(`    ${BOLD}mcp-recall profiles seed${RESET}`);
    console.log(`
  Optional \u2014 enable shell completions:`);
    console.log(`    ${BOLD}mcp-recall completions zsh >> ~/.zfunc/_mcp-recall${RESET}   ${DIM}# zsh${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions bash >> ~/.bash_completion${RESET}    ${DIM}# bash${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions fish > ~/.config/fish/completions/mcp-recall.fish${RESET}  ${DIM}# fish${RESET}`);
  }
}
async function uninstallCommand(opts = {}) {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath = defaultSettingsPath(),
    claudeMdPath = defaultClaudeMdPath()
  } = opts;
  let anyChange = false;
  const claudeJson = await readJsonFile(claudeJsonPath);
  const mcpServers = claudeJson["mcpServers"];
  if (mcpServers?.["recall"]) {
    delete mcpServers["recall"];
    await writeJsonFile(claudeJsonPath, claudeJson);
    console.log(`${GREEN}\u2713${RESET} Removed mcpServers.recall  ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}\u2139 mcpServers.recall not present${RESET}`);
  }
  const settings = await readJsonFile(settingsPath);
  const hooks = settings["hooks"] ?? {};
  let settingsChanged = false;
  const ssHooks = hooks["SessionStart"] ?? [];
  const ssIdx = ssHooks.findIndex(isOurSessionStartHook);
  if (ssIdx !== -1) {
    hooks["SessionStart"] = ssHooks.filter((_, i) => i !== ssIdx);
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}\u2713${RESET} Removed SessionStart hook   ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}\u2139 SessionStart hook not present${RESET}`);
  }
  const ptuHooks = hooks["PostToolUse"] ?? [];
  const ptuIdx = ptuHooks.findIndex(isOurPostToolUseHook);
  if (ptuIdx !== -1) {
    hooks["PostToolUse"] = ptuHooks.filter((_, i) => i !== ptuIdx);
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}\u2713${RESET} Removed PostToolUse hook    ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}\u2139 PostToolUse hook not present${RESET}`);
  }
  if (settingsChanged) {
    settings["hooks"] = hooks;
    await writeJsonFile(settingsPath, settings);
  }
  const removed = await removeClaudeMd(claudeMdPath);
  if (removed) {
    console.log(`${GREEN}\u2713${RESET} Removed CLAUDE.md instructions  ${DIM}(${claudeMdPath})${RESET}`);
    anyChange = true;
  } else {
    console.log(`${DIM}\u2139 CLAUDE.md instructions not present${RESET}`);
  }
  if (anyChange) {
    console.log(`
Restart Claude Code to deactivate mcp-recall.`);
  }
}
async function statusCommand(opts = {}) {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath = defaultSettingsPath(),
    claudeMdPath = defaultClaudeMdPath()
  } = opts;
  const recallPaths = detectPaths();
  function tick(ok) {
    return ok ? `${GREEN}\u2713${RESET}` : `${RED}\u2717${RESET}`;
  }
  function pad(s, n) {
    return s + " ".repeat(Math.max(0, n - s.length));
  }
  const claudeJson = await readJsonFile(claudeJsonPath);
  const settings = await readJsonFile(settingsPath);
  const hooks = settings["hooks"] ?? {};
  const mcpServers = claudeJson["mcpServers"];
  const serverRegistered = !!mcpServers?.["recall"];
  const ssRegistered = (hooks["SessionStart"] ?? []).some(isOurSessionStartHook);
  const ptuRegistered = (hooks["PostToolUse"] ?? []).some(isOurPostToolUseHook);
  let claudeMdContent = "";
  try {
    claudeMdContent = await readFile(claudeMdPath, "utf8");
  } catch {}
  const claudeMdOk = isClaudeMdInjected(claudeMdContent);
  const serverExists = existsSync(recallPaths.serverJs);
  const cliExists = existsSync(recallPaths.cliJs);
  const fullyInstalled = serverRegistered && ssRegistered && ptuRegistered && claudeMdOk && serverExists && cliExists;
  const label = fullyInstalled ? `${GREEN}installed${RESET}` : serverRegistered || ssRegistered || ptuRegistered ? `${YELLOW}partial / stale${RESET}` : `${RED}not installed${RESET}`;
  console.log(`
Installation: ${BOLD}${label}${RESET}
`);
  console.log(`  ${pad("~/.claude.json", 30)}  ${tick(serverRegistered)} mcpServers.recall`);
  console.log(`  ${pad("~/.claude/settings.json", 30)}  ${tick(ssRegistered)} SessionStart hook`);
  console.log(`  ${pad("", 30)}  ${tick(ptuRegistered)} PostToolUse hook`);
  console.log(`  ${pad("~/.claude/CLAUDE.md", 30)}  ${tick(claudeMdOk)} mcp-recall instructions`);
  console.log("");
  console.log(`  ${pad("Build artifacts", 30)}`);
  console.log(`  ${pad("  dist/server.js", 30)}  ${tick(serverExists)} ${DIM}${recallPaths.serverJs}${RESET}`);
  console.log(`  ${pad("  dist/cli.js", 30)}  ${tick(cliExists)} ${DIM}${recallPaths.cliJs}${RESET}`);
  if (!fullyInstalled) {
    console.log("");
    if (!serverExists || !cliExists) {
      console.log(`  Run ${BOLD}bun run build${RESET} then ${BOLD}mcp-recall install${RESET}`);
    } else {
      console.log(`  Run ${BOLD}mcp-recall install${RESET}`);
    }
    if (!claudeMdOk) {
      console.log(`  Or add instructions manually: see ${BOLD}docs/quickstart.md${RESET}`);
    }
  }
  console.log("");
  const profiles = loadProfiles();
  if (profiles.length === 0) {
    console.log(`  ${RED}\u2717${RESET} Profiles: none installed`);
    console.log(`    \u2192 Run: ${BOLD}mcp-recall profiles seed${RESET}`);
  } else {
    const counts = profiles.reduce((acc, p) => {
      acc[p.tier] = (acc[p.tier] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ");
    console.log(`  ${GREEN}\u2713${RESET} Profiles: ${profiles.length} installed (${summary})`);
  }
  console.log("");
}

// src/cli.ts
async function getVersion() {
  const pkg = await Promise.resolve().then(() => __toESM(require_package(), 1));
  return pkg.version;
}
function printHelp() {
  console.log(`
mcp-recall \u2014 context compression for Claude Code

Usage: mcp-recall <command> [options]

Commands:
  install              Register hooks + MCP server in Claude Code
  uninstall            Remove hooks + MCP server
  status               Show current configuration and health
  profiles <cmd>       Manage compression profiles
    seed [--all]       Install profiles for detected MCPs (--all for entire catalog)
    list               Show installed profiles
    install <id>       Install a specific community profile
    update             Update all community profiles
    remove <id>        Remove a community profile
    feed [path]        Contribute a profile to the community
    check              Detect pattern conflicts
    retrain            Suggest profile improvements from stored data
    test <tool>        Test a profile against real input
  learn                Generate profile suggestions from session data
  completions <shell>  Print shell completion script (bash, zsh, fish)

Options:
  --help, -h           Show this help
  --version, -v        Show version

Examples:
  mcp-recall install              # first-time setup
  mcp-recall profiles seed        # install profiles for your MCPs
  mcp-recall status               # check everything is working
  mcp-recall completions zsh >> ~/.zfunc/_mcp-recall
`);
}
function completionScript(shell) {
  switch (shell) {
    case "bash":
      return bashCompletion();
    case "zsh":
      return zshCompletion();
    case "fish":
      return fishCompletion();
    default:
      throw new Error(`Unknown shell "${shell}". Supported: bash, zsh, fish`);
  }
}
function bashCompletion() {
  return `# mcp-recall bash completions
# Add to your ~/.bashrc or source from /etc/bash_completion.d/mcp-recall

_mcp_recall() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"

  local commands="install uninstall status profiles learn completions --help --version"
  local profiles_cmds="list install update remove seed feed check retrain test"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  if [[ "\${COMP_WORDS[1]}" == "profiles" ]]; then
    if [[ \${COMP_CWORD} -eq 2 ]]; then
      COMPREPLY=( $(compgen -W "\${profiles_cmds}" -- "\${cur}") )
      return 0
    fi
    if [[ \${COMP_CWORD} -ge 3 ]]; then
      local subcmd="\${COMP_WORDS[2]}"
      if [[ "$subcmd" == "install" || "$subcmd" == "remove" || "$subcmd" == "test" ]]; then
        local profile_ids
        profile_ids="$(mcp-recall profiles list --machine-readable 2>/dev/null)"
        COMPREPLY=( $(compgen -W "\${profile_ids}" -- "\${cur}") )
        return 0
      fi
    fi
  fi
}

complete -F _mcp_recall mcp-recall
`;
}
function zshCompletion() {
  return `#compdef mcp-recall
# mcp-recall zsh completions
# Add to your fpath, e.g.: mcp-recall completions zsh >> ~/.zfunc/_mcp-recall
# Then add to ~/.zshrc: fpath=(~/.zfunc \${fpath}); autoload -Uz compinit && compinit

_mcp_recall_profiles() {
  local state
  _arguments \\
    '1: :->subcommand' \\
    '*:: :->args'

  case $state in
    subcommand)
      local subcommands=(
        'list:show installed profiles'
        'install:install a community profile by ID'
        'update:update all installed community profiles'
        'remove:remove an installed community profile'
        'seed:install profiles for all detected MCPs'
        'feed:contribute a local profile to the community'
        'check:detect pattern conflicts between installed profiles'
        'retrain:suggest profile improvements from stored data'
        'test:test a profile against real input'
      )
      _describe 'subcommand' subcommands
      ;;
    args)
      case $words[1] in
        install|remove|test)
          local profiles
          profiles=(\${(f)"$(mcp-recall profiles list --machine-readable 2>/dev/null)"})
          _describe 'profile' profiles
          ;;
        seed)
          _arguments '--all[install every profile in the community catalog]'
          ;;
      esac
      ;;
  esac
}

_mcp_recall() {
  local state
  _arguments \\
    '(-h --help)'{-h,--help}'[show help and exit]' \\
    '(-v --version)'{-v,--version}'[show version and exit]' \\
    '1: :->command' \\
    '*:: :->args'

  case $state in
    command)
      local commands=(
        'install:register hooks and MCP server in Claude Code'
        'uninstall:remove hooks and MCP server'
        'status:show current configuration and health'
        'profiles:manage compression profiles'
        'learn:generate profile suggestions from session data'
        'completions:print shell completion script (bash, zsh, fish)'
      )
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        profiles)
          _mcp_recall_profiles
          ;;
        completions)
          local shells=('bash:generate bash completion script' 'zsh:generate zsh completion script' 'fish:generate fish completion script')
          _describe 'shell' shells
          ;;
      esac
      ;;
  esac
}

_mcp_recall "$@"
`;
}
function fishCompletion() {
  return `# mcp-recall fish completions
# Save to: mcp-recall completions fish > ~/.config/fish/completions/mcp-recall.fish

set -l commands install uninstall status profiles learn completions

# Top-level commands
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a install -d "Register hooks and MCP server in Claude Code"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a uninstall -d "Remove hooks and MCP server"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a status -d "Show current configuration and health"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a profiles -d "Manage compression profiles"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a learn -d "Generate profile suggestions from session data"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a completions -d "Print shell completion script"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -s h -l help -d "Show help and exit"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -s v -l version -d "Show version and exit"

# completions subcommand \u2014 shell argument
complete -c mcp-recall -f -n "__fish_seen_subcommand_from completions" \\
  -a "bash zsh fish"

# profiles subcommands
set -l profile_cmds list install update remove seed feed check retrain test

complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a list -d "Show installed profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a install -d "Install a community profile by ID"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a update -d "Update all installed community profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a remove -d "Remove an installed community profile"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a seed -d "Install profiles for all detected MCPs"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a feed -d "Contribute a local profile to the community"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a check -d "Detect pattern conflicts between installed profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a retrain -d "Suggest profile improvements from stored data"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a test -d "Test a profile against real input"

# Dynamic profile IDs for install / remove / test
complete -c mcp-recall -f \\
  -n "__fish_seen_subcommand_from profiles; and __fish_seen_subcommand_from install remove test" \\
  -a "(mcp-recall profiles list --machine-readable 2>/dev/null)"

# profiles seed --all flag
complete -c mcp-recall -n "__fish_seen_subcommand_from profiles; and __fish_seen_subcommand_from seed" \\
  -l all -d "Install every profile in the community catalog"
`;
}
var subcommand = process.argv[2];
async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(await getVersion());
    process.exit(0);
  }
  if (!subcommand) {
    printHelp();
    process.exit(0);
  }
  if (subcommand === "completions") {
    const shell = process.argv[3];
    if (!shell) {
      console.error("Usage: mcp-recall completions <bash|zsh|fish>");
      process.exit(1);
    }
    try {
      process.stdout.write(completionScript(shell));
    } catch (err) {
      console.error(`${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    process.exit(0);
  }
  if (subcommand === "profiles") {
    await handleProfilesCommand(process.argv.slice(3));
    process.exit(0);
  }
  if (subcommand === "learn") {
    await handleLearnCommand(process.argv.slice(3));
    process.exit(0);
  }
  if (subcommand === "install") {
    const dryRun = process.argv.includes("--dry-run");
    await installCommand({ dryRun });
    process.exit(0);
  }
  if (subcommand === "uninstall") {
    await uninstallCommand();
    process.exit(0);
  }
  if (subcommand === "status") {
    await statusCommand();
    process.exit(0);
  }
  const raw = await Bun.stdin.text();
  try {
    switch (subcommand) {
      case "session-start":
        handleSessionStart(raw);
        process.stdout.write(JSON.stringify({ suppressOutput: true }) + `
`);
        break;
      case "post-tool-use": {
        const result = handlePostToolUse(raw);
        process.stdout.write(JSON.stringify(result) + `
`);
        break;
      }
      default:
        process.stderr.write(`[recall] unknown subcommand: ${subcommand}
`);
        process.exit(1);
    }
  } catch (err) {
    if (process.env.RECALL_DEBUG) {
      process.stderr.write(`[recall:debug] STACK: ${err instanceof Error ? err.stack : String(err)}
`);
    }
    process.stderr.write(`[recall] error in ${subcommand}: ${err}
`);
    process.stdout.write(`{}
`);
    process.exit(0);
  }
}
if (import.meta.main) {
  main();
}
export {
  printHelp,
  getVersion,
  completionScript
};
