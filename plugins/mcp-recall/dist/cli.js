// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
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
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
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
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// node_modules/smol-toml/dist/date.js
var DATE_TIME_RE, TomlDate;
var init_date = __esm(() => {
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
  DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
  TomlDate = class TomlDate extends Date {
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
  };
});

// node_modules/smol-toml/dist/error.js
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
var TomlError;
var init_error = __esm(() => {
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
  TomlError = class TomlError extends Error {
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
  };
});

// node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start = 0) {
  let idx = str.indexOf(`
`, start);
  if (str.charCodeAt(idx - 1) === 13)
    idx--;
  return idx;
}
function skipComment(ctx) {
  for (;ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 10)
      break;
    if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
      ctx.p++;
      break;
    }
    if (c < 32 && c !== 9 || c === 127) {
      throw new TomlError("control characters are not allowed in comments", {
        toml: ctx.s,
        ptr: ctx.p
      });
    }
  }
}
function skipVoid(ctx, banNewLines, banComments) {
  let c;
  while (true) {
    while ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10))
      ctx.p++;
    if (banComments || c !== 35)
      break;
    skipComment(ctx);
  }
}
function skipUntil(ctx, sep, end) {
  let ptr = ctx.p;
  if (!end) {
    ptr = indexOfNewline(ctx.s, ptr);
    ctx.p = ptr < 0 ? ctx.s.length : ptr;
    return;
  }
  for (;ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 35) {
      skipComment(ctx);
    } else if (c === end || c === sep) {
      return;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: ctx.s,
    ptr
  });
}
var init_util = __esm(() => {
  init_error();
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
});

// node_modules/smol-toml/dist/primitive.js
function parseString(ctx) {
  let start = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p++);
  let first = c;
  let isLiteral = c === 39;
  let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
  if (isMultiline) {
    if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
      ctx.p++;
    else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
      ctx.p += 2;
  }
  let parsed = "";
  let sliceStart = ctx.p;
  let state = 0;
  for (;ctx.p < ctx.s.length; ctx.p++) {
    c = ctx.s.charCodeAt(ctx.p);
    if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
      state = state && 3;
    } else if (c < 32 && c !== 9 || c === 127) {
      throw new TomlError("control characters are not allowed in strings", {
        toml: ctx.s,
        ptr: ctx.p
      });
    } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
      if (isMultiline) {
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
      }
      if (!state)
        parsed += ctx.s.slice(sliceStart, ctx.p);
      ctx.p += isMultiline ? 3 : 1;
      return parsed;
    } else if (!state) {
      if (!isLiteral && c === 92) {
        parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
        state = 1;
      }
    } else if (state === 1) {
      if (c === 120 || c === 117 || c === 85) {
        let value = 0;
        let len = c === 120 ? 2 : c === 117 ? 4 : 8;
        for (let j = 0;j < len; j++, ctx.p++) {
          let hex = ctx.s.charCodeAt(ctx.p + 1);
          let digit = hex >= 48 && hex <= 57 ? hex - 48 : hex >= 65 && hex <= 70 ? hex - 65 + 10 : hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1;
          if (digit < 0)
            throw new TomlError("invalid non-hex character in unicode escape", { toml: ctx.s, ptr: ctx.p + 1 });
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          throw new TomlError("invalid unicode escape", { toml: ctx.s, ptr: ctx.p });
        }
        parsed += String.fromCodePoint(value);
        sliceStart = ctx.p + 1;
        state = 0;
      } else if (c === 32 || c === 9) {
        state = 2;
      } else {
        if (c === 98)
          parsed += "\b";
        else if (c === 116)
          parsed += "\t";
        else if (c === 110)
          parsed += `
`;
        else if (c === 102)
          parsed += "\f";
        else if (c === 114)
          parsed += "\r";
        else if (c === 101)
          parsed += "\x1B";
        else if (c === 34)
          parsed += '"';
        else if (c === 92)
          parsed += "\\";
        else
          throw new TomlError("unrecognized escape sequence", { toml: ctx.s, ptr: ctx.p });
        sliceStart = ctx.p + 1;
        state = 0;
      }
    } else if (c !== 32 && c !== 9) {
      if (state === 2) {
        throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
          toml: ctx.s,
          ptr: sliceStart
        });
      }
      state = !isLiteral && c === 92 ? 1 : 0;
      sliceStart = ctx.p;
    }
  }
  throw new TomlError("unfinished string", { toml: ctx.s, ptr: start });
}
function sliceAndTrimEndOf(ctx, start, end) {
  let value = ctx.s.slice(start, end);
  let commentIdx = value.indexOf("#");
  if (commentIdx > 0) {
    skipComment({ s: value, p: commentIdx, d: 0 });
    value = value.slice(0, commentIdx);
  }
  return value.trimEnd();
}
function parseValue(ctx, integersAsBigInt, end) {
  let ptr = ctx.p;
  let err = { toml: ctx.s, ptr };
  skipUntil(ctx, 44, end);
  let value = sliceAndTrimEndOf(ctx, ptr, ctx.p);
  if (!value)
    throw new TomlError("incomplete declaration: value expected", err);
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
      throw new TomlError("leading zeroes are not allowed", err);
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", err);
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", err);
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid())
    throw new TomlError("invalid value", err);
  return date;
}
var INT_REGEX, FLOAT_REGEX, LEADING_ZERO;
var init_primitive = __esm(() => {
  init_date();
  init_error();
  init_util();
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
  INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
  FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
  LEADING_ZERO = /^[+-]?0[0-9_]/;
});

// node_modules/smol-toml/dist/extract.js
function extractValue(ctx, end, integersAsBigInt) {
  let ptr = ctx.p;
  let c = ctx.s.charCodeAt(ptr);
  if (c === 91 || c === 123) {
    if (!ctx.d--) {
      throw new TomlError("document contains excessively nested structures. aborting.", {
        toml: ctx.s,
        ptr
      });
    }
    let value = c === 91 ? parseArray(ctx, integersAsBigInt) : parseInlineTable(ctx, integersAsBigInt);
    ctx.d++;
    return value;
  }
  if (c === 34 || c === 39) {
    return parseString(ctx);
  }
  if (c === 116) {
    if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
      throw new TomlError("invalid value", { toml: ctx.s, ptr });
    ctx.p++;
    return true;
  }
  if (c === 102) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
      throw new TomlError("invalid value", { toml: ctx.s, ptr });
    ctx.p++;
    return false;
  }
  return parseValue(ctx, integersAsBigInt, end);
}
var init_extract = __esm(() => {
  init_primitive();
  init_struct();
  init_error();
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
});

// node_modules/smol-toml/dist/struct.js
function parseKey(ctx, end = "=") {
  let start = ctx.p;
  let dot = start - 1;
  let parsed = [];
  let endPtr = ctx.s.indexOf(end, start);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: ctx.s,
      ptr: start
    });
  }
  do {
    let c = ctx.s.charCodeAt(ctx.p = ++dot);
    if (c !== 32 && c !== 9) {
      if (c === 34 || c === 39) {
        if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2)) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        let part = parseString(ctx);
        dot = ctx.s.indexOf(".", ctx.p);
        let strEnd = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: ctx.s,
            ptr: newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        if (endPtr < ctx.p) {
          endPtr = ctx.s.indexOf(end, ctx.p);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: ctx.s,
              ptr: start
            });
          }
        }
        parsed.push(part);
      } else {
        dot = ctx.s.indexOf(".", ctx.p);
        let part = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  ctx.p = endPtr + 1;
  skipVoid(ctx, true, true);
  return parsed;
}
function parseInlineTable(ctx, integersAsBigInt) {
  let res = {};
  let seen = new Set;
  let c;
  ctx.p++;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
      ctx.p++;
      return res;
    }
    let k;
    let t = res;
    let hasOwn = false;
    let p = ctx.p;
    let key = parseKey(ctx);
    for (let i = 0;i < key.length; i++) {
      if (i)
        t = hasOwn ? t[k] : t[k] = {};
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: ctx.s,
          ptr: p
        });
      }
      if (!hasOwn && k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
      }
    }
    if (hasOwn) {
      throw new TomlError("trying to redefine an already defined value", {
        toml: ctx.s,
        ptr: ctx.p
      });
    }
    let value = extractValue(ctx, 125, integersAsBigInt);
    seen.add(t[k] = value);
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
      return res;
    }
    if (c !== 44) {
      throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
    }
  }
  throw new TomlError("unfinished table encountered", {
    toml: ctx.s,
    ptr: ctx.p
  });
}
function parseArray(ctx, integersAsBigInt) {
  let res = [];
  let c;
  ctx.p++;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
      ctx.p++;
      return res;
    }
    res.push(extractValue(ctx, 93, integersAsBigInt));
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
      return res;
    }
    if (c !== 44) {
      throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
    }
  }
  throw new TomlError("unfinished array encountered", {
    toml: ctx.s,
    ptr: ctx.p
  });
}
var KEY_PART_RE;
var init_struct = __esm(() => {
  init_primitive();
  init_extract();
  init_util();
  init_error();
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
  KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
});

// node_modules/smol-toml/dist/parse.js
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
  let ctx = { s: toml, p: 0, d: maxDepth };
  let res = {};
  let meta = {};
  let tmp;
  let tbl = res;
  let m = meta;
  skipVoid(ctx);
  while (ctx.p < toml.length) {
    if (toml.charCodeAt(ctx.p) === 91) {
      let isTableArray = toml.charCodeAt(++ctx.p) === 91;
      tmp = ctx.p += +isTableArray;
      let k = parseKey(ctx, "]");
      if (isTableArray) {
        if (toml.charCodeAt(ctx.p - 1) !== 93) {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: ctx.p - 1
          });
        }
        ctx.p++;
      }
      let p = peekTable(k, res, meta, isTableArray ? 2 : 1);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr: tmp
        });
      }
      m = p[2];
      tbl = p[1];
    } else {
      tmp = ctx.p;
      let k = parseKey(ctx);
      let p = peekTable(k, tbl, m, 0);
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr: tmp
        });
      }
      p[1][p[0]] = extractValue(ctx, undefined, integersAsBigInt);
    }
    skipVoid(ctx, true);
    if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && tmp !== 13) {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr: ctx.p
      });
    }
    skipVoid(ctx);
  }
  return res;
}
var init_parse = __esm(() => {
  init_struct();
  init_extract();
  init_util();
  init_error();
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
});

// node_modules/smol-toml/dist/stringify.js
var init_stringify = __esm(() => {
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
});

// node_modules/smol-toml/dist/index.js
var init_dist = __esm(() => {
  init_parse();
  init_stringify();
  init_date();
  init_error();
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
});

// src/log.ts
function setDebugEnabled(enabled) {
  _configDebugEnabled = enabled;
}
var _configDebugEnabled = false, log;
var init_log = __esm(() => {
  log = {
    info: (msg) => {
      process.stderr.write(`[mcp-recall] info: ${msg}
`);
    },
    warn: (msg) => {
      process.stderr.write(`[mcp-recall] warn: ${msg}
`);
    },
    error: (msg) => {
      process.stderr.write(`[mcp-recall] error: ${msg}
`);
    },
    debug: (msg) => {
      if (process.env.RECALL_DEBUG === "1" || _configDebugEnabled) {
        process.stderr.write(`[mcp-recall] debug: ${msg}
`);
      }
    }
  };
});

// node_modules/zod/v4/core/util.js
var exports_util = {};
__export(exports_util, {
  unwrapMessage: () => unwrapMessage,
  uint8ArrayToHex: () => uint8ArrayToHex,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  toZod: () => toZod,
  stringifyPrimitive: () => stringifyPrimitive,
  slugify: () => slugify,
  sizeCaps: () => sizeCaps,
  shallowClone: () => shallowClone,
  safeExtend: () => safeExtend,
  required: () => required,
  rawShape: () => rawShape,
  randomString: () => randomString,
  propertyKeyTypes: () => propertyKeyTypes,
  promiseAllObject: () => promiseAllObject,
  primitiveTypes: () => primitiveTypes,
  prefixIssues: () => prefixIssues,
  pick: () => pick,
  partial: () => partial,
  parsedType: () => parsedType,
  own: () => own,
  optionalKeys: () => optionalKeys,
  omit: () => omit,
  objectClone: () => objectClone,
  numKeys: () => numKeys,
  nullish: () => nullish,
  normalizeParams: () => normalizeParams,
  mergeDefs: () => mergeDefs,
  merge: () => merge,
  members: () => members,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  joinValues: () => joinValues,
  issue: () => issue,
  isPlainObject: () => isPlainObject,
  isObject: () => isObject,
  installLazyProp: () => installLazyProp,
  hide: () => hide,
  hexToUint8Array: () => hexToUint8Array,
  getSizableOrigin: () => getSizableOrigin,
  getParsedType: () => getParsedType,
  getLengthableOrigin: () => getLengthableOrigin,
  getEnumValues: () => getEnumValues,
  getElementAtPath: () => getElementAtPath,
  floatSafeRemainder: () => floatSafeRemainder,
  finalizeIssue: () => finalizeIssue,
  extend: () => extend,
  explicitlyAborted: () => explicitlyAborted,
  escapeRegex: () => escapeRegex,
  esc: () => esc,
  derived: () => derived,
  defineLazyInternal: () => defineLazyInternal,
  defineLazy: () => defineLazy,
  createTransparentProxy: () => createTransparentProxy,
  constantCatch: () => constantCatch,
  codePointLength: () => codePointLength,
  cloneDef: () => cloneDef,
  clone: () => clone,
  cleanRegex: () => cleanRegex,
  cleanEnum: () => cleanEnum,
  captureStackTrace: () => captureStackTrace,
  cached: () => cached,
  base64urlToUint8Array: () => base64urlToUint8Array,
  base64ToUint8Array: () => base64ToUint8Array,
  attachSchema: () => attachSchema,
  assignProp: () => assignProp,
  assertNotEqual: () => assertNotEqual,
  assertNever: () => assertNever,
  assertIs: () => assertIs,
  assertEqual: () => assertEqual,
  assert: () => assert,
  allowsEval: () => allowsEval,
  aborted: () => aborted,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  Class: () => Class,
  CONSTANT_CATCH: () => CONSTANT_CATCH,
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function toZod() {
  return (schema) => schema;
}
function assertIs(_arg) {}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_) {}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array, separator = "|") {
  return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}

class Cached {
  constructor(getter) {
    this._getter = getter;
    this._value = undefined;
  }
  get value() {
    const getter = this._getter;
    if (getter !== undefined) {
      this._value = getter();
      this._getter = undefined;
    }
    return this._value;
  }
}
function cached(getter) {
  return new Cached(getter);
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
function defineLazy(object, key, getter) {
  let value = undefined;
  Object.defineProperty(object, key, {
    get() {
      if (value === EVALUATING) {
        return;
      }
      if (value === undefined) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object, key, {
        value: v
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function rawShape(def) {
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  return desc?.get ? desc.get.raw : desc?.value;
}
function sourceShape(schema) {
  return rawShape(schema._zod.def) ?? schema._zod.def.shape;
}
function deferProp(target, key, getter) {
  Object.defineProperty(target, key, {
    get() {
      const value = getter();
      assignProp(this, key, value);
      return value;
    },
    enumerable: true,
    configurable: true
  });
}
function putProp(target, key, value) {
  if (key in target)
    assignProp(target, key, value);
  else
    target[key] = value;
}
function mirrorShape(target, source, keys, wrap) {
  const raw = sourceShape(source);
  for (const key of keys) {
    const desc = Object.getOwnPropertyDescriptor(raw, key);
    if (!desc.enumerable)
      continue;
    if (desc.get) {
      deferProp(target, key, () => {
        const value = source._zod.def.shape[key];
        return wrap ? wrap(value, key) : value;
      });
    } else
      putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
  }
}
function mirrorProps(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (!desc.enumerable)
      continue;
    if (desc.get)
      deferProp(target, key, () => source[key]);
    else
      putProp(target, key, desc.value);
  }
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key) => promisesObj[key]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0;i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0;i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === undefined)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      keyCount++;
    }
  }
  return keyCount;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== undefined && shape[k]._zod.optout === "optional";
  });
}
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const newShape = {};
  mirrorShape(newShape, schema, maskedKeys(schema, mask));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function maskedKeys(schema, mask) {
  const raw = sourceShape(schema);
  const keys = [];
  for (const key of Reflect.ownKeys(mask)) {
    if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) {
      throw new Error(`Unrecognized key: "${String(key)}"`);
    }
    if (mask[key])
      keys.push(key);
  }
  return keys;
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const omitted = new Set(maskedKeys(schema, mask));
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = sourceShape(schema);
    for (const key of Reflect.ownKeys(shape)) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function extended(schema, shape) {
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
  mirrorProps(newShape, shape);
  return newShape;
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function merge(a, b) {
  if (!b?._zod?.def) {
    throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
  }
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const newShape = {};
  mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
  mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
  const def = mergeDefs(a._zod.def, {
    shape: newShape,
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class, schema, mask, name = "partial") {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
  }
  const selected = mask ? new Set(maskedKeys(schema, mask)) : undefined;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({ type: "optional", innerType: value })));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape, checks: [] }));
}
function required(Class, schema, mask) {
  const selected = mask ? new Set(maskedKeys(schema, mask)) : undefined;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({ type: "nonoptional", innerType: value }));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function sizeCaps(defChecks) {
  const caps = [];
  for (const ch of defChecks ?? []) {
    const d = ch._zod.def;
    if (!/_(length|size)$|_equals$/.test(d.check))
      break;
    const max = d.maximum ?? d.length ?? d.size;
    if (max >= 0)
      caps.push([max, ch]);
  }
  return caps;
}
function attachSchema(issues, start, inst) {
  var _a;
  for (let i = start;i < issues.length; i++) {
    (_a = issues[i]).schema ?? (_a.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config) {
  var _a;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a = iss).schema ?? (_a.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : undefined;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
function codePointLength(str) {
  const units = str.length;
  if (!highSurrogate.test(str))
    return units;
  let count = units;
  for (let i = 0;i < units - 1; i++) {
    if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
      count--;
      i++;
    }
  }
  return count;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0;i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0;i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  return base64ToUint8Array(base64 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0;i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

class Class {
  constructor(..._args) {}
}
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
function derived(computes, table) {
  for (const key in computes) {
    const compute = computes[key];
    Object.defineProperty(table, key, {
      configurable: true,
      enumerable: true,
      get() {
        return own(this, key, compute(this));
      },
      set(value) {
        own(this, key, value);
      }
    });
  }
  return table;
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? undefined : proto;
}
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = undefined;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key, make, enumerable) {
  const proto = claim(inst, key);
  if (!proto)
    return;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: undefined };
      Object.defineProperty(this, key, desc);
      desc.value = make(this);
      Object.defineProperty(this, key, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
    }
  });
}
function constantCatch(value) {
  const fn = () => value;
  fn[CONSTANT_CATCH] = true;
  return fn;
}
var EVALUATING, captureStackTrace, allowsEval, getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
}, propertyKeyTypes, primitiveTypes, NUMBER_FORMAT_RANGES, BIGINT_FORMAT_RANGES, highSurrogate, installing, broke = false, breaker, CONSTANT_CATCH = "~constantCatch";
var init_util2 = __esm(() => {
  init_core();
  EVALUATING = /* @__PURE__ */ Symbol("evaluating");
  captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
  allowsEval = /* @__PURE__ */ cached(() => {
    if (globalConfig.jitless) {
      return false;
    }
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
      return false;
    }
    try {
      const F = Function;
      new F("");
      return true;
    } catch (_) {
      return false;
    }
  });
  propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
  primitiveTypes = /* @__PURE__ */ new Set([
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol",
    "undefined"
  ]);
  NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
    safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    int32: [-2147483648, 2147483647],
    uint32: [0, 4294967295],
    float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
    float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
  }))();
  BIGINT_FORMAT_RANGES = {
    int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
    uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
  };
  highSurrogate = /[\uD800-\uDBFF]/;
  breaker = {
    configurable: true,
    get() {
      broke = true;
      return;
    }
  };
});

// node_modules/zod/v4/core/core.js
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition;
      }
      try {
        return new Definition;
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition;
}
function $constructor(name, initializer, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = new Set;
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && new WeakSet;
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = undefined;
      }
    } else if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    if (initialized) {
      const own2 = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own2;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own2;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto2 = _.prototype;
    for (const k in proto2) {
      if (!Object.prototype.hasOwnProperty.call(proto2, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto2[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = undefined;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
var _a, _zodDesc, _E, $ZodAsyncError, $ZodEncodeError, globalConfig;
var init_core = __esm(() => {
  init_util2();
  _zodDesc = { value: undefined, enumerable: false };
  _E = "captureStackTrace" in Error ? Error : null;
  $ZodAsyncError = class $ZodAsyncError extends Error {
    constructor() {
      super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
  };
  $ZodEncodeError = class $ZodEncodeError extends Error {
    constructor(name) {
      super(`Encountered unidirectional transform during encode: ${name}`);
      this.name = "ZodEncodeError";
    }
  };
  (_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
  globalConfig = globalThis.__zod_globalConfig;
});

// node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
function node(obj, key, make) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    if (key === "__proto__") {
      Object.defineProperty(obj, key, { value: make(), writable: true, enumerable: true, configurable: true });
    } else {
      obj[key] = make();
    }
  }
  return obj[key];
}
function flattenError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error2, path = []) => {
    for (const issue2 of error2.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (el === "_errors") {
              if (terminal)
                curr._errors.push(mapper(issue2));
              i++;
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(curr, el)) {
              Object.defineProperty(curr, el, {
                value: { _errors: [] },
                enumerable: true,
                writable: true,
                configurable: true
              });
            }
            const node2 = curr[el];
            if (terminal) {
              node2._errors.push(mapper(issue2));
            }
            curr = node2;
            i++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}
var _messageDesc, _issuesDesc, _installedToString, initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = undefined;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
}, $ZodError, $ZodRealError;
var init_errors = __esm(() => {
  init_core();
  init_util2();
  _messageDesc = {
    get: _getMessage,
    set: _setMessage,
    enumerable: true,
    configurable: true
  };
  _issuesDesc = { value: undefined, enumerable: false };
  _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
  $ZodError = $constructor("$ZodError", initializer);
  $ZodRealError = $constructor("$ZodError", initializer, undefined, {
    Parent: Error
  });
});

// node_modules/zod/v4/core/parse.js
function finalizeParams(callee, params) {
  return { callee: params?.callee ?? callee, Err: params?.Err };
}
function failure(Err, issues, ctx) {
  let error;
  return {
    success: false,
    get error() {
      if (!error) {
        error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = undefined;
        ctx = undefined;
      }
      return error;
    },
    set error(e) {
      error = e;
      issues = undefined;
      ctx = undefined;
    }
  };
}
function validateFallback(schema, value, _ctx) {
  const ctx = _ctx ? { ..._ctx, async: false, abortEarly: true } : { async: false, abortEarly: true };
  const fallbackRun = schema._zod.bag.fallbackRun;
  let result;
  if (fallbackRun) {
    ctx[COMPILE_FALLBACK] = true;
    result = fallbackRun({ value, issues: [] }, ctx);
  } else {
    result = schema._zod.run({ value, issues: [] }, ctx);
  }
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length === 0;
}
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError;
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
}, _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
}, _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
}, _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
}, COMPILE_INVALID, COMPILE_FALLBACK, validate = (schema, value, _ctx) => {
  const validator = schema._zod.bag.validator;
  if (validator !== undefined) {
    if (validator(value) !== COMPILE_INVALID)
      return true;
    if (validator.definite === true && _ctx === undefined)
      return false;
  }
  return validateFallback(schema, value, _ctx);
}, validateAsync = async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true, abortEarly: true } : { async: true, abortEarly: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length === 0;
}, _encode = (_Err) => {
  const parse2 = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return parse2(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
}, _decode = (_Err) => {
  const parse2 = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    return parse2(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
}, _encodeAsync = (_Err) => {
  const parseAsync = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
}, _decodeAsync = (_Err) => {
  const parseAsync = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
}, _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
}, _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
}, _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
}, _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
var init_parse2 = __esm(() => {
  init_core();
  init_util2();
  COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
  COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
});

// node_modules/zod/v4/core/regexes.js
function nanoidOfLength(length) {
  return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
}
function emoji() {
  return new RegExp(_emoji, "u");
}
function anchor(source) {
  return new RegExp(`^${source}$`);
}
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const opts = ["Z"];
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const qualified = `${timeSource({ precision: args.precision, seconds: true })}(?:${opts.join("|")})`;
  const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var cuid, cuid2, ulid, xid, ksuid, nanoid, duration, guid, uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
}, email, _emoji = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`, ipv4, ipv6, cidrv4, cidrv6, base64, base64url, httpProtocol, e164, dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`, date, anyString, number, boolean, lowercase, uppercase;
var init_regexes = __esm(() => {
  cuid = /^[cC][0-9a-z]{6,}$/;
  cuid2 = /^[0-9a-z]+$/;
  ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
  xid = /^[0-9a-vA-V]{20}$/;
  ksuid = /^[A-Za-z0-9]{27}$/;
  nanoid = /^[a-zA-Z0-9_-]{21}$/;
  duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
  guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
  email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
  ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
  cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
  cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
  base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
  httpProtocol = /^https?$/;
  e164 = /^\+[1-9]\d{6,14}$/;
  date = /* @__PURE__ */ anchor(dateSource);
  anyString = /^[\s\S]{0,}$/;
  number = /^-?\d+(?:\.\d+)?$/;
  boolean = /^(?:true|false)$/i;
  lowercase = /^[^A-Z]*$/;
  uppercase = /^[^a-z]*$/;
});

// node_modules/zod/v4/core/checks.js
var $ZodCheck, _whenHasLength = (payload) => {
  const val = payload.value;
  return !nullish(val) && val.length !== undefined;
}, numericOriginMap, $ZodCheckLessThan, $ZodCheckGreaterThan, $ZodCheckMultipleOf, $ZodCheckNumberFormat, $ZodCheckMaxLength, $ZodCheckMinLength, $ZodCheckLengthEquals, $ZodCheckStringFormat, $ZodCheckRegex, $ZodCheckLowerCase, $ZodCheckUpperCase, $ZodCheckIncludes, $ZodCheckStartsWith, $ZodCheckEndsWith, $ZodCheckOverwrite;
var init_checks = __esm(() => {
  init_core();
  init_regexes();
  init_util2();
  $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
    var _a2;
    inst._zod ?? (inst._zod = {});
    inst._zod.def = def;
    (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
  });
  numericOriginMap = {
    number: "number",
    bigint: "bigint",
    object: "date"
  };
  $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
        return;
      }
      payload.issues.push({
        origin: numericOriginMap[typeof payload.value] ?? origin,
        code: "too_big",
        maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
        return;
      }
      payload.issues.push({
        origin: numericOriginMap[typeof payload.value] ?? origin,
        code: "too_small",
        minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      if (typeof payload.value !== typeof def.value)
        throw new Error("Cannot mix number and bigint in multiple_of check.");
      const isMultiple = typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
      if (isMultiple)
        return;
      payload.issues.push({
        origin: typeof payload.value,
        code: "not_multiple_of",
        divisor: def.value,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
    $ZodCheck.init(inst, def);
    def.format = def.format || "float64";
    const isInt = def.format?.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
    inst._zod.check = (payload) => {
      const input = payload.value;
      if (isInt) {
        if (!Number.isInteger(input)) {
          payload.issues.push({
            expected: origin,
            format: def.format,
            code: "invalid_type",
            continue: false,
            input,
            inst
          });
          return;
        }
        if (!Number.isSafeInteger(input)) {
          if (input > 0) {
            payload.issues.push({
              input,
              code: "too_big",
              maximum: Number.MAX_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort
            });
          } else {
            payload.issues.push({
              input,
              code: "too_small",
              minimum: Number.MIN_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort
            });
          }
          return;
        }
      }
      if (input < minimum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_small",
          minimum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
      if (input > maximum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_big",
          maximum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units > def.maximum ? codePointLength(input) : units;
      if (length <= def.maximum)
        return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_big",
        maximum: def.maximum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
      if (length >= def.minimum)
        return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_small",
        minimum: def.minimum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
      if (length === def.length)
        return;
      const origin = getLengthableOrigin(input);
      const tooBig = length > def.length;
      payload.issues.push({
        origin,
        ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
        inclusive: true,
        exact: true,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
    var _a2, _b;
    $ZodCheck.init(inst, def);
    if (def.pattern)
      (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: def.format,
          input: payload.value,
          ...def.pattern ? { pattern: def.pattern.toString() } : {},
          inst,
          continue: !def.abort
        });
      });
    else
      (_b = inst._zod).check ?? (_b.check = () => {});
  });
  $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "regex",
        input: payload.value,
        pattern: def.pattern.toString(),
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
    def.pattern ?? (def.pattern = lowercase);
    $ZodCheckStringFormat.init(inst, def);
  });
  $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
    def.pattern ?? (def.pattern = uppercase);
    $ZodCheckStringFormat.init(inst, def);
  });
  $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
    $ZodCheck.init(inst, def);
    const escapedRegex = escapeRegex(def.includes);
    const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
    def.pattern = pattern;
    inst._zod.check = (payload) => {
      if (payload.value.includes(def.includes, def.position))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "includes",
        includes: def.includes,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.check = (payload) => {
      if (payload.value.startsWith(def.prefix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "starts_with",
        prefix: def.prefix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.check = (payload) => {
      if (payload.value.endsWith(def.suffix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "ends_with",
        suffix: def.suffix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      payload.value = def.tx(payload.value);
    };
  });
});

// node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = [], closed = {}) {
    this.content = [];
    this.indent = 0;
    this.args = args;
    this.closed = closed;
  }
  indented(fn) {
    this.indent += 1;
    try {
      fn(this);
    } finally {
      this.indent -= 1;
    }
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const content = this?.content ?? [``];
    const factory = new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {
${content.join(`
`)}
};`);
    return factory(...Object.values(this.closed));
  }
}

// node_modules/zod/v4/core/versions.js
var version;
var init_versions = __esm(() => {
  version = {
    major: 4,
    minor: 6,
    patch: 7
  };
});

// node_modules/zod/v4/core/schemas.js
async function validateAsync2(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {}
      return validateAsync2(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
function canParseURL(input) {
  try {
    if (typeof URL !== "undefined" && typeof URL.canParse === "function")
      return URL.canParse(input);
    new URL(input);
    return true;
  } catch {
    return false;
  }
}
function validateURL(trimmed, def) {
  if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) {
    return canParseURL(trimmed) || URL_UNPARSEABLE;
  }
  return parseURLObject(trimmed, def);
}
function parseURLObject(trimmed, def) {
  if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) {
    return URL_BAD_FORMAT;
  }
  try {
    if (typeof URL !== "undefined") {
      const URLStatic = URL;
      if (typeof URLStatic.parse === "function")
        return URLStatic.parse(trimmed) ?? URL_UNPARSEABLE;
    }
    return new URL(trimmed);
  } catch {
    return URL_UNPARSEABLE;
  }
}
function stripTabAndNewline(value) {
  return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
  hostname.lastIndex = 0;
  return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
  protocol.lastIndex = 0;
  return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
function isValidIPv6(value) {
  if (!ipv6Alphabet.test(value))
    return false;
  return canParseURL(`http://[${value}]`);
}
function isValidCIDRv6(value) {
  const parts = value.split("/");
  if (parts.length !== 2)
    return false;
  const [address, prefix] = parts;
  if (!prefix)
    return false;
  const prefixNum = Number(prefix);
  if (`${prefixNum}` !== prefix)
    return false;
  if (prefixNum < 0 || prefixNum > 128)
    return false;
  return isValidIPv6(address);
}
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
function isValidBase64URL(data) {
  if (!base64urlCharset.test(data))
    return false;
  const base642 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
function capSize(inst, size) {
  const caps = sizeCaps(inst._zod.def.checks);
  if (!caps.length)
    return;
  const cap = Math.min(...caps.map((c) => c[0]));
  const parse2 = inst._zod.parse;
  inst._zod.parse = (payload, ctx) => {
    const n = size(payload.value);
    if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
      for (const [max, ch] of sizeCaps(inst._zod.def.checks)) {
        if (n > max && ch._zod.def.when(payload)) {
          const start = payload.issues.length;
          ch._zod.check(payload);
          payload.issues[start].continue = false;
          attachSchema(payload.issues, start, inst);
          return payload;
        }
      }
    }
    return parse2(payload, ctx);
  };
}
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
function handlePropertyResult(result, final, key, input, optin, optout) {
  const isPresent = key in input;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result.issues.length) {
    if (optin !== undefined && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && optin === undefined) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: undefined,
        path: [key]
      });
    }
    return;
  }
  if (result.value === undefined) {
    if (isPresent || optin === "defaulted" && !isOptionalOut) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  let seen = 0;
  for (const key in input) {
    if (abortEarly && payload.issues.length !== seen) {
      if (aborted(payload, seen))
        break;
      seen = payload.issues.length;
    }
    if (keySet.has(key))
      continue;
    if (key === "__proto__") {
      if (t === "never")
        unrecognized.push(key);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key, input, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
      delete newObj.__proto__;
    for (const key of sharedKeys) {
      if (key === "__proto__")
        continue;
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = new Map;
  let unrecIssue;
  const keyIssues = new Map;
  const collect = (iss, side) => {
    let keys;
    if (iss.code === "unrecognized_keys" && !iss.path?.length) {
      unrecIssue ?? (unrecIssue = iss);
      keys = iss.keys;
    } else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
      const k = String(iss.path[0]);
      if (!keyIssues.has(k))
        keyIssues.set(k, iss);
      keys = [k];
    } else {
      return false;
    }
    for (const k of keys) {
      if (!unrecKeys.has(k))
        unrecKeys.set(k, {});
      unrecKeys.get(k)[side] = true;
    }
    return true;
  };
  for (const iss of left.issues) {
    if (!collect(iss, "l"))
      result.issues.push(iss);
  }
  for (const iss of right.issues) {
    if (!collect(iss, "r"))
      result.issues.push(iss);
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length) {
    const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
    if (aggregated.length)
      result.issues.push({ ...unrecIssue, keys: aggregated });
    for (const k of bothKeys) {
      if (!aggregated.includes(k) && keyIssues.has(k))
        result.issues.push(keyIssues.get(k));
    }
  }
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    if (aborted(result))
      return result;
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
function handleOptionalResult(payload, result) {
  payload.value = result.issues.length ? undefined : result.value;
  return payload;
}
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
function handleCatchResult(payload, result, def, ctx) {
  if (!result.issues.length) {
    payload.value = result.value;
    if (result.memo)
      payload.memo = true;
    return payload;
  }
  payload.value = def.catchValue({
    ...result,
    value: payload.value,
    error: {
      issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    },
    input: payload.value
  });
  return payload;
}
function handlePipeResult(left, next, ctx) {
  if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues }, ctx);
}
function handleReadonlyResult(payload) {
  if (!payload.memo)
    payload.value = Object.freeze(payload.value);
  return payload;
}
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
var $ZodType, toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value }, $ZodString, $ZodStringFormat, $ZodGUID, $ZodUUID, $ZodEmail, URL_BAD_FORMAT = 1, URL_UNPARSEABLE = 2, asciiTabOrNewline, $ZodURL, $ZodEmoji, $ZodNanoID, $ZodCUID, $ZodCUID2, $ZodULID, $ZodXID, $ZodKSUID, $ZodISODateTime, $ZodISODate, $ZodISOTime, $ZodISODuration, $ZodIPv4, ipv6Alphabet, $ZodIPv6, $ZodCIDRv4, $ZodCIDRv6, base64Charset, $ZodBase64, base64urlCharset, $ZodBase64URL, $ZodE164, $ZodJWT, $ZodNumber, $ZodNumberFormat, $ZodBoolean, $ZodUnknown, $ZodNever, arraySize = (input) => Array.isArray(input) ? input.length : -1, $ZodArray, NO_SYMBOL_KEYS, $ZodObject, $ZodObjectJIT, $ZodUnion, $ZodIntersection, $ZodEnum, $ZodTransform, $ZodOptional, $ZodExactOptional, $ZodNullable, $ZodDefault, $ZodPrefault, $ZodNonOptional, $ZodCatch, $ZodPipe, $ZodReadonly, $ZodCustom;
var init_schemas = __esm(() => {
  init_checks();
  init_core();
  init_regexes();
  init_util2();
  init_versions();
  init_util2();
  $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
    var _a2;
    inst ?? (inst = {});
    inst._zod.def = def;
    inst._zod.bag = inst._zod.bag || {};
    inst._zod.version = version;
    const defChecks = inst._zod.def.checks;
    const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
    for (const ch of checks) {
      for (const fn of ch._zod.onattach) {
        fn(inst);
      }
    }
    if (checks.length === 0) {
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred?.push(() => {
        inst._zod.run = inst._zod.parse;
      });
    } else {
      const runChecks = (payload, checks2, ctx) => {
        if (payload.memo)
          return payload;
        let isAborted = aborted(payload);
        let asyncResult;
        for (const ch of checks2) {
          if (ch._zod.def.when) {
            if (explicitlyAborted(payload))
              continue;
            const shouldRun = ch._zod.def.when(payload);
            if (!shouldRun)
              continue;
          } else if (isAborted) {
            continue;
          }
          const currLen = payload.issues.length;
          const _ = ch._zod.check(payload);
          if (_ instanceof Promise && ctx?.async === false) {
            throw new $ZodAsyncError;
          }
          if (asyncResult || _ instanceof Promise) {
            asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
              await _;
              const nextLen = payload.issues.length;
              if (nextLen === currLen)
                return;
              attachSchema(payload.issues, currLen, inst);
              if (!isAborted)
                isAborted = aborted(payload, currLen);
            });
          } else {
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              continue;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          }
        }
        if (asyncResult) {
          return asyncResult.then(() => {
            return payload;
          });
        }
        return payload;
      };
      const handleCanaryResult = (canary, payload, ctx) => {
        if (aborted(canary)) {
          canary.aborted = true;
          return canary;
        }
        const checkResult = runChecks(payload, checks, ctx);
        if (checkResult instanceof Promise) {
          if (ctx.async === false)
            throw new $ZodAsyncError;
          return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
        }
        return inst._zod.parse(checkResult, ctx);
      };
      inst._zod.run = (payload, ctx) => {
        if (ctx.skipChecks) {
          return inst._zod.parse(payload, ctx);
        }
        if (ctx.direction === "backward") {
          const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
          if (canary instanceof Promise) {
            return canary.then((canary2) => {
              return handleCanaryResult(canary2, payload, ctx);
            });
          }
          return handleCanaryResult(canary, payload, ctx);
        }
        const result = inst._zod.parse(payload, ctx);
        if (result instanceof Promise) {
          if (ctx.async === false)
            throw new $ZodAsyncError;
          return result.then((result2) => runChecks(result2, checks, ctx));
        }
        return runChecks(result, checks, ctx);
      };
    }
  }, {
    get "~standard"() {
      return hide(this, "~standard", standardProps(this));
    },
    set "~standard"(value) {
      own(this, "~standard", value);
    }
  });
  $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = def.pattern ?? anyString;
    inst._zod.parse = (payload, _) => {
      if (def.coerce)
        try {
          payload.value = String(payload.value);
        } catch (_2) {}
      if (typeof payload.value === "string")
        return payload;
      payload.issues.push({
        expected: "string",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    $ZodString.init(inst, def);
  });
  $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
    def.pattern ?? (def.pattern = guid);
    $ZodStringFormat.init(inst, def);
  });
  $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
    if (def.version) {
      const versionMap = {
        v1: 1,
        v2: 2,
        v3: 3,
        v4: 4,
        v5: 5,
        v6: 6,
        v7: 7,
        v8: 8
      };
      const v = versionMap[def.version];
      if (v === undefined)
        throw new Error(`Invalid UUID version: "${def.version}"`);
      def.pattern ?? (def.pattern = uuid(v));
    } else
      def.pattern ?? (def.pattern = uuid());
    $ZodStringFormat.init(inst, def);
  });
  $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
    def.pattern ?? (def.pattern = email);
    $ZodStringFormat.init(inst, def);
  });
  asciiTabOrNewline = /[\t\n\r]/g;
  $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      try {
        const trimmed = payload.value.trim();
        const url = validateURL(trimmed, def);
        if (url === URL_BAD_FORMAT) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
        if (url === URL_UNPARSEABLE) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
        if (url === true) {
          payload.value = stripTabAndNewline(trimmed);
          return;
        }
        if (def.hostname && !urlHostnameOk(url, def.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
        if (def.protocol && !urlProtocolOk(url, def.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
        payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
        return;
      } catch (_) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
    def.pattern ?? (def.pattern = emoji());
    $ZodStringFormat.init(inst, def);
  });
  $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
    if (def.length !== undefined && (!Number.isInteger(def.length) || def.length < 1))
      throw new Error(`Invalid nanoid length: ${def.length}`);
    def.pattern ?? (def.pattern = def.length === undefined ? nanoid : nanoidOfLength(def.length));
    $ZodStringFormat.init(inst, def);
  });
  $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
    def.pattern ?? (def.pattern = cuid);
    $ZodStringFormat.init(inst, def);
  });
  $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
    def.pattern ?? (def.pattern = cuid2);
    $ZodStringFormat.init(inst, def);
  });
  $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
    def.pattern ?? (def.pattern = ulid);
    $ZodStringFormat.init(inst, def);
  });
  $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
    def.pattern ?? (def.pattern = xid);
    $ZodStringFormat.init(inst, def);
  });
  $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
    def.pattern ?? (def.pattern = ksuid);
    $ZodStringFormat.init(inst, def);
  });
  $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
    def.pattern ?? (def.pattern = datetime(def));
    $ZodStringFormat.init(inst, def);
  });
  $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
    def.pattern ?? (def.pattern = date);
    $ZodStringFormat.init(inst, def);
  });
  $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
    def.pattern ?? (def.pattern = time(def));
    $ZodStringFormat.init(inst, def);
  });
  $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
    def.pattern ?? (def.pattern = duration);
    $ZodStringFormat.init(inst, def);
  });
  $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
    def.pattern ?? (def.pattern = ipv4);
    $ZodStringFormat.init(inst, def);
  });
  ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
  $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
    def.pattern ?? (def.pattern = ipv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (!isValidIPv6(payload.value)) {
        payload.issues.push({
          code: "invalid_format",
          format: "ipv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv4);
    $ZodStringFormat.init(inst, def);
  });
  $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (!isValidCIDRv6(payload.value)) {
        payload.issues.push({
          code: "invalid_format",
          format: "cidrv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
  $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
    def.pattern ?? (def.pattern = base64Charset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidBase64(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  base64urlCharset = /^[A-Za-z0-9_-]*$/;
  $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
    def.pattern ?? (def.pattern = base64urlCharset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidBase64URL(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
    def.pattern ?? (def.pattern = e164);
    $ZodStringFormat.init(inst, def);
  });
  $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidJWT(payload.value, def.alg))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "jwt",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = number;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Number(payload.value);
        } catch (_) {}
      const input = payload.value;
      if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
        return payload;
      }
      const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : undefined : undefined;
      payload.issues.push({
        expected: "number",
        code: "invalid_type",
        input,
        inst,
        ...received ? { received } : {}
      });
      return payload;
    };
  });
  $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
    $ZodCheckNumberFormat.init(inst, def);
    $ZodNumber.init(inst, def);
  });
  $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = boolean;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Boolean(payload.value);
        } catch (_) {}
      const input = payload.value;
      if (typeof input === "boolean")
        return payload;
      payload.issues.push({
        expected: "boolean",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
  });
  $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      payload.issues.push({
        expected: "never",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    const memo = globalConfig.memoizer;
    memo?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!Array.isArray(input)) {
        payload.issues.push({
          expected: "array",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
      const proms = [];
      const abortEarly = ctx?.abortEarly;
      for (let i = 0;i < input.length; i++) {
        const item = input[i];
        const result = def.element._zod.run({
          value: item,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
        } else {
          handleArrayResult(result, payload, i);
          if (abortEarly && result.issues.length !== 0 && aborted(result))
            break;
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => payload);
      }
      return payload;
    };
    capSize(inst, arraySize);
  });
  NO_SYMBOL_KEYS = [];
  $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
    $ZodType.init(inst, def);
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    const sh = desc?.get ? desc.get.raw : def.shape ?? {};
    if (sh) {
      const get = () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", { value: newSh });
        get.raw = newSh;
        return newSh;
      };
      get.raw = sh;
      Object.defineProperty(def, "shape", { get });
    }
    const _normalized = cached(() => normalizeDef(def));
    defineLazyInternal(inst, "propValues", (zod) => {
      const shape = zod.def.shape;
      const propValues = {};
      for (const key in shape) {
        const field = shape[key]._zod;
        if (field.values) {
          if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
            assignProp(propValues, key, new Set);
          }
          for (const v of field.values)
            propValues[key].add(v);
          if (field.optin !== undefined)
            propValues[key].add(undefined);
        }
      }
      return propValues;
    });
    const isObject2 = isObject;
    const catchall = def.catchall;
    let value;
    const memo = globalConfig.memoizer;
    memo?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject2(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      const proms = [];
      const shape = value.shape;
      const abortEarly = ctx?.abortEarly;
      let seen = payload.issues.length;
      for (const key of value.allKeys) {
        if (abortEarly && payload.issues.length !== seen) {
          if (aborted(payload, seen))
            break;
          seen = payload.issues.length;
        }
        if (key === "__proto__")
          continue;
        const el = shape[key];
        const optin = el._zod.optin;
        const optout = el._zod.optout;
        const r = el._zod.run({ value: input[key], issues: [] }, ctx);
        if (r instanceof Promise) {
          proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, optin, optout)));
        } else {
          handlePropertyResult(r, payload, key, input, optin, optout);
        }
      }
      if (!catchall) {
        return proms.length ? Promise.all(proms).then(() => payload) : payload;
      }
      return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
    };
  });
  $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
    $ZodObject.init(inst, def);
    const superParse = inst._zod.parse;
    const _normalized = cached(() => normalizeDef(def));
    const memo = globalConfig.memoizer;
    const generateFastpass = (shape) => {
      const normalized = _normalized.value;
      const syms = normalized.symbolKeys;
      const doc = new Doc(["payload", "ctx"], { shape, inst, memo, syms });
      const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
      const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
      doc.write(`const input = payload.value;`);
      const ids = Object.create(null);
      let counter = 0;
      for (const key of normalized.allKeys) {
        ids[key] = `key_${counter++}`;
      }
      doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
      for (const key of normalized.allKeys) {
        if (key === "__proto__")
          continue;
        const id = ids[key];
        const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
        const isPresent = `${k} in input`;
        const schema = shape[key];
        const optin = schema?._zod?.optin;
        const isOptionalIn = optin !== undefined;
        const isOptionalOut = schema?._zod?.optout === "optional";
        doc.write(`const ${id} = ${parseStr(k)};`);
        if (isOptionalIn && isOptionalOut) {
          const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
          doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
        } else if (!isOptionalIn) {
          doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
        } else {
          doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
          if (optin === "defaulted") {
            doc.write(`newResult[${k}] = ${id}.value;`);
          } else {
            doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
          }
        }
      }
      doc.write(`payload.value = newResult;`);
      doc.write(`return payload;`);
      return doc.compile();
    };
    let fastpass;
    const isObject2 = isObject;
    const jit = !globalConfig.jitless;
    const allowsEval2 = allowsEval;
    const fastEnabled = jit && allowsEval2.value;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject2(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
        if (!fastpass)
          fastpass = generateFastpass(def.shape);
        payload = fastpass(payload, ctx);
        if (!catchall)
          return payload;
        return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
      }
      return superParse(payload, ctx);
    };
  });
  $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== undefined) ? "optional" : undefined);
    defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
    defineLazyInternal(inst, "values", (zod) => {
      if (zod.def.options.every((o) => o._zod.values)) {
        return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
      }
      return;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
      if (zod.def.options.every((o) => o._zod.pattern)) {
        const patterns = zod.def.options.map((o) => o._zod.pattern);
        return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
      }
      return;
    });
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
      if (first) {
        return first(payload, ctx);
      }
      let async = false;
      const results = [];
      for (const option of def.options) {
        const result = option._zod.run({
          value: payload.value,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          results.push(result);
          async = true;
        } else {
          if (result.issues.length === 0)
            return result;
          results.push(result);
        }
      }
      if (!async)
        return handleUnionResults(results, payload, inst, ctx);
      return Promise.all(results).then((results2) => {
        return handleUnionResults(results2, payload, inst, ctx);
      });
    };
  });
  $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      const left = def.left._zod.run({ value: input, issues: [] }, ctx);
      const right = def.right._zod.run({ value: input, issues: [] }, ctx);
      const async = left instanceof Promise || right instanceof Promise;
      if (async) {
        return Promise.all([left, right]).then(([left2, right2]) => {
          return handleIntersectionResults(payload, left2, right2);
        });
      }
      return handleIntersectionResults(payload, left, right);
    };
  });
  $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
    $ZodType.init(inst, def);
    const values = getEnumValues(def.entries);
    const valuesSet = new Set(values);
    inst._zod.values = valuesSet;
    defineLazyInternal(inst, "pattern", (zod) => {
      const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
      return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
    });
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (valuesSet.has(input)) {
        return payload;
      }
      payload.issues.push({
        code: "invalid_value",
        values,
        input,
        inst
      });
      return payload;
    };
  });
  $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    globalConfig.memoizer?.guard(inst);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        throw new $ZodEncodeError(inst.constructor.name);
      }
      const _out = def.transform(payload.value, payload);
      if (ctx.async) {
        const output = _out instanceof Promise ? _out : Promise.resolve(_out);
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      if (_out instanceof Promise) {
        throw new $ZodAsyncError;
      }
      payload.value = _out;
      return payload;
    };
  });
  $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    inst._zod.optout = "optional";
    defineLazyInternal(inst, "values", (zod) => {
      const values = zod.def.innerType._zod.values;
      return values ? new Set([...values, undefined]) : undefined;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
      const pattern = zod.def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === undefined) {
        if (def.innerType._zod.optin !== "defaulted")
          return payload;
        const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
        if (result instanceof Promise)
          return result.then((result2) => handleOptionalResult(payload, result2));
        return handleOptionalResult(payload, result);
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
    inst._zod.parse = (payload, ctx) => {
      return def.innerType._zod.run(payload, ctx);
    };
  });
  $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "pattern", (zod) => {
      const pattern = zod.def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
    });
    defineLazyInternal(inst, "values", (zod) => {
      return zod.def.innerType._zod.values ? new Set([...zod.def.innerType._zod.values, null]) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === null)
        return payload;
      return def.innerType._zod.run(payload, ctx);
    };
  });
  $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      if (payload.value === undefined) {
        payload.value = def.defaultValue;
        return payload;
      }
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleDefaultResult(result2, def));
      }
      return handleDefaultResult(result, def);
    };
  });
  $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      if (payload.value === undefined) {
        payload.value = def.defaultValue;
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => {
      const v = zod.def.innerType._zod.values;
      return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleNonOptionalResult(result2, inst));
      }
      return handleNonOptionalResult(result, inst);
    };
  });
  $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleCatchResult(payload, result2, def, ctx));
      }
      return handleCatchResult(payload, result, def, ctx);
    };
  });
  $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
    defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        const right = def.out._zod.run(payload, ctx);
        if (right instanceof Promise) {
          return right.then((right2) => handlePipeResult(right2, def.in, ctx));
        }
        return handlePipeResult(right, def.in, ctx);
      }
      const left = def.in._zod.run(payload, ctx);
      if (left instanceof Promise) {
        return left.then((left2) => handlePipeResult(left2, def.out, ctx));
      }
      return handlePipeResult(left, def.out, ctx);
    };
  });
  $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then(handleReadonlyResult);
      }
      return handleReadonlyResult(result);
    };
  });
  $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
    $ZodCheck.init(inst, def);
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _) => {
      return payload;
    };
    inst._zod.check = (payload) => {
      const input = payload.value;
      const r = def.fn(input);
      if (r instanceof Promise) {
        return r.then((r2) => handleRefineResult(r2, payload, input, inst));
      }
      handleRefineResult(r, payload, input, inst);
      return;
    };
  });
});

// node_modules/zod/v4/core/memoizer.js
function isRef(value) {
  return value !== null && typeof value === "object";
}
function cloneIssues(issues) {
  return issues.map((iss) => iss.path ? { ...iss, path: iss.path.slice() } : { ...iss });
}
function isRecursive(inst, stack, resolve) {
  const cached2 = recursive.get(inst);
  if (cached2 !== undefined)
    return cached2 ? PROVEN : NONE;
  if (stack.has(inst))
    return PROVEN;
  stack.add(inst);
  let result = NONE;
  const check = (child) => {
    if (result !== PROVEN && child?._zod) {
      const answer = isRecursive(child, stack, resolve);
      if (answer > result)
        result = answer;
    }
  };
  const shape = (sh, spread) => {
    let answer = NONE;
    for (const key of Reflect.ownKeys(sh)) {
      const desc = Object.getOwnPropertyDescriptor(sh, key);
      if (spread && !desc.enumerable)
        continue;
      const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
      if (child > answer)
        answer = child;
    }
    return answer;
  };
  const merge2 = (answer) => {
    if (answer > result)
      result = answer;
  };
  const def = inst._zod.def;
  const kind = def.type;
  switch (kind) {
    case "object": {
      const raw = rawShape(def);
      merge2(raw ? shape(raw, true) : ASSUMED);
      check(def.catchall);
      break;
    }
    case "array":
      check(def.element);
      break;
    case "tuple":
      for (const el of def.items)
        check(el);
      check(def.rest);
      break;
    case "record":
    case "map":
      check(def.keyType);
      check(def.valueType);
      break;
    case "set":
      check(def.valueType);
      break;
    case "union":
      for (const el of def.options)
        check(el);
      break;
    case "intersection":
      check(def.left);
      check(def.right);
      break;
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
    case "promise":
    case "success":
      check(def.innerType);
      break;
    case "pipe":
      check(def.in);
      check(def.out);
      break;
    case "function":
      check(def.input);
      check(def.output);
      break;
    case "lazy": {
      const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : undefined);
      merge2(inner ? isRecursive(inner, stack, false) : ASSUMED);
      break;
    }
    case "template_literal":
    case "string":
    case "number":
    case "int":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
    case "null":
    case "void":
    case "never":
    case "any":
    case "unknown":
    case "date":
    case "nan":
    case "enum":
    case "literal":
    case "file":
    case "transform":
    case "custom":
      break;
    default: {
      for (const key in def) {
        const desc = Object.getOwnPropertyDescriptor(def, key);
        if (!desc || desc.get)
          continue;
        const value = desc.value;
        if (!value || typeof value !== "object")
          continue;
        if (value._zod)
          check(value);
        else if (Array.isArray(value))
          for (const el of value)
            check(el);
      }
    }
  }
  stack.delete(inst);
  return settle(inst, result);
}
function settle(inst, answer) {
  if (answer !== ASSUMED)
    recursive.set(inst, answer === PROVEN);
  return answer;
}
function bucketFor(state, inst) {
  let bucket = state.buckets.get(inst);
  if (!bucket) {
    bucket = new WeakMap;
    state.buckets.set(inst, bucket);
  }
  return bucket;
}
function memoizer() {
  return memo;
}
function isBackEdge(ctx, value) {
  const backEdges = ctx[STATE]?.backEdges;
  return backEdges !== undefined && isRef(value) && backEdges.has(value);
}
var $ZodCyclicError, STATE = "~memo", NO_ISSUES, recursive, NONE = 0, ASSUMED = 1, PROVEN = 2, handoff, open, memo;
var init_memoizer = __esm(() => {
  init_util2();
  $ZodCyclicError = class $ZodCyclicError extends Error {
    constructor() {
      super(`Cannot parse a reference cycle that closes through a transform`);
      this.name = "ZodCyclicError";
    }
  };
  NO_ISSUES = [];
  recursive = /* @__PURE__ */ new WeakMap;
  open = [];
  memo = {
    alloc(_inst, payload, empty) {
      const bucket = handoff;
      if (!bucket)
        return empty;
      handoff = undefined;
      const entry = { value: empty, issues: null };
      bucket.set(payload.value, entry);
      open.push(entry);
      return empty;
    },
    guard(inst) {
      var _a2;
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred.push(() => {
        const base = inst._zod.parse;
        const wrapped = (payload, ctx) => {
          if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value))
            throw new $ZodCyclicError;
          return base(payload, ctx);
        };
        inst._zod.parse = wrapped;
        if (inst._zod.run === base)
          inst._zod.run = wrapped;
      });
    },
    attach(inst) {
      var _a2;
      let isRecursiveInst;
      let rechecked = false;
      let lastCtx;
      let lastBucket;
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred.push(() => {
        const base = inst._zod.parse;
        const wrapped = (payload, ctx) => {
          if (isRecursiveInst === undefined) {
            const walked = isRecursive(inst, new Set, false);
            if (walked === NONE) {
              inst._zod.parse = base;
              if (inst._zod.run === wrapped)
                inst._zod.run = base;
              return base(payload, ctx);
            }
            if (walked === PROVEN || rechecked)
              isRecursiveInst = true;
            else
              rechecked = true;
          }
          const input = payload.value;
          if (!isRef(input))
            return base(payload, ctx);
          let state = ctx[STATE];
          if (!state) {
            state = { buckets: new WeakMap, backEdges: undefined };
            ctx[STATE] = state;
          }
          let bucket;
          if (lastCtx === ctx) {
            bucket = lastBucket;
          } else {
            bucket = bucketFor(state, inst);
            lastCtx = ctx;
            lastBucket = bucket;
          }
          const hit = bucket.get(input);
          if (hit) {
            payload.value = hit.value;
            if (hit.issues) {
              if (hit.issues.length)
                payload.issues.push(...cloneIssues(hit.issues));
            } else {
              payload.memo = true;
              state.backEdges ?? (state.backEdges = new WeakSet);
              state.backEdges.add(hit.value);
            }
            return payload;
          }
          handoff = bucket;
          const depth = open.length;
          const result = base(payload, ctx);
          handoff = undefined;
          const entry = open.length > depth ? open.pop() : undefined;
          if (result instanceof Promise) {
            return result.then((r) => {
              if (entry)
                entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
              return r;
            });
          }
          if (entry)
            entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
          return result;
        };
        inst._zod.parse = wrapped;
        if (inst._zod.run === base)
          inst._zod.run = wrapped;
      });
    }
  };
});

// node_modules/zod/v4/locales/en.js
function en_default() {
  return {
    localeError: error()
  };
}
var error = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    currency_code: "currency code",
    credit_card: "credit card number",
    iban: "IBAN",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  function getTypeName(type, input) {
    if (type === "number" && typeof input === "number" && !Number.isFinite(input)) {
      return String(input);
    }
    return TypeDictionary[type] ?? type;
  }
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = getTypeName(issue2.expected);
        const receivedType = parsedType(issue2.input);
        const received = getTypeName(receivedType, issue2.input);
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.exact ? "exactly " : issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.exact ? "exactly " : issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        if (issue2.options && Array.isArray(issue2.options) && issue2.options.length > 0) {
          const opts = issue2.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        if (issue2.inclusive === false) {
          return "Invalid input: more than one option matched";
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
var init_en = __esm(() => {
  init_util2();
});

// node_modules/zod/v4/locales/index.js
var init_locales = () => {};

// node_modules/zod/v4/core/registries.js
class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
var _a2, globalRegistry;
var init_registries = __esm(() => {
  (_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
  globalRegistry = globalThis.__zod_globalRegistry;
});

// node_modules/zod/v4/core/compile.js
var INVALID, FALLBACK_FLAG, WHEN_DEFAULTED_CHECKS, PATTERN_IS_COMPLETE;
var init_compile = __esm(() => {
  INVALID = Symbol.for("zod.compile.invalid");
  FALLBACK_FLAG = Symbol.for("zod.compile.fallback");
  WHEN_DEFAULTED_CHECKS = new Set([
    "max_size",
    "min_size",
    "size_equals",
    "max_length",
    "min_length",
    "length_equals"
  ]);
  PATTERN_IS_COMPLETE = new Set([
    "cidrv4",
    "cuid",
    "cuid2",
    "date",
    "datetime",
    "duration",
    "e164",
    "email",
    "emoji",
    "ends_with",
    "guid",
    "includes",
    "ipv4",
    "ksuid",
    "lowercase",
    "mac",
    "nanoid",
    "regex",
    "starts_with",
    "time",
    "ulid",
    "uppercase",
    "uuid",
    "xid"
  ]);
});

// node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
function _string(Class2, params) {
  return new Class2(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class2, params) {
  return new Class2(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _slugify() {
  return _overwrite((input) => slugify(input));
}
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn, params) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        if (!("input" in _issue))
          _issue.input = payload.value;
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
var init_api = __esm(() => {
  init_checks();
  init_util2();
});

// node_modules/zod/v4/core/to-json-schema.js
function assignProps(target, ...sources) {
  for (const source of sources) {
    for (const key of Reflect.ownKeys(source)) {
      if (Object.prototype.propertyIsEnumerable.call(source, key)) {
        assignProp(target, key, source[key]);
      }
    }
  }
  return target;
}
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: new Map,
    sharedDefsExtractedFor: undefined,
    sharedEmitDoneFor: undefined,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    intersections: [],
    deferred: [],
    external: params?.external ?? undefined
  };
}
function handleUnrepresentable(schema, ctx, json, params, message) {
  const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({ zodSchema: schema, path: params.path, message }) : ctx.unrepresentable;
  if (result === "any")
    return false;
  if (result === undefined || result === "throw")
    throw new Error(message);
  Object.assign(json, result);
  return true;
}
function processSchema(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a3;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
  ctx.seen.set(schema, result);
  ctx.sharedDefsExtractedFor = undefined;
  ctx.sharedEmitDoneFor = undefined;
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      processSchema(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    assignProps(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a3 = result.schema).default ?? (_a3.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function encodeJSONPointerSegment(segment) {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external)
    return;
  const idToSchema = new Map;
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}` };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    if (entry[1] === root && !entry[1].schema.id) {
      return { ref: uriPrefix };
    }
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + encodeJSONPointerSegment(defId) };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key in schema2) {
      delete schema2[key];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
      }
    }
  }
  if (ctx.external)
    ctx.sharedDefsExtractedFor = ctx.external;
}
function compactTypeUnion(schema) {
  const options = schema.anyOf;
  if (!Array.isArray(options) || options.length === 0 || schema.type !== undefined)
    return;
  const types = [];
  for (const option of options) {
    if (!option || typeof option !== "object")
      return;
    compactTypeUnion(option);
    const keys = Object.keys(option);
    if (keys.length !== 1 || keys[0] !== "type")
      return;
    const type = option.type;
    for (const member of Array.isArray(type) ? type : [type]) {
      if (typeof member !== "string")
        return;
      if (!types.includes(member))
        types.push(member);
    }
  }
  delete schema.anyOf;
  schema.type = types.length === 1 ? types[0] : types;
}
function undeclaredConstraint(member) {
  const extra = member.additionalProperties;
  if (extra === undefined || extra === false || typeof extra !== "object" || extra === null)
    return null;
  return Object.keys(extra).length ? extra : null;
}
function foldObjects(members2) {
  const objects = [];
  for (const member of members2) {
    if (typeof member !== "object" || member.type !== "object")
      return null;
    for (const key in member) {
      if (!FOLDABLE_KEYS.has(key))
        return null;
    }
    objects.push(member);
  }
  const properties = {};
  const required2 = new Set;
  for (const object of objects) {
    for (const key in object.properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key))
        continue;
      const parts = [];
      for (const other of objects) {
        const part = other.properties?.[key] ?? undeclaredConstraint(other);
        if (part === null || part === undefined)
          continue;
        if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part)))
          parts.push(part);
      }
      const merged = parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts };
      assignProp(properties, key, merged);
    }
    for (const key of object.required ?? [])
      required2.add(key);
  }
  const folded = { type: "object", properties };
  if (required2.size)
    folded.required = [...required2];
  if (objects.every((object) => object.additionalProperties === false)) {
    folded.additionalProperties = false;
  } else {
    const constraints = [];
    for (const object of objects) {
      const constraint = undeclaredConstraint(object);
      if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint)))
        constraints.push(constraint);
    }
    if (constraints.length === 1)
      folded.additionalProperties = constraints[0];
    else if (constraints.length > 1)
      folded.additionalProperties = { allOf: constraints };
  }
  return folded;
}
function foldIntersection(json) {
  const allOf = json.allOf;
  if (!Array.isArray(allOf) || allOf.length < 2)
    return;
  for (const key of FOLDABLE_KEYS)
    if (key in json)
      return;
  const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
  let folded = null;
  if (!unions.length) {
    folded = foldObjects(allOf);
  } else {
    const union = unions[0];
    const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
    if (Object.keys(union).length !== 1)
      return;
    const rest = allOf.filter((m) => m !== union);
    const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
    if (branches.some((b) => !b))
      return;
    folded = { [keyword]: branches };
  }
  if (!folded)
    return;
  delete json.allOf;
  assignProps(json, folded);
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        assignProps(schema2, refSchema);
      }
      assignProps(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema2[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema2[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of [...ctx.seen.entries()].reverse()) {
      flattenRef(entry[0]);
    }
    if (ctx.target !== "openapi-3.0") {
      for (const entry of ctx.seen.entries()) {
        compactTypeUnion(entry[1].def ?? entry[1].schema);
      }
    }
    for (const rewrite of ctx.deferred)
      rewrite();
    if (ctx.intersections.length) {
      const carriers = new Map;
      for (const seen of ctx.seen.values()) {
        for (const json of [seen.schema, seen.def]) {
          const allOf = json?.allOf;
          if (!Array.isArray(allOf))
            continue;
          const existing = carriers.get(allOf);
          if (existing)
            existing.push(json);
          else
            carriers.set(allOf, [json]);
        }
      }
      for (const allOf of ctx.intersections) {
        for (const json of carriers.get(allOf) ?? [])
          foldIntersection(json);
      }
    }
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {}
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== undefined && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.def && seen.defId) {
        if (seen.def.id === seen.defId)
          delete seen.def.id;
        assignProp(defs, seen.defId, seen.def);
      }
    }
  }
  if (ctx.external)
    ctx.sharedEmitDoneFor = ctx.external;
  if (ctx.external) {} else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var FOLDABLE_KEYS, UNION_KEYS, createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  processSchema(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
}, createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  processSchema(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var init_to_json_schema = __esm(() => {
  init_registries();
  init_util2();
  FOLDABLE_KEYS = new Set(["type", "properties", "required", "additionalProperties"]);
  UNION_KEYS = ["oneOf", "anyOf"];
});

// node_modules/zod/v4/core/json-schema-processors.js
function aggregateChecks(schema) {
  const agg = {};
  const def = schema._zod.def;
  const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
  for (const ch of list)
    contributors[ch._zod.def.check]?.(agg, ch._zod.def);
  const bag = schema._zod.bag;
  if (bag.minimum !== undefined)
    narrowMin(agg, "minimum", bag.minimum);
  if (bag.exclusiveMinimum !== undefined)
    narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
  if (bag.maximum !== undefined)
    narrowMax(agg, "maximum", bag.maximum);
  if (bag.exclusiveMaximum !== undefined)
    narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
  if (bag.multipleOf !== undefined)
    addDivisor(agg, bag.multipleOf);
  if (bag.format !== undefined) {
    agg.format ?? (agg.format = bag.format);
    if (bag.format.includes("int"))
      agg.isInt = true;
  }
  if (bag.mime)
    intersectMime(agg, bag.mime);
  for (const pattern of bag.patterns ?? [])
    addPattern(agg, pattern);
  return agg;
}
function inputOptin(schema) {
  const def = schema._zod.def;
  if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) {
    return inputOptin(def.out);
  }
  if (def.type === "catch") {
    return inputOptin(def.innerType);
  }
  return schema._zod.optin;
}
function serializeDefaultValue(value, schema, ctx, json, params) {
  let unrepresentable = false;
  const serialized = JSON.stringify(value, (_, val) => {
    if (typeof val !== "bigint")
      return val;
    unrepresentable = true;
    return null;
  });
  if (!unrepresentable)
    return JSON.parse(serialized);
  handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
  return UNREPRESENTABLE_DEFAULT;
}
var narrowMin = (agg, key, value) => {
  if (agg[key] === undefined || value > agg[key])
    agg[key] = value;
}, narrowMax = (agg, key, value) => {
  if (agg[key] === undefined || value < agg[key])
    agg[key] = value;
}, narrowBoth = (agg, value) => {
  narrowMin(agg, "minimum", value);
  narrowMax(agg, "maximum", value);
}, addDivisor = (agg, value) => {
  agg.multipleOf ?? (agg.multipleOf = []);
  if (!agg.multipleOf.includes(value))
    agg.multipleOf.push(value);
}, addPattern = (agg, pattern) => {
  agg.patterns ?? (agg.patterns = new Set);
  agg.patterns.add(pattern);
}, intersectMime = (agg, mime) => {
  agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
}, setFormat = (agg, format) => {
  agg.format = format;
  if (format.includes("int"))
    agg.isInt = true;
}, minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum), maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum), formatContributor = (ranges) => (agg, def) => {
  setFormat(agg, def.format);
  const [minimum, maximum] = ranges[def.format];
  narrowMin(agg, "minimum", minimum);
  narrowMax(agg, "maximum", maximum);
}, contributors, formatMap, exactPatterns, exactPattern = (p) => exactPatterns.get(p) ?? p, stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time" || laxFormat) {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const patternList = [...patterns].map(exactPattern);
    if (patternList.length === 1)
      json.pattern = patternList[0].source;
    else if (patternList.length > 1) {
      json.allOf = [
        ...patternList.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
}, numberProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
  json.type = isInt ? "integer" : "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (multipleOf) {
    const divisors = new Set;
    for (const divisor of multipleOf) {
      if (Number.isFinite(divisor) && divisor !== 0)
        divisors.add(Math.abs(divisor));
      else
        handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
    }
    const [first, ...rest] = divisors;
    if (first !== undefined)
      json.multipleOf = first;
    if (rest.length)
      json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
  }
}, booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
}, neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
}, unknownProcessor = (_schema, _ctx, _json, _params) => {}, enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.length === 0) {
    json.not = {};
    return;
  }
  if (values.every((v) => typeof v === "number"))
    json.type = "number";
  if (values.every((v) => typeof v === "string"))
    json.type = "string";
  json.enum = values;
}, customProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
}, transformProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
}, arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = processSchema(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
}, objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const shape = def.shape;
  const symbolKeys = Object.getOwnPropertySymbols(shape);
  if (symbolKeys.length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) {
    return;
  }
  json.type = "object";
  json.properties = {};
  for (const key in shape) {
    assignProp(json.properties, key, processSchema(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    }));
  }
  const requiredKeys = [];
  for (const key of Object.keys(shape)) {
    const field = def.shape[key];
    if (ctx.io === "input" ? inputOptin(field) === undefined : field._zod.optout === undefined) {
      requiredKeys.push(key);
    }
  }
  if (requiredKeys.length > 0) {
    json.required = requiredKeys;
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = processSchema(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
}, unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => processSchema(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
}, intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = processSchema(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = processSchema(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json.allOf = allOf;
  ctx.intersections.push(allOf);
}, pendingRecords, nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
}, nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
}, UNREPRESENTABLE_DEFAULT, defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json.default = value;
}, prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io !== "input")
    return;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json._prefault = value;
}, catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(undefined);
  } catch {
    handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
    return;
  }
  json.default = catchValue;
}, pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  processSchema(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
}, readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
}, optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var init_json_schema_processors = __esm(() => {
  init_regexes();
  init_schemas();
  init_to_json_schema();
  init_util2();
  contributors = {
    greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
    less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
    multiple_of: (agg, def) => addDivisor(agg, def.value),
    number_format: formatContributor(NUMBER_FORMAT_RANGES),
    bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
    min_length: minContributor,
    max_length: maxContributor,
    length_equals: (agg, def) => narrowBoth(agg, def.length),
    min_size: minContributor,
    max_size: maxContributor,
    size_equals: (agg, def) => narrowBoth(agg, def.size),
    string_format: (agg, def) => {
      setFormat(agg, def.format);
      if (def.pattern)
        addPattern(agg, def.pattern);
      if (def.format === "base64" || def.format === "base64url")
        agg.contentEncoding = def.format;
      if (def.local || def.precision === -1)
        agg.laxFormat = true;
    },
    mime_type: (agg, def) => intersectMime(agg, def.mime)
  };
  formatMap = {
    guid: "uuid",
    url: "uri",
    datetime: "date-time",
    json_string: "json-string",
    regex: ""
  };
  exactPatterns = new Map([
    [base64Charset, base64],
    [base64urlCharset, base64url]
  ]);
  pendingRecords = new WeakMap;
  UNREPRESENTABLE_DEFAULT = Symbol();
});

// node_modules/zod/v4/core/json-schema.js
var init_json_schema = () => {};

// node_modules/zod/v4/core/index.js
var init_core2 = __esm(() => {
  init_util2();
  init_regexes();
  init_locales();
  init_json_schema();
  init_core();
  init_parse2();
  init_errors();
  init_schemas();
  init_memoizer();
  init_checks();
  init_versions();
  init_registries();
  init_compile();
  init_api();
  init_to_json_schema();
});

// node_modules/zod/v4/classic/checks.js
var init_checks2 = __esm(() => {
  init_core2();
});

// node_modules/zod/v4/classic/errors.js
function _lazyMethod(proto, key, make) {
  Object.defineProperty(proto, key, {
    configurable: true,
    enumerable: false,
    get() {
      const value = make(this);
      Object.defineProperty(this, key, { value, configurable: true, writable: true });
      return value;
    },
    set(value) {
      Object.defineProperty(this, key, { value, configurable: true, writable: true });
    }
  });
}
var _installedErrorProtos, initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  const proto = Object.getPrototypeOf(inst);
  if (_installedErrorProtos.has(proto))
    return;
  _installedErrorProtos.add(proto);
  _lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
  _lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
  _lazyMethod(proto, "addIssue", (self) => (issue2) => {
    self.issues.push(issue2);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  _lazyMethod(proto, "addIssues", (self) => (issues2) => {
    self.issues.push(...issues2);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  Object.defineProperty(proto, "isEmpty", {
    configurable: true,
    enumerable: false,
    get() {
      return this.issues.length === 0;
    }
  });
}, ZodRealError;
var init_errors2 = __esm(() => {
  init_core2();
  init_core2();
  init_util2();
  _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
  ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, undefined, {
    Parent: Error
  });
});

// node_modules/zod/v4/classic/parse.js
var parse3, parseAsync, safeParse, safeParseAsync, encode, decode, encodeAsync, decodeAsync, safeEncode, safeDecode, safeEncodeAsync, safeDecodeAsync;
var init_parse3 = __esm(() => {
  init_core2();
  init_errors2();
  init_core2();
  parse3 = /* @__PURE__ */ _parse(ZodRealError);
  parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
  safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
  safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
  encode = /* @__PURE__ */ _encode(ZodRealError);
  decode = /* @__PURE__ */ _decode(ZodRealError);
  encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
  decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
  safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
  safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
  safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
  safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
});

// node_modules/zod/v4/classic/schemas.js
function _ensureDefaultLocale() {
  if (!globalConfig.localeError)
    config(en_default());
}
function _ensureDefaultMemoizer() {
  if (!globalConfig.memoizer)
    config({ memoizer: memoizer() });
}
function string2(params) {
  return _string(ZodString, params);
}
function number2(params) {
  return _number(ZodNumber, params);
}
function int(params) {
  return _int(ZodNumberFormat, params);
}
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
function unknown() {
  return _unknown(ZodUnknown);
}
function never(params) {
  return _never(ZodNever, params);
}
function array(element, params) {
  return _array(ZodArray, element, params);
}
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...exports_util.normalizeParams(params)
  };
  return new ZodObject(def);
}
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...exports_util.normalizeParams(params)
  });
}
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...exports_util.normalizeParams(params)
  });
}
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : exports_util.shallowClone(defaultValue);
    }
  });
}
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...exports_util.normalizeParams(params)
  });
}
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : exports_util.constantCatch(catchValue)
  });
}
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
var ZodType, _ZodString, ZodString, ZodStringFormat, ZodISODateTime, ZodISODate, ZodISOTime, ZodISODuration, ZodEmail, ZodGUID, ZodUUID, ZodURL, ZodEmoji, ZodNanoID, ZodCUID, ZodCUID2, ZodULID, ZodXID, ZodKSUID, ZodIPv4, ZodIPv6, ZodCIDRv4, ZodCIDRv6, ZodBase64, ZodBase64URL, ZodE164, ZodJWT, ZodNumber, ZodNumberFormat, ZodBoolean, ZodUnknown, ZodNever, ZodArray, ZodObject, ZodUnion, ZodIntersection, ZodEnum, ZodTransform, ZodOptional, ZodExactOptional, ZodNullable, ZodDefault, ZodPrefault, ZodNonOptional, ZodCatch, ZodPipe, ZodReadonly, ZodCustom;
var init_schemas2 = __esm(() => {
  init_core2();
  init_core2();
  init_json_schema_processors();
  init_to_json_schema();
  init_en();
  init_checks2();
  init_parse3();
  ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
    _ensureDefaultLocale();
    $ZodType.init(inst, def);
    inst.def = def;
    inst.type = def.type;
    return inst;
  }, {
    check(...chks) {
      const def = this.def;
      return this.clone(exports_util.mergeDefs(def, {
        checks: [
          ...def.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def, params) {
      return clone(this, def, params);
    },
    brand() {
      return this;
    },
    register(reg, meta2) {
      reg.add(this, meta2);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(_overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(undefined).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn, ...args) {
      return args.length === 0 ? fn(this) : fn(this, ...args);
    },
    get "~standard"() {
      return exports_util.hide(this, "~standard", {
        ...standardProps(this),
        jsonSchema: {
          input: createStandardJSONSchemaMethod(this, "input"),
          output: createStandardJSONSchemaMethod(this, "output")
        }
      });
    },
    set "~standard"(value) {
      exports_util.own(this, "~standard", value);
    },
    parse: function _parse2(data, params) {
      return parse3(this, data, params, { callee: _parse2 });
    },
    parseAsync: async function _parseAsync2(data, params) {
      return await parseAsync(this, data, params, { callee: _parseAsync2 });
    },
    safeParse(data, params) {
      return safeParse(this, data, params);
    },
    async safeParseAsync(data, params) {
      return safeParseAsync(this, data, params);
    },
    get spa() {
      return this?.safeParseAsync;
    },
    set spa(value) {
      exports_util.own(this, "spa", value);
    },
    validate(data, params) {
      return validate(this, data, params);
    },
    validateAsync(data, params) {
      return validateAsync(this, data, params);
    },
    encode: function _encode2(data, params) {
      return encode(this, data, params, { callee: _encode2 });
    },
    decode: function _decode2(data, params) {
      return decode(this, data, params, { callee: _decode2 });
    },
    encodeAsync: async function _encodeAsync2(data, params) {
      return await encodeAsync(this, data, params, { callee: _encodeAsync2 });
    },
    decodeAsync: async function _decodeAsync2(data, params) {
      return await decodeAsync(this, data, params, { callee: _decodeAsync2 });
    },
    safeEncode(data, params) {
      return safeEncode(this, data, params);
    },
    safeDecode(data, params) {
      return safeDecode(this, data, params);
    },
    async safeEncodeAsync(data, params) {
      return safeEncodeAsync(this, data, params);
    },
    async safeDecodeAsync(data, params) {
      return safeDecodeAsync(this, data, params);
    },
    toJSONSchema(params) {
      return createToJSONSchemaMethod(this, {})(params);
    },
    get description() {
      return globalRegistry.get(this)?.description;
    },
    get _def() {
      return this._zod.def;
    }
  });
  _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
  }, /* @__PURE__ */ exports_util.derived({
    format: (inst) => aggregateChecks(inst).format ?? null,
    minLength: (inst) => aggregateChecks(inst).minimum ?? null,
    maxLength: (inst) => aggregateChecks(inst).maximum ?? null
  }, {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  }));
  ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    _ZodString.init(inst, def);
  }, {
    email(params) {
      return this.check(_email(ZodEmail, params));
    },
    url(params) {
      return this.check(_url(ZodURL, params));
    },
    jwt(params) {
      return this.check(_jwt(ZodJWT, params));
    },
    emoji(params) {
      return this.check(_emoji2(ZodEmoji, params));
    },
    guid(params) {
      return this.check(_guid(ZodGUID, params));
    },
    uuid(params) {
      return this.check(_uuid(ZodUUID, params));
    },
    uuidv4(params) {
      return this.check(_uuidv4(ZodUUID, params));
    },
    uuidv6(params) {
      return this.check(_uuidv6(ZodUUID, params));
    },
    uuidv7(params) {
      return this.check(_uuidv7(ZodUUID, params));
    },
    nanoid(params) {
      return this.check(_nanoid(ZodNanoID, params));
    },
    cuid(params) {
      return this.check(_cuid(ZodCUID, params));
    },
    cuid2(params) {
      return this.check(_cuid2(ZodCUID2, params));
    },
    ulid(params) {
      return this.check(_ulid(ZodULID, params));
    },
    base64(params) {
      return this.check(_base64(ZodBase64, params));
    },
    base64url(params) {
      return this.check(_base64url(ZodBase64URL, params));
    },
    xid(params) {
      return this.check(_xid(ZodXID, params));
    },
    ksuid(params) {
      return this.check(_ksuid(ZodKSUID, params));
    },
    ipv4(params) {
      return this.check(_ipv4(ZodIPv4, params));
    },
    ipv6(params) {
      return this.check(_ipv6(ZodIPv6, params));
    },
    cidrv4(params) {
      return this.check(_cidrv4(ZodCIDRv4, params));
    },
    cidrv6(params) {
      return this.check(_cidrv6(ZodCIDRv6, params));
    },
    e164(params) {
      return this.check(_e164(ZodE164, params));
    },
    datetime(params) {
      return this.check(_isoDateTime(ZodISODateTime, params));
    },
    date(params) {
      return this.check(_isoDate(ZodISODate, params));
    },
    time(params) {
      return this.check(_isoTime(ZodISOTime, params));
    },
    duration(params) {
      return this.check(_isoDuration(ZodISODuration, params));
    }
  });
  ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    _ZodString.init(inst, def);
  });
  ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
    $ZodISODate.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
    $ZodISOTime.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
    $ZodEmail.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
    $ZodGUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
    $ZodUUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
    $ZodURL.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
    $ZodEmoji.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
    $ZodNanoID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
    $ZodCUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
    $ZodCUID2.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
    $ZodULID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
    $ZodXID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
    $ZodKSUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
    $ZodIPv4.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
    $ZodIPv6.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
    $ZodCIDRv4.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
    $ZodCIDRv6.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
    $ZodBase64.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
    $ZodBase64URL.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
    $ZodE164.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
    $ZodJWT.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
    $ZodNumber.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
    inst.isFinite = true;
  }, /* @__PURE__ */ exports_util.derived({
    minValue: (inst) => {
      const { minimum, exclusiveMinimum } = aggregateChecks(inst);
      return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
    },
    maxValue: (inst) => {
      const { maximum, exclusiveMaximum } = aggregateChecks(inst);
      return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
    },
    isInt: (inst) => {
      const { isInt, multipleOf } = aggregateChecks(inst);
      return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
    },
    format: (inst) => aggregateChecks(inst).format ?? null
  }, {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  }));
  ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
    $ZodNumberFormat.init(inst, def);
    ZodNumber.init(inst, def);
  });
  ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
  });
  ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
    $ZodUnknown.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
  });
  ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
    $ZodNever.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
  });
  ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodArray.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
    inst.element = def.element;
  }, {
    min(n, params) {
      return this.check(_minLength(n, params));
    },
    nonempty(params) {
      return this.check(_minLength(1, params));
    },
    max(n, params) {
      return this.check(_maxLength(n, params));
    },
    length(n, params) {
      return this.check(_length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
  ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodObjectJIT.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
    exports_util.installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
  }, {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone(exports_util.mergeDefs(this._zod.def, { catchall }));
    },
    passthrough() {
      return this.clone(exports_util.mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    loose() {
      return this.clone(exports_util.mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    strict() {
      return this.clone(exports_util.mergeDefs(this._zod.def, { catchall: never() }));
    },
    strip() {
      return this.clone(exports_util.mergeDefs(this._zod.def, { catchall: undefined }));
    },
    extend(incoming) {
      return exports_util.extend(this, incoming);
    },
    safeExtend(incoming) {
      return exports_util.safeExtend(this, incoming);
    },
    merge(other) {
      return exports_util.merge(this, other);
    },
    pick(mask) {
      return exports_util.pick(this, mask);
    },
    omit(mask) {
      return exports_util.omit(this, mask);
    },
    partial(...args) {
      return exports_util.partial(ZodOptional, this, args[0]);
    },
    exactPartial(...args) {
      return exports_util.partial(ZodExactOptional, this, args[0], "exactPartial");
    },
    required(...args) {
      return exports_util.required(ZodNonOptional, this, args[0]);
    }
  });
  ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
  });
  ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
    $ZodIntersection.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
  });
  ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
    $ZodEnum.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
    inst.enum = def.entries;
    inst.options = [...inst._zod.values];
    const keys = new Set(Object.keys(def.entries));
    inst.extract = (values, params) => {
      const newEntries = {};
      for (const value of values) {
        if (keys.has(value)) {
          newEntries[value] = def.entries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new ZodEnum({
        ...def,
        checks: [],
        ...exports_util.normalizeParams(params),
        entries: newEntries
      });
    };
    inst.exclude = (values, params) => {
      const newEntries = { ...def.entries };
      for (const value of values) {
        if (keys.has(value)) {
          delete newEntries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new ZodEnum({
        ...def,
        checks: [],
        ...exports_util.normalizeParams(params),
        entries: newEntries
      });
    };
  });
  ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodTransform.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
    inst._zod.parse = (payload, _ctx) => {
      if (_ctx.direction === "backward") {
        throw new $ZodEncodeError(inst.constructor.name);
      }
      payload.addIssue = (issue2) => {
        if (typeof issue2 === "string") {
          payload.issues.push(exports_util.issue(issue2, payload.value, def));
        } else {
          const _issue = issue2;
          if (_issue.fatal)
            _issue.continue = false;
          _issue.code ?? (_issue.code = "custom");
          if (!("input" in _issue))
            _issue.input = payload.value;
          _issue.inst ?? (_issue.inst = inst);
          payload.issues.push(exports_util.issue(_issue));
        }
      };
      const output = def.transform(payload.value, payload);
      if (output instanceof Promise) {
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      payload.value = output;
      return payload;
    };
  });
  ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
    $ZodExactOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
    $ZodNullable.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
    $ZodDefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeDefault = inst.unwrap;
  });
  ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
    $ZodPrefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
    $ZodNonOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
    $ZodCatch.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeCatch = inst.unwrap;
  });
  ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
    $ZodPipe.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
    inst.in = def.in;
    inst.out = def.out;
  });
  ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
    $ZodReadonly.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
    $ZodCustom.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
  });
});

// node_modules/zod/v4/classic/compat.js
var ZodFirstPartyTypeKind;
var init_compat = __esm(() => {
  (function(ZodFirstPartyTypeKind2) {})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
});

// node_modules/zod/v4/classic/iso.js
var init_iso = () => {};

// node_modules/zod/v4/classic/coerce.js
var init_coerce = () => {};

// node_modules/zod/v4/classic/external.js
var init_external = __esm(() => {
  init_core2();
  init_locales();
  init_iso();
  init_coerce();
  init_schemas2();
  init_checks2();
  init_errors2();
  init_parse3();
  init_compat();
});

// node_modules/zod/index.js
var init_zod = __esm(() => {
  init_external();
});

// src/config-schema.ts
var exports_config_schema = {};
__export(exports_config_schema, {
  RecallConfigSchema: () => RecallConfigSchema,
  PartialConfigSchema: () => PartialConfigSchema
});
var RecallConfigSchema, sections, PartialConfigSchema;
var init_config_schema = __esm(() => {
  init_zod();
  RecallConfigSchema = object({
    store: object({
      expire_after_session_days: number2().positive(),
      key: _enum(["git_root", "cwd"]),
      max_size_mb: number2().positive(),
      max_pinned_mb: number2().positive(),
      pin_recommendation_threshold: number2().int().positive(),
      stale_item_days: number2().int().positive(),
      eviction_half_life_days: number2().positive().finite(),
      gc_reminder_mb: number2().nonnegative(),
      retention: _enum(["full", "balanced", "minimal"])
    }),
    retrieve: object({
      default_max_bytes: number2().positive()
    }),
    denylist: object({
      additional: array(string2()),
      override_defaults: array(string2()),
      allowlist: array(string2())
    }),
    profiles: object({
      verify_signature: _enum(["warn", "error", "skip"])
    }),
    debug: object({
      enabled: boolean2()
    })
  });
  sections = RecallConfigSchema.shape;
  PartialConfigSchema = object({
    store: sections.store.partial(),
    retrieve: sections.retrieve.partial(),
    denylist: sections.denylist.partial(),
    profiles: sections.profiles.partial(),
    debug: sections.debug.partial()
  }).partial();
});

// src/config.ts
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
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
function loadConfig() {
  if (cached2)
    return cached2;
  try {
    const raw = readFileSync(getConfigPath(), "utf8");
    const { PartialConfigSchema: PartialConfigSchema2 } = (init_config_schema(), __toCommonJS(exports_config_schema));
    const result = PartialConfigSchema2.safeParse(parse(raw));
    if (result.success) {
      const base = deepMerge(DEFAULTS, result.data);
      const userSetPinned = result.data.store?.max_pinned_mb !== undefined;
      const max_pinned_mb = userSetPinned ? base.store.max_pinned_mb : base.store.max_size_mb * DEFAULT_PINNED_FRACTION;
      const merged = { ...base, store: { ...base.store, max_pinned_mb } };
      if (merged.store.max_pinned_mb > merged.store.max_size_mb) {
        log.warn(`invalid config (store.max_pinned_mb ${merged.store.max_pinned_mb} exceeds ` + `store.max_size_mb ${merged.store.max_size_mb}); using defaults`);
        cached2 = deepMerge(DEFAULTS, {});
      } else {
        cached2 = merged;
      }
    } else {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      log.warn(`invalid config (${issues}); using defaults`);
      cached2 = deepMerge(DEFAULTS, {});
    }
  } catch (err) {
    const isNotFound = err instanceof Error && "code" in err && err.code === "ENOENT";
    if (!isNotFound) {
      log.warn(`failed to load config: ${err}; using defaults`);
    }
    cached2 = deepMerge(DEFAULTS, {});
  }
  setDebugEnabled(cached2.debug.enabled);
  return cached2;
}
var DEFAULT_PINNED_FRACTION = 0.5, DEFAULTS, cached2 = null;
var init_config = __esm(() => {
  init_dist();
  init_log();
  DEFAULTS = {
    store: {
      expire_after_session_days: 30,
      key: "git_root",
      max_size_mb: 500,
      max_pinned_mb: 250,
      pin_recommendation_threshold: 5,
      stale_item_days: 3,
      eviction_half_life_days: 7,
      gc_reminder_mb: 2048,
      retention: "balanced"
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
});

// src/project-key.ts
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { resolve } from "path";
function getProjectKey(cwd) {
  const resolved = resolveProjectPath(cwd);
  return hashPath(resolved);
}
function getProjectPath(cwd) {
  return resolveProjectPath(cwd);
}
function resolveProjectPath(cwd) {
  const cached3 = pathCache.get(cwd);
  if (cached3 !== undefined)
    return cached3;
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  const resolved = result.status === 0 && result.stdout ? result.stdout.trim() : typeof cwd === "string" && cwd ? resolve(cwd) : process.cwd();
  pathCache.set(cwd, resolved);
  return resolved;
}
function hashPath(path) {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}
var pathCache;
var init_project_key = __esm(() => {
  pathCache = new Map;
});
// src/db/schema.ts
import { Database } from "bun:sqlite";
import { join as join2, dirname } from "path";
import { homedir as homedir2 } from "os";
import { mkdirSync } from "fs";
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
function truncateWal(db) {
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (e) {
    log.warn(`wal_checkpoint(TRUNCATE) failed \u2014 ${e instanceof Error ? e.message : e}`);
  }
}
function hasLegacyFts(db) {
  return db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'outputs_fts_content'").get() !== null;
}
function migrateFtsToExternalContent(db) {
  if (!hasLegacyFts(db))
    return "current";
  try {
    const migrated = db.transaction(() => {
      if (!hasLegacyFts(db))
        return false;
      db.run("DROP TRIGGER IF EXISTS outputs_ad");
      db.run("DROP TABLE outputs_fts");
      db.run(FTS_TABLE_DDL);
      db.run(FTS_DELETE_TRIGGER_DDL);
      db.run("INSERT INTO outputs_fts(outputs_fts) VALUES('rebuild')");
      db.run("INSERT INTO outputs_fts(outputs_fts, rank) VALUES('integrity-check', 1)");
      return true;
    }).immediate();
    if (!migrated)
      return "current";
  } catch (e) {
    log.warn(`FTS migration failed, keeping the existing index \u2014 ${e instanceof Error ? e.message : e}`);
    return "failed";
  }
  try {
    db.run("PRAGMA incremental_vacuum");
  } catch (e) {
    log.warn(`incremental_vacuum after FTS migration failed \u2014 ${e instanceof Error ? e.message : e}`);
  }
  truncateWal(db);
  log.debug("FTS index migrated to external content (#263)");
  return "migrated";
}
function verifyFtsIndex(db) {
  if (db.query("SELECT 1 FROM sqlite_master WHERE name = 'outputs_fts'").get() === null)
    return false;
  try {
    db.run("INSERT INTO outputs_fts(outputs_fts, rank) VALUES('integrity-check', 1)");
    return false;
  } catch {
    try {
      db.run("INSERT INTO outputs_fts(outputs_fts) VALUES('rebuild')");
      log.warn("FTS index disagreed with stored_outputs; rebuilt");
    } catch (e) {
      log.warn(`FTS rebuild failed \u2014 ${e instanceof Error ? e.message : e}`);
    }
    return true;
  }
}
function defaultDbPath(projectKey) {
  return process.env.RECALL_DB_PATH ?? join2(homedir2(), ".local", "share", "mcp-recall", `${projectKey}.db`);
}
function dataDir() {
  const override = process.env.RECALL_DB_PATH;
  if (override)
    return dirname(override);
  return join2(homedir2(), ".local", "share", "mcp-recall");
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
  instance.run("PRAGMA busy_timeout=5000");
  instance.run("PRAGMA auto_vacuum=INCREMENTAL");
  instance.run(SCHEMA);
  applyMigrations(instance);
  migrateFtsToExternalContent(instance);
  return instance;
}
var FTS_TABLE_DDL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS outputs_fts USING fts5(
    id UNINDEXED,
    tool_name,
    summary,
    full_content,
    content='stored_outputs',
    content_rowid='rowid'
  )`, FTS_DELETE_TRIGGER_DDL = `
  CREATE TRIGGER IF NOT EXISTS outputs_ad AFTER DELETE ON stored_outputs BEGIN
    INSERT INTO outputs_fts(outputs_fts, rowid, id, tool_name, summary, full_content)
    VALUES ('delete', old.rowid, old.id, old.tool_name, old.summary, old.full_content);
  END`, SCHEMA, MIGRATIONS, instance = null;
var init_schema = __esm(() => {
  init_log();
  SCHEMA = `
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

  ${FTS_TABLE_DDL};

  CREATE TRIGGER IF NOT EXISTS outputs_ai AFTER INSERT ON stored_outputs BEGIN
    INSERT INTO outputs_fts(rowid, id, tool_name, summary, full_content)
    VALUES (new.rowid, new.id, new.tool_name, new.summary, new.full_content);
  END;

  ${FTS_DELETE_TRIGGER_DDL};

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

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;
  MIGRATIONS = [
    "ALTER TABLE stored_outputs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE stored_outputs ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE stored_outputs ADD COLUMN last_accessed INTEGER",
    "ALTER TABLE stored_outputs ADD COLUMN input_hash TEXT",
    "ALTER TABLE stored_outputs ADD COLUMN output_hash TEXT",
    "CREATE INDEX IF NOT EXISTS idx_so_output_hash ON stored_outputs(project_key, output_hash)",
    "ALTER TABLE stored_outputs ADD COLUMN full_retained INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE stored_outputs ADD COLUMN command_fp TEXT",
    "CREATE INDEX IF NOT EXISTS idx_so_command_fp ON stored_outputs(project_key, command_fp)",
    "ALTER TABLE stored_outputs ADD COLUMN delivered_size INTEGER",
    "ALTER TABLE stored_outputs ADD COLUMN handler TEXT"
  ];
});

// src/db/chunking.ts
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
var CHUNK_SIZE = 512, CHUNK_OVERLAP = 64;

// src/db/queries.ts
import { randomBytes, createHash as createHash2 } from "crypto";
function generateId() {
  return `recall_${randomBytes(8).toString("hex")}`;
}
function storeChunks(db, id, full_content) {
  const chunks = chunkText(full_content);
  const stmt = db.prepare(`INSERT INTO content_chunks (output_id, chunk_index, content) VALUES (?, ?, ?)`);
  for (let i = 0;i < chunks.length; i++) {
    stmt.run(id, i, chunks[i]);
  }
}
function countAndDelete(db, where, params) {
  const count = db.prepare(`SELECT COUNT(*) as n FROM stored_outputs WHERE ${where}`).get(...params).n;
  if (count > 0) {
    db.prepare(`DELETE FROM stored_outputs WHERE ${where}`).run(...params);
  }
  return count;
}
function reclaimPages(db, deleted) {
  if (deleted < VACUUM_THRESHOLD)
    return;
  try {
    db.run("PRAGMA incremental_vacuum");
  } catch (e) {
    log.warn(`incremental_vacuum failed \u2014 ${e instanceof Error ? e.message : e}`);
  }
  truncateWal(db);
}
function setMeta(db, key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}
function getMeta(db, key) {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key);
  return row?.value ?? null;
}
function storeOutput(db, input) {
  const id = generateId();
  const summary_size = Buffer.byteLength(input.summary, "utf8");
  const created_at = Math.floor(Date.now() / 1000);
  const input_hash = input.input_hash ?? null;
  const output_hash = input.output_hash ?? hashContent(input.full_content);
  const full_retained = input.full_retained ?? 1;
  const bodyToStore = full_retained ? input.full_content : "";
  const command_fp = input.command_fp ?? null;
  const delivered_size = input.delivered_size ?? null;
  const handler = input.handler ?? null;
  const insertAndChunk = db.transaction(() => {
    db.prepare(`
      INSERT INTO stored_outputs
        (id, project_key, session_id, tool_name, summary, full_content,
         original_size, summary_size, created_at, input_hash, output_hash, full_retained, command_fp,
         delivered_size, handler)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.project_key, input.session_id, input.tool_name, input.summary, bodyToStore, input.original_size, summary_size, created_at, input_hash, output_hash, full_retained, command_fp, delivered_size, handler);
    if (full_retained)
      storeChunks(db, id, input.full_content);
  });
  insertAndChunk();
  return {
    id,
    ...input,
    full_content: bodyToStore,
    summary_size,
    created_at,
    pinned: 0,
    access_count: 0,
    last_accessed: null,
    input_hash,
    output_hash,
    full_retained,
    command_fp,
    delivered_size,
    handler
  };
}
function hashContent(content) {
  return createHash2("sha256").update(content).digest("hex");
}
function checkOutputDedup(db, project_key, output_hash, tool_name, command_fp) {
  return db.prepare(`
    SELECT * FROM stored_outputs
    WHERE project_key = ? AND output_hash = ? AND tool_name = ? AND command_fp IS ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(project_key, output_hash, tool_name, command_fp);
}
function evictIfNeeded(db, project_key, max_size_mb, half_life_days = DEFAULT_EVICTION_HALF_LIFE_DAYS, now_secs = Math.floor(Date.now() / 1000)) {
  const max_bytes = max_size_mb * 1024 * 1024;
  const { total } = db.prepare(`
    SELECT COALESCE(SUM(${EFFECTIVE_SIZE_EXPR}), 0) as total
    FROM stored_outputs WHERE project_key = ?
  `).get(project_key);
  if (total <= max_bytes)
    return 0;
  const bytesToShed = total - max_bytes;
  const candidates = db.prepare(`
    SELECT id, ${EFFECTIVE_SIZE_EXPR} AS effective_size, access_count, last_accessed, created_at
    FROM stored_outputs
    WHERE project_key = ? AND pinned = 0
  `).all(project_key);
  if (candidates.length === 0)
    return 0;
  const safeHalfLifeDays = Number.isFinite(half_life_days) && half_life_days > 0 ? half_life_days : DEFAULT_EVICTION_HALF_LIFE_DAYS;
  const halfLifeSecs = Math.max(1, safeHalfLifeDays * SECONDS_PER_DAY);
  const scoreOf = (c) => {
    const lastActive = c.last_accessed ?? c.created_at;
    const ageSecs = Math.max(0, now_secs - lastActive);
    const recency = Math.pow(0.5, ageSecs / halfLifeSecs);
    return (c.access_count + 1) * recency;
  };
  const ranked = candidates.map((c) => ({ id: c.id, effective_size: c.effective_size, score: scoreOf(c), created_at: c.created_at })).sort((a, b) => a.score - b.score || a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const toEvict = [];
  let shed = 0;
  for (const row of ranked) {
    if (shed >= bytesToShed)
      break;
    toEvict.push(row.id);
    shed += row.effective_size;
  }
  const placeholders = toEvict.map(() => "?").join(",");
  db.prepare(`DELETE FROM stored_outputs WHERE id IN (${placeholders})`).run(...toEvict);
  reclaimPages(db, toEvict.length);
  return toEvict.length;
}
function pruneExpired(db, project_key, calendar_days) {
  const cutoff = Math.floor(Date.now() / 1000) - calendar_days * 86400;
  const deleted = countAndDelete(db, "created_at < ? AND project_key = ? AND pinned = 0", [cutoff, project_key]);
  reclaimPages(db, deleted);
  return deleted;
}
function recordSession(db, date2) {
  db.prepare(`INSERT OR IGNORE INTO sessions (date) VALUES (?)`).run(date2);
}
function getSessionDays(db) {
  return db.prepare(`SELECT date FROM sessions ORDER BY date DESC`).all().map((r) => r.date);
}
var EFFECTIVE_SIZE_EXPR = "CASE WHEN full_retained = 1 THEN original_size ELSE summary_size END", VACUUM_THRESHOLD = 50, DEFAULT_EVICTION_HALF_LIFE_DAYS = 7, SECONDS_PER_DAY = 86400;
var init_queries = __esm(() => {
  init_log();
  init_schema();
});

// src/db/analytics.ts
function sampleBySession(db, where, params, perSession = SAMPLE_PER_SESSION) {
  const items = db.prepare(`
    WITH ranked AS (
      SELECT id, session_id, tool_name, summary, created_at, last_accessed,
        ROW_NUMBER() OVER (
          PARTITION BY session_id
          ORDER BY last_accessed DESC NULLS LAST, created_at DESC
        ) AS rn
      FROM stored_outputs
      ${where}
    )
    SELECT id, session_id, tool_name, summary, created_at, last_accessed
    FROM ranked
    WHERE rn <= ?
    ORDER BY rn, last_accessed DESC NULLS LAST, created_at DESC
    LIMIT ?
  `).all(...params, perSession, SAMPLE_LIMIT);
  const counts = db.prepare(`
    SELECT session_id, COUNT(*) AS count
    FROM stored_outputs
    ${where}
    GROUP BY session_id
  `).all(...params);
  const shown = new Map;
  for (const item of items)
    shown.set(item.session_id, (shown.get(item.session_id) ?? 0) + 1);
  const total = counts.reduce((sum, r) => sum + r.count, 0);
  const overflow = counts.map((r) => ({ session_id: r.session_id, count: r.count - (shown.get(r.session_id) ?? 0) })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.session_id.localeCompare(b.session_id));
  return { items, total, overflow };
}
function handlerWhere(project_key, opts, recorded = true) {
  const params = [project_key];
  let where = `WHERE project_key = ? AND tool_name != 'recall__note' AND handler IS ${recorded ? "NOT " : ""}NULL`;
  if (opts.since !== undefined) {
    where += " AND created_at >= ?";
    params.push(opts.since);
  }
  return { where, params };
}
function getHandlerBreakdown(db, project_key, opts = {}) {
  const { where, params } = handlerWhere(project_key, opts);
  return db.prepare(`
    SELECT handler, ${HANDLER_AGGREGATES}
    FROM stored_outputs
    ${where}
    GROUP BY handler
    ORDER BY original_bytes DESC
  `).all(...params);
}
function getFallbackRoutes(db, project_key, opts = {}) {
  const { where, params } = handlerWhere(project_key, opts);
  const placeholders = FALLBACK_HANDLERS.map(() => "?").join(", ");
  return db.prepare(`
    SELECT tool_name,
      CASE WHEN tool_name = 'Bash' THEN COALESCE(command_fp, 'unknown') END AS command_fp,
      handler, ${HANDLER_AGGREGATES}
    FROM stored_outputs
    ${where} AND handler IN (${placeholders})
    GROUP BY tool_name, 2, handler
    ORDER BY original_bytes DESC
  `).all(...params, ...FALLBACK_HANDLERS);
}
function countUnrecordedHandler(db, project_key, opts = {}) {
  const { where, params } = handlerWhere(project_key, opts, false);
  return db.prepare(`SELECT COUNT(*) AS n FROM stored_outputs ${where}`).get(...params).n;
}
function getToolBreakdown(db, project_key) {
  return db.prepare(`
    SELECT
      tool_name,
      COUNT(*)                       AS items,
      COALESCE(SUM(original_size),0) AS original_bytes,
      COALESCE(SUM(${DELIVERED_EXPR}),0) AS summary_bytes
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
function getSessionSummary(db, project_key, opts = {}) {
  let filter;
  let filterParams;
  let label;
  if (opts.session_id) {
    filter = "session_id = ?";
    filterParams = [opts.session_id];
    label = opts.session_id;
  } else {
    const date2 = opts.date ?? new Date().toISOString().slice(0, 10);
    const startOfDay = Math.floor(new Date(`${date2}T00:00:00Z`).getTime() / 1000);
    const endOfDay = startOfDay + 86400;
    filter = "created_at >= ? AND created_at < ?";
    filterParams = [startOfDay, endOfDay];
    label = date2;
  }
  const base = `WHERE project_key = ? AND ${filter}`;
  const bp = [project_key, ...filterParams];
  const agg = db.prepare(`
    SELECT
      COUNT(*) as stored_count,
      COALESCE(SUM(original_size), 0) as total_original_bytes,
      COALESCE(SUM(${DELIVERED_EXPR}), 0) as total_summary_bytes,
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
  const perSession = opts.session_id ? SAMPLE_LIMIT : SAMPLE_PER_SESSION;
  const pinned = sampleBySession(db, `${base} AND pinned = 1`, bp, perSession);
  const notes = sampleBySession(db, `${base} AND pinned = 0 AND tool_name = 'recall__note'`, bp, perSession);
  return { label, ...agg, tool_counts, top_accessed, pinned, notes };
}
function getContext(db, project_key, opts = {}) {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 5;
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const today = new Date().toISOString().slice(0, 10);
  const pinned = sampleBySession(db, "WHERE project_key = ? AND pinned = 1", [project_key]);
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
    const excludeSet = new Set([...pinned.items, ...notes, ...recent].map((i) => i.id));
    const rows = db.prepare(`
      SELECT * FROM stored_outputs
      WHERE project_key = ?
        AND pinned = 0
        AND tool_name != 'recall__note'
        AND created_at >= ? AND created_at < ?
        AND access_count > 0
      ORDER BY access_count DESC
      LIMIT ?
    `).all(project_key, startOfDay, endOfDay, 5 + excludeSet.size);
    hot.push(...rows.filter((r) => !excludeSet.has(r.id)).slice(0, 5));
  }
  return { pinned, notes, recent, hot, last_session };
}
var SAMPLE_LIMIT = 10, SAMPLE_PER_SESSION = 3, DELIVERED_EXPR = "COALESCE(delivered_size, summary_size)", FALLBACK_HANDLERS, HANDLER_AGGREGATES;
var init_analytics = __esm(() => {
  init_queries();
  FALLBACK_HANDLERS = ["genericHandler", "jsonHandler", "shellHandler", "contentReadHandler"];
  HANDLER_AGGREGATES = `
  COUNT(*)                                          AS items,
  COALESCE(SUM(original_size),0)                    AS original_bytes,
  COALESCE(SUM(${DELIVERED_EXPR}),0)                AS summary_bytes,
  COALESCE(SUM(CASE WHEN access_count > 0 THEN 1 ELSE 0 END),0) AS retrieved`;
});

// src/db/index.ts
var init_db = __esm(() => {
  init_schema();
  init_queries();
  init_analytics();
});

// src/secrets.ts
function findSecrets(content) {
  return SECRET_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(({ name }) => name);
}
var SECRET_PATTERNS;
var init_secrets = __esm(() => {
  SECRET_PATTERNS = [
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
      pattern: /(?<![A-Za-z0-9_-])sk-(?!ant-)(?!or-v1-)(?:[A-Za-z0-9_-]{16,120}T3BlbkFJ[A-Za-z0-9_-]{16,120}|(?:proj|svcacct|admin|None)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{32,})/
    },
    {
      name: "OpenRouter API key",
      pattern: /(?<![A-Za-z0-9_-])sk-or-v1-[A-Za-z0-9_-]{20,}/
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
      pattern: /(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9\-_]{32,}/
    },
    {
      name: "Generic Bearer token",
      pattern: /Bearer (?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9+]{32,}={0,2})/
    },
    {
      name: "SSH private key",
      pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/
    },
    {
      name: "GCP service account key",
      pattern: /"type"\s*:\s*"service_account"/
    },
    {
      name: "Azure storage connection string",
      pattern: /DefaultEndpointsProtocol=https?;AccountName=[^;]{1,100};AccountKey=[A-Za-z0-9+/=]{32,}/
    },
    {
      name: "Stripe secret/restricted key",
      pattern: /(?<![A-Za-z0-9_-])[sr]k_(?:live|test)_[A-Za-z0-9]{24,}/
    },
    {
      name: "SendGrid API key",
      pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/
    },
    {
      name: "Twilio Account SID",
      pattern: /\bAC[0-9a-f]{32}\b/
    },
    {
      name: "npm publish token",
      pattern: /npm_[A-Za-z0-9]{36}/
    }
  ];
});

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

// src/gc/index.ts
var exports_gc = {};
__export(exports_gc, {
  vacuumTargets: () => vacuumTargets,
  vacuumFile: () => vacuumFile,
  storeFootprint: () => storeFootprint,
  scanDatabases: () => scanDatabases,
  isDeletionCandidate: () => isDeletionCandidate,
  gcReminderText: () => gcReminderText,
  gcCommand: () => gcCommand,
  executeDeletions: () => executeDeletions
});
import { Database as Database2 } from "bun:sqlite";
import { readdirSync, existsSync, statSync, rmSync } from "fs";
import { join as join3, basename, dirname as dirname2, resolve as resolve2, isAbsolute } from "path";
function isDeletionCandidate(status) {
  return STATUS_POLICY[status].deletable;
}
function vacuumTargets(entries) {
  return entries.filter((e) => STATUS_POLICY[e.status].vacuumable);
}
function fileSizeSafe(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
function dbFootprint(file) {
  return fileSizeSafe(file) + fileSizeSafe(`${file}-wal`) + fileSizeSafe(`${file}-shm`);
}
function storeFootprint(dir = dataDir()) {
  if (!existsSync(dir))
    return { totalBytes: 0, dbCount: 0 };
  let totalBytes = 0;
  let dbCount = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".db"))
      continue;
    dbCount++;
    totalBytes += dbFootprint(join3(dir, name));
  }
  return { totalBytes, dbCount };
}
function gcReminderText(footprint, reminderMb) {
  if (reminderMb <= 0)
    return "";
  if (footprint.totalBytes < reminderMb * 1024 * 1024)
    return "";
  return `\uD83D\uDCA1 recall store is ${formatBytes(footprint.totalBytes)} across ${footprint.dbCount} ` + `project databases \u2014 run \`mcp-recall gc\` to review and reclaim disk space.`;
}
function probeDb(file) {
  let db = null;
  try {
    db = new Database2(file, { readonly: true });
    const isRecallDb = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='stored_outputs'`).get();
    if (!isRecallDb)
      return { readable: false, projectPath: null, items: 0 };
    let projectPath = null;
    try {
      projectPath = getMeta(db, "project_path");
    } catch {
      projectPath = null;
    }
    const items = db.prepare(`SELECT COUNT(*) AS n FROM stored_outputs`).get().n;
    return { readable: true, projectPath, items };
  } catch {
    return { readable: false, projectPath: null, items: 0 };
  } finally {
    db?.close();
  }
}
function classify(probe, mtimeMs, staleCutoffMs) {
  if (!probe.readable)
    return "unreadable";
  if (probe.projectPath !== null) {
    if (!isAbsolute(probe.projectPath)) {
      return mtimeMs < staleCutoffMs ? "unrooted-stale" : "unrooted-fresh";
    }
    if (existsSync(probe.projectPath))
      return "active";
    return existsSync(dirname2(probe.projectPath)) ? "orphaned" : "unverifiable";
  }
  return mtimeMs < staleCutoffMs ? "legacy-stale" : "legacy-fresh";
}
function scanDatabases(dir, currentFile, staleDays, nowMs = Date.now()) {
  if (!existsSync(dir))
    return [];
  const staleCutoffMs = nowMs - staleDays * 86400 * 1000;
  const currentResolved = resolve2(currentFile);
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".db"))
      continue;
    const file = join3(dir, name);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      continue;
    }
    const sizeBytes = dbFootprint(file);
    const probe = probeDb(file);
    const status = resolve2(file) === currentResolved ? "current" : classify(probe, mtimeMs, staleCutoffMs);
    entries.push({ file, status, projectPath: probe.projectPath, sizeBytes, mtimeMs, items: probe.items });
  }
  return entries.sort((a, b) => b.sizeBytes - a.sizeBytes);
}
function reportLine(e, nowMs) {
  const flag = isDeletionCandidate(e.status) ? "\u2717" : " ";
  const age = formatRelativeTime(nowMs - e.mtimeMs);
  const where = e.projectPath ?? "(no recorded path)";
  return `  ${flag} ${STATUS_LABEL[e.status].padEnd(14)} ${formatBytes(e.sizeBytes).padStart(9)}` + `  ${String(e.items).padStart(6)} items  ${age.padEnd(14)}  ${basename(e.file)}
` + `      ${where}`;
}
function vacuumFile(file) {
  const before = dbFootprint(file);
  let db = null;
  try {
    db = new Database2(file);
    db.run("PRAGMA busy_timeout=5000");
    migrateFtsToExternalContent(db);
    db.run("PRAGMA auto_vacuum=INCREMENTAL");
    db.run("VACUUM");
    verifyFtsIndex(db);
    truncateWal(db);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn(`vacuum failed for ${basename(file)} \u2014 ${message}`);
    return { error: message };
  } finally {
    db?.close();
  }
  return { before, after: dbFootprint(file) };
}
function vacuumSkipReason(error2) {
  if (/lock|busy/i.test(error2))
    return "locked by another session";
  if (/disk|full|space/i.test(error2))
    return "disk full";
  return "unreadable or errored (see RECALL_DEBUG logs)";
}
function deleteDbFiles(file) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    rmSync(f, { force: true });
  }
}
function executeDeletions(candidates) {
  for (const e of candidates)
    deleteDbFiles(e.file);
  return sumBytes(candidates);
}
function gcCommand(opts = {}) {
  const dryRun = opts.dryRun ?? true;
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const nowMs = Date.now();
  const dir = dataDir();
  const currentFile = defaultDbPath(getProjectKey(process.cwd()));
  const entries = scanDatabases(dir, currentFile, staleDays, nowMs);
  if (entries.length === 0) {
    console.log(`No databases found in ${dir}`);
    return;
  }
  const candidates = entries.filter((e) => isDeletionCandidate(e.status));
  console.log(`Project databases in ${dir}:
`);
  for (const e of entries)
    console.log(reportLine(e, nowMs));
  console.log(`
${entries.length} databases \xB7 ${formatBytes(sumBytes(entries))} total \xB7 ` + `${candidates.length} reclaimable (${formatBytes(sumBytes(candidates))})`);
  console.log(`  ORPHANED = project path deleted \xB7 LEGACY-STALE = no recorded path \xB7 ` + `UNROOTED-STALE = un-rootable relative path \u2014 both untouched > ${staleDays}d (--stale-days N) \xB7 ` + `unverifiable (unmounted volume) / unreadable are never deleted`);
  if (dryRun) {
    if (candidates.length > 0) {
      console.log(`
Dry run \u2014 pass --force to delete the ${candidates.length} marked database(s).`);
    }
  } else {
    const freed = executeDeletions(candidates);
    console.log(`
Deleted ${candidates.length} database(s), freed ${formatBytes(freed)}.`);
  }
  if (opts.vacuum) {
    const survivors = vacuumTargets(entries);
    console.log(`
Vacuuming ${survivors.length} database(s) to keep (${formatBytes(sumBytes(survivors))}) \u2014 ` + `rewrites each file, may take a while\u2026`);
    let reclaimed = 0;
    let vacuumed = 0;
    let skipped = 0;
    for (let i = 0;i < survivors.length; i++) {
      const e = survivors[i];
      process.stdout.write(`  [${i + 1}/${survivors.length}] ${basename(e.file)} (${formatBytes(e.sizeBytes)})\u2026 `);
      const result = vacuumFile(e.file);
      if ("after" in result) {
        const freed = Math.max(0, result.before - result.after);
        reclaimed += freed;
        vacuumed++;
        console.log(`reclaimed ${formatBytes(freed)}`);
      } else {
        skipped++;
        console.log(`skipped \u2014 ${vacuumSkipReason(result.error)}`);
      }
    }
    const skipNote = skipped > 0 ? ` (${skipped} skipped)` : "";
    console.log(`Vacuumed ${vacuumed} database(s), reclaimed ${formatBytes(reclaimed)} of free pages.${skipNote}`);
  }
}
var DEFAULT_STALE_DAYS = 90, STATUS_POLICY, sumBytes = (entries) => entries.reduce((sum, e) => sum + e.sizeBytes, 0), STATUS_LABEL;
var init_gc = __esm(() => {
  init_schema();
  init_queries();
  init_project_key();
  init_log();
  STATUS_POLICY = {
    current: { deletable: false, vacuumable: false },
    active: { deletable: false, vacuumable: true },
    orphaned: { deletable: true, vacuumable: false },
    unverifiable: { deletable: false, vacuumable: false },
    "unrooted-fresh": { deletable: false, vacuumable: true },
    "unrooted-stale": { deletable: true, vacuumable: false },
    "legacy-fresh": { deletable: false, vacuumable: true },
    "legacy-stale": { deletable: true, vacuumable: false },
    unreadable: { deletable: false, vacuumable: false }
  };
  STATUS_LABEL = {
    current: "current",
    active: "active",
    orphaned: "ORPHANED",
    unverifiable: "unverifiable",
    "unrooted-fresh": "unrooted",
    "unrooted-stale": "UNROOTED-STALE",
    "legacy-fresh": "legacy",
    "legacy-stale": "LEGACY-STALE",
    unreadable: "unreadable"
  };
});

// src/denylist.ts
function isDenied(toolName, config2) {
  if (config2.denylist.allowlist.some((p) => matchesPattern(toolName, p))) {
    return false;
  }
  const base = config2.denylist.override_defaults.length > 0 ? config2.denylist.override_defaults : BUILTIN_PATTERNS;
  const patterns = [...base, ...config2.denylist.additional];
  return patterns.some((p) => matchesPattern(toolName, p));
}
function matchesPattern(toolName, pattern) {
  let re = regexCache.get(pattern);
  if (!re) {
    const escaped = pattern.split("*").map((s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join(".*");
    re = new RegExp(`^${escaped}$`);
    regexCache.set(pattern, re);
  }
  return re.test(toolName);
}
var BUILTIN_PATTERNS, regexCache;
var init_denylist = __esm(() => {
  BUILTIN_PATTERNS = [
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
  regexCache = new Map;
});

// src/handlers/types.ts
function isMcpContentBlock(c) {
  return typeof c === "object" && c !== null && typeof c["type"] === "string";
}
function looksLikeMcpContentBlocks(value) {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isMcpContentBlock))
    return false;
  return value.some((b) => b.type === "text" && typeof b.text === "string" || MCP_BINARY_TYPES.has(b.type));
}
function blocksFromValue(value) {
  if (looksLikeMcpContentBlocks(value))
    return value;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const content = value["content"];
    if (looksLikeMcpContentBlocks(content))
      return content;
  }
  return null;
}
function asMcpContentBlocks(output) {
  const found = blocksFromValue(output);
  if (found)
    return found;
  if (typeof output === "string") {
    try {
      return blocksFromValue(JSON.parse(output));
    } catch {
      return null;
    }
  }
  return null;
}
function hasNonTextContentBlocks(output) {
  const blocks = asMcpContentBlocks(output);
  return blocks !== null && blocks.some((b) => b.type !== "text");
}
function joinTextBlocks(blocks) {
  return blocks.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join(`
`);
}
function payloadByteLength(output) {
  if (typeof output === "string")
    return Buffer.byteLength(output, "utf8");
  return Buffer.byteLength(JSON.stringify(output), "utf8");
}
function isTopLevelArrayPayload(output) {
  if (Array.isArray(output))
    return true;
  if (typeof output === "string") {
    const trimmed = output.trimStart();
    return trimmed.startsWith("[");
  }
  return false;
}
function extractText(output) {
  const blocks = asMcpContentBlocks(output);
  if (blocks) {
    const text = joinTextBlocks(blocks);
    const hasNonText = blocks.some((b) => b.type !== "text");
    if (hasNonText)
      return text;
    if (text.length > 0 && !isTopLevelArrayPayload(output))
      return text;
  }
  if (typeof output === "string")
    return output;
  return JSON.stringify(output);
}
var MCP_BINARY_TYPES;
var init_types = __esm(() => {
  MCP_BINARY_TYPES = new Set(["image", "image_url", "audio", "resource", "resource_link"]);
});

// src/handlers/playwright.ts
var INTERACTIVE_ROLES, TEXT_ROLES, MAX_INTERACTIVE = 20, MAX_TEXT_CHARS = 400, playwrightHandler = (_toolName, output) => {
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
var init_playwright = __esm(() => {
  init_types();
  INTERACTIVE_ROLES = new Set([
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
  TEXT_ROLES = new Set([
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
});

// src/handlers/github.ts
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
var BODY_EXCERPT_CHARS = 200, githubHandler = (_toolName, output) => {
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
var init_github = __esm(() => {
  init_types();
});

// src/handlers/gitlab.ts
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
var DESCRIPTION_EXCERPT_CHARS = 200, gitlabHandler = (_toolName, output) => {
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
var init_gitlab = __esm(() => {
  init_types();
});

// src/handlers/filesystem.ts
var HEAD_LINES = 50, filesystemHandler = (_toolName, output) => {
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
var init_filesystem = __esm(() => {
  init_types();
});

// src/handlers/json.ts
function fitString(s, budget) {
  if (size(s) <= budget)
    return s;
  let keep = Math.max(0, Math.floor(budget - 24));
  for (;; ) {
    const cut = `${s.slice(0, keep)}\u2026[+${s.length - keep} chars]`;
    if (size(cut) <= budget || keep === 0)
      return cut;
    keep = Math.max(0, keep - Math.max(1, Math.ceil(size(cut) - budget)));
  }
}
function sharedFields(items) {
  if (items.length < 2 || !items.every(isObject2))
    return null;
  const [first, ...rest] = items;
  const shared = {};
  for (const [k, v] of Object.entries(first)) {
    const json = JSON.stringify(v);
    if (rest.every((item) => (k in item) && JSON.stringify(item[k]) === json))
      shared[k] = v;
  }
  return Object.keys(shared).length > 0 ? shared : null;
}
function fitArray(items, budget) {
  const shared = sharedFields(items);
  const out = shared ? [fit({ [`\u2026each of ${items.length} items has`]: shared }, budget / 4)] : [];
  const parts = shared ? items.map((item) => Object.fromEntries(Object.entries(item).filter(([k]) => !(k in shared)))) : items;
  let remaining = budget - size(out) - 16;
  let shown = 0;
  for (;shown < parts.length && remaining >= MIN_PART; shown++) {
    const itemBudget = share(remaining, parts.length - shown) - 1;
    if (size(parts[shown]) > itemBudget && itemBudget < SHARE_FLOOR)
      break;
    const fitted = fit(parts[shown], itemBudget);
    const used = size(fitted) + 1;
    if (used > remaining)
      break;
    out.push(fitted);
    remaining -= used;
  }
  if (shown < parts.length)
    out.push(`\u2026${parts.length - shown} more`);
  return out;
}
function allocate(needs, budget) {
  const out = new Array(needs.length);
  let remaining = budget;
  const order = needs.map((need, i) => ({ need, i })).sort((a, b) => a.need - b.need);
  order.forEach(({ need, i }, n) => {
    out[i] = Math.min(need, remaining / (order.length - n));
    remaining -= out[i];
  });
  return out;
}
function fitObject(obj, budget) {
  const entries = Object.entries(obj);
  const keyCosts = entries.map(([k]) => size(k) + 2);
  const needs = entries.map(([, v], i) => keyCosts[i] + size(v));
  const available = budget - 2 - 24;
  const budgets = allocate(needs, available);
  if (budgets.some((b, i) => b < needs[i] && b - keyCosts[i] < MIN_PART))
    return fitFieldsInOrder(entries, available);
  return Object.fromEntries(entries.map(([k, v], i) => [k, fit(v, budgets[i] - keyCosts[i])]));
}
function fitFieldsInOrder(entries, budget) {
  const out = {};
  let remaining = budget;
  let shown = 0;
  for (;shown < entries.length && remaining >= MIN_PART; shown++) {
    const [k, v] = entries[shown];
    const keyCost = size(k) + 2;
    const valueBudget = share(remaining, entries.length - shown) - keyCost;
    if (size(v) > valueBudget && valueBudget < SHARE_FLOOR)
      break;
    const fitted = fit(v, valueBudget);
    const used = keyCost + size(fitted);
    if (used > remaining)
      break;
    out[k] = fitted;
    remaining -= used;
  }
  if (shown < entries.length)
    out["\u2026more fields"] = entries.length - shown;
  return out;
}
function fit(value, budget) {
  if (size(value) <= budget)
    return value;
  if (typeof value === "string")
    return fitString(value, budget);
  if (Array.isArray(value))
    return fitArray(value, budget);
  if (isObject2(value))
    return fitObject(value, budget);
  return value;
}
var JSON_BUDGET = 4096, SHARE_FLOOR = 512, MIN_PART = 24, size = (v) => JSON.stringify(v).length, isObject2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v), share = (remaining, rest) => Math.max(remaining / rest, Math.min(remaining, SHARE_FLOOR)), jsonHandler = (_toolName, output) => {
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
  const summary = JSON.stringify(fit(parsed, JSON_BUDGET));
  return { summary, originalSize };
};
var init_json = __esm(() => {
  init_types();
});

// src/handlers/clip.ts
function clipLine(line, max = MAX_LINE_CHARS) {
  if (line.length <= max)
    return line;
  const end = /[\uD800-\uDBFF]/.test(line[max - 1]) ? max - 1 : max;
  return `${line.slice(0, end)}\u2026 (+${line.length - end} chars)`;
}
function hasClippedLine(summary) {
  return CLIP_MARKER_RE.test(summary);
}
var MAX_LINE_CHARS = 4000, CLIP_MARKER_RE;
var init_clip = __esm(() => {
  CLIP_MARKER_RE = /\u2026 \(\+\d+ chars\)$/m;
});

// src/handlers/collapse.ts
function isLogLine(line) {
  const head = line.slice(0, LOG_PREFIX_CHARS);
  if (!/\d\d:\d\d:\d\d/.test(head))
    return false;
  const starts = TIMESTAMP_FIRST_RES.map((re) => head.search(re)).filter((i) => i >= 0);
  if (starts.length === 0)
    return false;
  const prefix = line.slice(0, Math.min(...starts)).trim();
  if (prefix.includes("|"))
    return false;
  return prefix === "" || prefix.split(/\s+/).length <= MAX_WORDS_BEFORE_TIMESTAMP;
}
function repeatKey(line) {
  if (!isLogLine(line))
    return line;
  return VOLATILE_RES.reduce((s, [re, mask]) => s.replace(re, mask), line);
}
function lastTimestamp(line) {
  for (const re of TIMESTAMP_RES) {
    const all = line.match(re);
    if (all)
      return all[all.length - 1];
  }
  return null;
}
function collapseRepeats(lines, limit = Infinity, width = Infinity) {
  const out = [];
  let i = 0;
  while (i < lines.length && out.length < limit) {
    const first = lines[i];
    let end = i + 1;
    if (first.trim() !== "") {
      const key = repeatKey(first);
      while (end < lines.length && (lines[end] === first || repeatKey(lines[end]) === key))
        end++;
    }
    const text = clipLine(first, width);
    out.push({ text: end - i > 1 ? `${text}  ${runNote(lines.slice(i, end))}` : text, count: end - i });
    i = end;
  }
  return out;
}
function runNote(run) {
  const last = run[run.length - 1];
  if (run.every((l) => l === run[0]))
    return `(\xD7${run.length})`;
  const ts = lastTimestamp(last);
  return ts && ts !== lastTimestamp(run[0]) ? `(\xD7${run.length}, until ${ts})` : `(\xD7${run.length}, varying ids)`;
}
var TIMESTAMP_RES, VOLATILE_RES, MAX_WORDS_BEFORE_TIMESTAMP = 2, LOG_PREFIX_CHARS = 64, TIMESTAMP_FIRST_RES;
var init_collapse = __esm(() => {
  init_clip();
  TIMESTAMP_RES = [
    /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2}(?:\.\d+)?/g,
    /\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g
  ];
  VOLATILE_RES = [
    ...TIMESTAMP_RES.map((re) => [re, "<ts>"]),
    [/\[\d+\]/g, "[<pid>]"],
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
    [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/g, "<hex>"],
    [/\b\d+(?:\.\d+)?(?:ms|\u00B5s|us|ns|s)\b/g, "<dur>"]
  ];
  TIMESTAMP_FIRST_RES = TIMESTAMP_RES.map((re) => new RegExp(re.source));
});

// src/handlers/rtk.ts
function recoveryHints(lines) {
  return lines.filter((l) => RECOVERY_HINT_RE.test(l)).slice(0, MAX_HINTS).map((l) => l.trim());
}
var RECOVERY_HINT_RE, MAX_HINTS = 5;
var init_rtk = __esm(() => {
  RECOVERY_HINT_RE = /\brtk recall [0-9a-f]{6,}\b|^\s*\[full [a-z ]+: rtk [^\]]+\]\s*$/;
});

// src/handlers/generic.ts
function summarizeBlock(raw) {
  const head = raw.slice(0, HEAD_CHARS).trimEnd();
  const tail = raw.slice(-TAIL_CHARS).trimStart();
  return `${head}
\u2026
${tail}`;
}
function failureLines(lines) {
  return lines.filter((l) => MATCH_RE.test(l)).slice(0, MAX_MATCH_LINES);
}
function summarizeLines(lines) {
  return summarizeLineWindow(lines, HEAD_LINES2, TAIL_LINES);
}
function summarizeLineWindow(lines, headLines, tailLines) {
  const head = lines.slice(0, headLines);
  const tail = lines.slice(lines.length - tailLines);
  const middle = lines.slice(headLines, lines.length - tailLines);
  const matches = failureLines(middle);
  const hints = recoveryHints(middle.filter((l) => !matches.includes(l)));
  const note = matches.length ? `\u2026(${middle.length} middle line${plural(middle.length)} elided; ${matches.length} error/warn shown)\u2026` : `\u2026(${middle.length} middle line${plural(middle.length)} elided)\u2026`;
  return [...head, note, ...matches, ...hints, ...tail].map((l) => clipLine(l)).join(`
`);
}
var MAX_CHARS = 500, HEAD_CHARS = 380, TAIL_CHARS = 100, HEAD_LINES2 = 5, TAIL_LINES = 5, LINE_MODE_MIN_LINES, MAX_MATCH_LINES = 8, MATCH_RE, plural = (n) => n === 1 ? "" : "s", genericHandler = (_toolName, output) => {
  const raw = extractText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  if (raw.length <= MAX_CHARS) {
    return { summary: raw, originalSize };
  }
  const lines = collapseRepeats(raw.split(`
`)).map((l) => l.text);
  const text = lines.join(`
`);
  const summary = lines.length >= LINE_MODE_MIN_LINES ? summarizeLines(lines) : text.length <= MAX_CHARS ? text : summarizeBlock(text);
  return { summary, originalSize };
};
var init_generic = __esm(() => {
  init_types();
  init_collapse();
  init_clip();
  init_rtk();
  LINE_MODE_MIN_LINES = HEAD_LINES2 + TAIL_LINES + 1;
  MATCH_RE = /\b(error|errors|warn|warning|fail|failed|failure|exception|fatal|panic|denied|refused|timeout)\b/i;
});

// src/handlers/shell.ts
function stripAnsi(text) {
  return text.replace(ANSI_RE, "");
}
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
function formatLines(text, max, surfaceFailures) {
  const lines = trimTrailingEmpty(text.split(`
`));
  const total = lines.length;
  const shown = collapseRepeats(lines, max, MAX_LINE_CHARS);
  const hidden = total - shown.reduce((n, l) => n + l.count, 0);
  const head = shown.map((l) => l.text).join(`
`);
  const overflow = hidden > 0 ? `
\u2026 (+${hidden} more lines)` : "";
  const cut = collapseRepeats(lines.slice(total - hidden)).map((l) => l.text);
  const failures = surfaceFailures ? failureLines(cut) : [];
  const extra = [...failures, ...recoveryHints(cut.filter((l) => !failures.includes(l)))];
  const hints = extra.map((h) => `
${clipLine(h)}`).join("");
  return {
    header: `${total} line${total === 1 ? "" : "s"}`,
    body: `${head}${overflow}${hints}`
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
function summarizeShell(_toolName, output, surfaceFailures) {
  const raw = extractText(output);
  const structured = parseStructured(raw);
  const measured = structured ? [structured.stdout ?? structured.output ?? "", structured.stderr ?? ""].filter((s) => s.length > 0).join(`
`) : raw;
  const originalSize = Buffer.byteLength(measured, "utf8");
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
    const stdoutFmt = formatLines(stdout, HEAD_STDOUT, surfaceFailures);
    const hasStderr = stderr.trim().length > 0;
    const stderrFmt = hasStderr ? formatLines(stderr, HEAD_STDERR, surfaceFailures) : null;
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
  const fmt = formatLines(text, HEAD_STDOUT, surfaceFailures);
  return {
    summary: `[bash \xB7 ${fmt.header}]
${fmt.body}`,
    originalSize
  };
}
var HEAD_STDOUT = 25, HEAD_STDERR = 20, ANSI_RE, SSH_NOISE_RE, shellHandler = (toolName, output) => summarizeShell(toolName, output, true), contentReadHandler = (toolName, output) => summarizeShell(toolName, output, false);
var init_shell = __esm(() => {
  init_types();
  init_json();
  init_collapse();
  init_clip();
  init_rtk();
  init_generic();
  ANSI_RE = /[\x1b\x9b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
  SSH_NOISE_RE = /^\*\* .+/;
});

// src/handlers/bash-shared.ts
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
  const read = (o) => {
    if (o !== null && typeof o === "object") {
      const obj = o;
      if (typeof obj.stderr === "string")
        return stripAnsi(obj.stderr);
    }
    return null;
  };
  const direct = read(output);
  if (direct !== null)
    return direct;
  try {
    const parsed = read(JSON.parse(extractText(output)));
    if (parsed !== null)
      return parsed;
  } catch {}
  return "";
}
function bashOutputText(output) {
  const read = (o) => {
    if (o === null || typeof o !== "object" || Array.isArray(o))
      return null;
    const obj = o;
    if (typeof obj.stdout !== "string")
      return null;
    const stderr = typeof obj.stderr === "string" ? obj.stderr : "";
    return [obj.stdout, stderr].filter((s) => s.length > 0).join(`
`);
  };
  const direct = read(output);
  if (direct !== null)
    return direct;
  const text = extractText(output);
  try {
    const parsed = read(JSON.parse(text));
    if (parsed !== null)
      return parsed;
  } catch {}
  return text;
}
function extractCommand(input) {
  if (input !== null && typeof input === "object") {
    const obj = input;
    if (typeof obj.command === "string")
      return obj.command.trim();
  }
  return null;
}
function extractExitCode(output) {
  const read = (o) => {
    if (o !== null && typeof o === "object") {
      const obj = o;
      if (typeof obj.exit_code === "number")
        return obj.exit_code;
      if (typeof obj.returncode === "number")
        return obj.returncode;
    }
    return;
  };
  const direct = read(output);
  if (direct !== undefined)
    return direct;
  try {
    return read(JSON.parse(extractText(output)));
  } catch {
    return;
  }
}
var MAX_LOG_COMMITS = 20, MAX_TERRAFORM_RESOURCES = 10, MAX_DOCKER_CONTAINERS = 20, MAX_BUILD_ERRORS = 20;
var init_bash_shared = __esm(() => {
  init_types();
  init_shell();
});

// src/handlers/bash-git.ts
function countLine(file, line) {
  if (line.startsWith("+"))
    file.additions++;
  else if (line.startsWith("-"))
    file.deletions++;
}
function parseGitDiff(text) {
  const preamble = [];
  const files = [];
  let file = null;
  let hunk = null;
  let binary = false;
  for (const raw of text.split(`
`)) {
    const line = clipLine(raw);
    if (line.startsWith("diff --git ")) {
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      file = { path: match ? match[1] : line.slice(11), meta: [line], hunks: [], additions: 0, deletions: 0 };
      files.push(file);
      hunk = null;
      binary = false;
    } else if (!file) {
      preamble.push(line);
    } else if (binary || !hunk && /^(index |--- |\+\+\+ |\s*$)/.test(line)) {} else if (!hunk && EXTENDED_HEADER.test(line)) {
      file.meta.push(line);
      binary = line.startsWith("GIT binary patch");
    } else if (line.startsWith("@@") || !hunk) {
      hunk = { lines: [line], bytes: lineBytes(line) };
      file.hunks.push(hunk);
      if (!line.startsWith("@@"))
        countLine(file, line);
    } else {
      hunk.lines.push(line);
      hunk.bytes += lineBytes(line);
      countLine(file, line);
    }
  }
  return { preamble, files };
}
function fairShares(sizes, budget) {
  const shares = sizes.map(() => 0);
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[a] - sizes[b]);
  let left = budget;
  order.forEach((i, k) => {
    shares[i] = Math.min(sizes[i], Math.floor(left / (order.length - k)));
    left -= shares[i];
  });
  return shares;
}
function renderFile(file, share2) {
  const out = [...file.meta];
  let used = 0;
  let whole = 0;
  while (whole < file.hunks.length && used + file.hunks[whole].bytes <= share2) {
    out.push(...file.hunks[whole].lines);
    used += file.hunks[whole].bytes;
    whole++;
  }
  if (whole === file.hunks.length)
    return out;
  const fits = [];
  for (const line of file.hunks[whole].lines) {
    if (used + lineBytes(line) > share2)
      break;
    fits.push(line);
    used += lineBytes(line);
  }
  const partial2 = fits.length > 1 ? fits : [];
  if (whole === 0 && partial2.length === 0)
    return [];
  const hidden = file.hunks.slice(whole).flatMap((h) => h.lines).slice(partial2.length);
  const add = hidden.filter((l) => l.startsWith("+")).length;
  const del = hidden.filter((l) => l.startsWith("-")).length;
  const n = file.hunks.length - whole;
  return [...out, ...partial2, `  \u2026 ${n} more hunk${n === 1 ? "" : "s"} (+${add} -${del}) in ${file.path}`];
}
function parsePorcelain(line, parts) {
  const m = line.match(/^([ MTADRCU?!])([ MTADRCU?!]) (.+)$/);
  if (!m)
    return false;
  const [, x, y, path] = m;
  if (CONFLICT_CODES.has(x + y))
    parts.conflicts.push(`${x}${y} ${path}`);
  else if (x === "?")
    parts.untracked.push(path);
  else if (x !== "!") {
    if (x !== " ")
      parts.staged.push(`${x} ${path}`);
    if (y !== " ")
      parts.unstaged.push(`${y} ${path}`);
  }
  return true;
}
function parseStatus(stdout) {
  const parts = { branch: [], staged: [], unstaged: [], untracked: [], conflicts: [] };
  let section = null;
  for (const line of stdout.split(`
`)) {
    const trimmed = line.trim();
    if (BRANCH_LINE.test(trimmed)) {
      parts.branch.push(trimmed);
      continue;
    }
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
    if (trimmed.startsWith("Unmerged paths")) {
      section = "unmerged";
      continue;
    }
    if (!trimmed || trimmed.startsWith("(") || trimmed.startsWith("no changes") || trimmed.startsWith("nothing"))
      continue;
    if (!line.startsWith("\t") && parsePorcelain(line, parts))
      continue;
    if (LONG_CONFLICT.test(trimmed))
      parts.conflicts.push(trimmed.replace(LONG_CONFLICT, ""));
    else if ((section === "staged" || section === "unstaged") && LONG_ENTRY.test(trimmed))
      parts[section].push(trimmed.replace(LONG_ENTRY, ""));
    else if (section === "untracked")
      parts.untracked.push(trimmed);
  }
  return parts;
}
var DIFF_BODY_BYTES, MAX_PREAMBLE_LINES = 20, lineBytes = (line) => Buffer.byteLength(line, "utf8") + 1, EXTENDED_HEADER, gitDiffHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  if (!stdout.trim()) {
    return { summary: "[git diff \u2014 no changes]", originalSize };
  }
  const { preamble, files } = parseGitDiff(stdout);
  if (files.length === 0) {
    return shellHandler(toolName, output);
  }
  const totalAdded = files.reduce((s, f) => s + f.additions, 0);
  const totalDeleted = files.reduce((s, f) => s + f.deletions, 0);
  const header = `git diff \u2014 ${files.length} file${files.length === 1 ? "" : "s"} changed, +${totalAdded} -${totalDeleted}`;
  const fileLines = files.map((f) => {
    const stats = `+${f.additions} -${f.deletions}`;
    const hunks = `(${f.hunks.length} hunk${f.hunks.length === 1 ? "" : "s"})`;
    return `  ${f.path.padEnd(48)}  ${stats.padEnd(10)}  ${hunks}`;
  });
  const sizes = files.map((f) => f.hunks.reduce((s, h) => s + h.bytes, 0));
  const shares = fairShares(sizes, DIFF_BODY_BYTES);
  const head = preamble.join(`
`).trim();
  const headLines = head ? head.split(`
`) : [];
  const cut = headLines.length - MAX_PREAMBLE_LINES;
  const commit = cut > 0 ? [...headLines.slice(0, MAX_PREAMBLE_LINES), `  \u2026 ${cut} more commit header lines`] : headLines;
  const body = files.flatMap((f, i) => renderFile(f, shares[i]));
  const overview = shares.some((s, i) => s < sizes[i]) ? [...fileLines, ""] : [];
  return { summary: [header, ...overview, ...commit.length ? [...commit, ""] : [], ...body].join(`
`), originalSize };
}, gitLogHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
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
    } else if (hash && !seenBlank && (line.startsWith("Author:") || line.startsWith("Date:") || line.startsWith("Merge:") || line.startsWith("gpgsig ") || line.startsWith(" ") && line.trim() !== "")) {} else if (hash && line.trim() === "" && !seenBlank) {
      seenBlank = true;
    } else if (hash && seenBlank && line.startsWith("    ") && line.trim()) {
      const subject = line.trim().slice(0, 72);
      commits.push(`  ${hash}  ${subject}`);
      hash = "";
      seenBlank = false;
    }
  }
  if (commits.length === 0)
    return shellHandler(toolName, output);
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
}, MAX_STATUS_PATHS = 50, CONFLICT_CODES, LONG_CONFLICT, LONG_ENTRY, BRANCH_LINE, pathList = (label, paths) => `  ${label} (${paths.length}): ${paths.slice(0, MAX_STATUS_PATHS).join(", ")}${paths.length > MAX_STATUS_PATHS ? ` +${paths.length - MAX_STATUS_PATHS} more` : ""}`, gitStatusHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  if (!stdout.trim()) {
    return { summary: "[git status \u2014 clean working tree]", originalSize };
  }
  const parts = parseStatus(stdout);
  const { branch, staged, unstaged, untracked, conflicts } = parts;
  if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && conflicts.length === 0) {
    return shellHandler(toolName, output);
  }
  const lines = ["git status", ...branch.map((b) => `  ${b}`)];
  if (conflicts.length > 0)
    lines.push(pathList("conflicts", conflicts));
  if (staged.length > 0)
    lines.push(pathList("staged", staged));
  if (unstaged.length > 0)
    lines.push(pathList("unstaged", unstaged));
  if (untracked.length > 0)
    lines.push(pathList("untracked", untracked));
  return { summary: lines.join(`
`), originalSize };
}, MAX_REFS = 25, gitRefsHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  const lines = stdout.split(`
`).filter((l) => l.trim());
  if (lines.length === 0)
    return shellHandler(toolName, output);
  if (lines.filter((l) => /^stash@\{\d+\}:/.test(l.trim())).length >= Math.ceil(lines.length * 0.5)) {
    const shown = lines.slice(0, MAX_REFS).map((l) => `  ${l.trim().slice(0, 100)}`);
    const overflow = lines.length > MAX_REFS ? [`  \u2026 (+${lines.length - MAX_REFS} more)`] : [];
    return { summary: [`git stash \u2014 ${lines.length} entr${lines.length === 1 ? "y" : "ies"}`, ...shown, ...overflow].join(`
`), originalSize };
  }
  if (lines.filter((l) => /\((fetch|push)\)\s*$/.test(l)).length >= Math.ceil(lines.length * 0.5)) {
    const remotes = new Map;
    for (const l of lines) {
      const m = l.match(/^(\S+)\s+(\S+)\s+\(fetch\)/);
      if (m)
        remotes.set(m[1], m[2]);
    }
    const shown = [...remotes].slice(0, MAX_REFS).map(([n, u]) => `  ${n} \u2192 ${u.slice(0, 80)}`);
    const overflow = remotes.size > MAX_REFS ? [`  \u2026 (+${remotes.size - MAX_REFS} more)`] : [];
    return { summary: [`git remote \u2014 ${remotes.size} remote${remotes.size === 1 ? "" : "s"}`, ...shown, ...overflow].join(`
`), originalSize };
  }
  const refOf = (l) => l.replace(/^[*+]?\s*/, "").trim();
  const branchLines = lines.filter((l) => {
    const r = refOf(l);
    return r.length > 0 && !/\s/.test(r);
  });
  if (branchLines.length >= Math.ceil(lines.length * 0.5)) {
    const current = lines.find((l) => l.trimStart().startsWith("* "));
    const remotes = branchLines.filter((l) => l.includes("remotes/")).length;
    const local = branchLines.length - remotes;
    const header = `git branch \u2014 ${local} local${remotes ? `, ${remotes} remote` : ""}${current ? ` (on ${current.replace(/^\s*\*\s*/, "").trim()})` : ""}`;
    const shown = branchLines.slice(0, MAX_REFS).map((l) => `  ${l.trim().slice(0, 80)}`);
    const overflow = branchLines.length > MAX_REFS ? [`  \u2026 (+${branchLines.length - MAX_REFS} more)`] : [];
    return { summary: [header, ...shown, ...overflow].join(`
`), originalSize };
  }
  return shellHandler(toolName, output);
};
var init_bash_git = __esm(() => {
  init_shell();
  init_bash_shared();
  init_clip();
  DIFF_BODY_BYTES = 4 * 1024;
  EXTENDED_HEADER = /^(old mode|new mode|deleted file mode|new file mode|copy (from|to)|rename (from|to)|(dis)?similarity index|Binary files|GIT binary patch)/;
  CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
  LONG_CONFLICT = /^(both modified|both added|both deleted|added by us|added by them|deleted by us|deleted by them):\s*/;
  LONG_ENTRY = /^(modified|new file|deleted|renamed|copied|typechange):\s*/;
  BRANCH_LINE = /^(On branch |HEAD detached |Your branch |## )/;
});

// src/handlers/bash-test.ts
function summarizeTestRun(output) {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}
${stderr}`.trim();
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  const failureLines2 = [];
  let failureNames = 0, passLines = 0, failLines = 0;
  let detailBudget = 0;
  for (const line of combined.split(`
`)) {
    const t = line.trim();
    if (!t)
      continue;
    if (/^\(pass\)\s/.test(t))
      passLines++;
    if (/^\(fail\)\s/.test(t))
      failLines++;
    const isName = /^(FAILED|FAIL)\s+/.test(t) || /^[\u2715\u2717\u00D7\u25CF]\s/.test(t) || /^\(fail\)\s/.test(t) || /^--- FAIL:/.test(t);
    const isMessage = /^error:\s/.test(t) || /^E\s{2,}\S/.test(line);
    if (isName) {
      failureNames++;
      failureLines2.push({ text: clipName(t), isName: true });
      detailBudget = t.startsWith("\u25CF") ? MAX_DETAIL_LINES : 0;
    } else if (isMessage) {
      failureLines2.push({ text: t.slice(0, MAX_LINE), isName: false });
      if (/^error:\s/.test(t))
        detailBudget = MAX_DETAIL_LINES;
    } else if (detailBudget > 0 && isDetail(t)) {
      failureLines2.push({ text: t.slice(0, MAX_LINE), isName: false });
      detailBudget--;
    }
  }
  let passed = 0, failed = 0, skipped = 0;
  let ranTotal;
  let foundSummary = false;
  for (const line of combined.split(`
`)) {
    const t = line.trim();
    const bunPass = t.match(/^(\d+)\s+pass$/);
    const bunFail = t.match(/^(\d+)\s+fail$/);
    const bunRan = t.match(/^Ran\s+(\d+)\s+tests?\s+across\b/);
    if (bunPass) {
      passed = parseInt(bunPass[1]);
      foundSummary = true;
    }
    if (bunFail) {
      failed = parseInt(bunFail[1]);
      foundSummary = true;
    }
    if (bunRan) {
      ranTotal = parseInt(bunRan[1]);
      foundSummary = true;
    }
    if (/\b\d+\s+(?:passed|failed)\b.*\bin\s+\d+(?:\.\d+)?s\b/.test(t)) {
      const count = (word) => parseInt(t.match(new RegExp(String.raw`(\d+)\s+${word}\b`))?.[1] ?? "0");
      passed = count("passed");
      failed = count("failed");
      skipped = count("skipped");
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
  if (!foundSummary && failureNames === 0)
    return null;
  if (passed === 0)
    passed = passLines;
  if (failed === 0)
    failed = failLines;
  const total = ranTotal ?? passed + failed + skipped;
  const isFail = failed > 0 || failureNames > 0;
  const status = isFail ? "FAIL" : "pass";
  const parts = [];
  if (passed > 0)
    parts.push(`${passed} passed`);
  if (failed > 0)
    parts.push(`${failed} failed`);
  if (skipped > 0)
    parts.push(`${skipped} skipped`);
  const summaryStr = parts.length > 0 ? parts.join(", ") : "no counts in output";
  const lines = [`test runner \u2014 ${status}: ${summaryStr}${total > 0 ? ` (${total} total)` : ""}`];
  if (isFail && failureLines2.length > 0) {
    const kept = selectFailureLines(failureLines2, MAX_BUILD_ERRORS);
    lines.push(`  failures:`);
    lines.push(...kept.map((l) => `    ${l.text}`));
    if (failureLines2.length > kept.length) {
      lines.push(`    \u2026 (+${failureLines2.length - kept.length} more)`);
    }
  }
  return { summary: lines.join(`
`), originalSize };
}
function isDetail(t) {
  if (/^[-+]\s+(Expected|Received)\s+[-+]\s*\d+$/.test(t))
    return false;
  return /^(Expected|Received)\b/.test(t) || /^[-+]\s/.test(t);
}
function clipName(t) {
  const name = t.replace(/\s+\[\d+(?:\.\d+)?m?s\]$/, "");
  if (name.length <= MAX_LINE)
    return name;
  return `${name.slice(0, NAME_HEAD)} \u2026 ${name.slice(-(MAX_LINE - NAME_HEAD - 3))}`;
}
function selectFailureLines(entries, max) {
  if (entries.length <= max)
    return entries;
  const names = entries.filter((e) => e.isName).length;
  let detailRoom = Math.max(0, max - names);
  let nameRoom = max;
  return entries.filter((e) => {
    if (e.isName)
      return nameRoom-- > 0;
    if (detailRoom > 0 && nameRoom > 0) {
      detailRoom--;
      nameRoom--;
      return true;
    }
    return false;
  });
}
var testRunnerHandler = (toolName, output) => summarizeTestRun(output) ?? shellHandler(toolName, output), MAX_DETAIL_LINES = 4, MAX_LINE = 160, NAME_HEAD = 60;
var init_bash_test = __esm(() => {
  init_shell();
  init_bash_shared();
});

// src/handlers/bash-docker.ts
var dockerPsHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
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
var init_bash_docker = __esm(() => {
  init_shell();
  init_bash_shared();
});

// src/handlers/bash-compilers.ts
var MAX_MESSAGE_LEN = 100, TSC_RE, FILE_LOC_RE, SEVERITY_RE, RUFF_CODE_RE, CARGO_LOC_RE, ESLINT_FILE_RE, ESLINT_RE, CARGO_ERR_SUM_RE, CARGO_WARN_SUM_RE, ESLINT_SUM_RE, RUFF_SUM_RE, TSC_SUM_RE, CARGO_ABORT_RE, clip = (s) => s.trim().slice(0, MAX_MESSAGE_LEN), compilerDiagnosticsHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}
${stderr}`;
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  const exitCode = extractExitCode(output);
  const diagnostics = [];
  let summaryErrors = null;
  let summaryWarnings = null;
  let eslintFile = null;
  for (const raw of combined.split(`
`)) {
    const t = raw.trimEnd();
    if (!t.trim())
      continue;
    let m;
    if (m = t.match(CARGO_ERR_SUM_RE)) {
      summaryErrors = (summaryErrors ?? 0) + parseInt(m[1], 10);
      continue;
    }
    if (m = t.match(CARGO_WARN_SUM_RE)) {
      summaryWarnings = parseInt(m[1], 10);
      continue;
    }
    if (m = t.match(ESLINT_SUM_RE)) {
      summaryErrors = parseInt(m[1], 10);
      summaryWarnings = parseInt(m[2], 10);
      continue;
    }
    if (m = t.match(RUFF_SUM_RE)) {
      summaryErrors = parseInt(m[1], 10);
      continue;
    }
    if (m = t.match(TSC_SUM_RE)) {
      summaryErrors = parseInt(m[1], 10);
      continue;
    }
    if (CARGO_ABORT_RE.test(t))
      continue;
    if (m = t.match(TSC_RE)) {
      diagnostics.push({ severity: m[4], location: `${m[1]}:${m[2]}`, message: clip(m[5]), labeled: true });
      continue;
    }
    if (m = t.match(FILE_LOC_RE)) {
      const sev = m[4];
      if (sev === "note")
        continue;
      diagnostics.push({ severity: sev ?? "error", location: `${m[1]}:${m[2]}`, message: clip(m[5]), labeled: sev !== undefined });
      continue;
    }
    if (m = t.match(SEVERITY_RE)) {
      diagnostics.push({ severity: m[1], location: null, message: clip(m[2]), labeled: true });
      continue;
    }
    if (RUFF_CODE_RE.test(t)) {
      diagnostics.push({ severity: "error", location: null, message: clip(t), labeled: false });
      continue;
    }
    if (m = t.match(CARGO_LOC_RE)) {
      const last = diagnostics[diagnostics.length - 1];
      if (last && last.location === null)
        last.location = m[1];
      continue;
    }
    if (ESLINT_FILE_RE.test(t)) {
      eslintFile = t.trim();
      continue;
    }
    if (m = t.match(ESLINT_RE)) {
      const loc = eslintFile ? `${eslintFile}:${m[1]}` : `${m[1]}:${m[2]}`;
      diagnostics.push({ severity: m[3], location: loc, message: clip(m[4]), labeled: true });
      continue;
    }
  }
  if (diagnostics.length === 0 && summaryErrors === null && summaryWarnings === null) {
    return shellHandler(toolName, output);
  }
  const cleanExit = exitCode === 0;
  const visible = cleanExit ? diagnostics.filter((d) => d.labeled) : diagnostics;
  const diagErrors = visible.filter((d) => d.severity === "error").length;
  const diagWarnings = visible.filter((d) => d.severity === "warning").length;
  const errorCount = summaryErrors ?? diagErrors;
  const warnCount = summaryWarnings ?? diagWarnings;
  const failed = exitCode !== undefined ? exitCode !== 0 : errorCount > 0;
  const status = failed ? "\u2717" : "\u2713";
  const parts = [];
  if (errorCount > 0)
    parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  if (warnCount > 0)
    parts.push(`${warnCount} warning${warnCount === 1 ? "" : "s"}`);
  const headline = `${status} ${parts.length ? parts.join(", ") : failed ? "failed" : "clean"}`;
  const ordered = [
    ...visible.filter((d) => d.severity === "error"),
    ...visible.filter((d) => d.severity === "warning")
  ];
  const shown = ordered.slice(0, MAX_BUILD_ERRORS).map((d) => {
    const label = d.severity === "warning" ? "warn" : "error";
    return `  ${label}: ${d.location ? d.location + " \u2014 " : ""}${d.message}`;
  });
  const overflow = ordered.length > MAX_BUILD_ERRORS ? [`  \u2026 (+${ordered.length - MAX_BUILD_ERRORS} more)`] : [];
  return { summary: [headline, ...shown, ...overflow].join(`
`), originalSize };
};
var init_bash_compilers = __esm(() => {
  init_shell();
  init_bash_shared();
  TSC_RE = /^(\S+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/;
  FILE_LOC_RE = /^(\S*\.\w+):(\d+)(?::(\d+))?:\s+(?:(error|warning|note):\s+)?(.+)$/;
  SEVERITY_RE = /^(error|warning)(?:\[[A-Za-z]?\d+\])?:\s+(.+)$/;
  RUFF_CODE_RE = /^[A-Z]{1,4}\d{3,4} \S.*$/;
  CARGO_LOC_RE = /^\s*-->\s+(\S+:\d+(?::\d+)?)/;
  ESLINT_FILE_RE = /^(\/?\S+\.\w+)$/;
  ESLINT_RE = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}[\w./-]+)?$/;
  CARGO_ERR_SUM_RE = /could not compile .*? due to (\d+) previous error/i;
  CARGO_WARN_SUM_RE = /generated (\d+) warning/i;
  ESLINT_SUM_RE = /[\u2716\u2717x]\s+\d+\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/i;
  RUFF_SUM_RE = /Found (\d+) error/i;
  TSC_SUM_RE = /Found (\d+) errors?\b/i;
  CARGO_ABORT_RE = /^error: aborting due to \d+ previous error/i;
});

// src/handlers/bash-search.ts
function overflowLine(total, shown, noun) {
  return total > shown ? [`  \u2026 (+${total - shown} more ${noun})`] : [];
}
function utf8(s) {
  return Buffer.byteLength(s, "utf8");
}
function stdoutLineCount(output) {
  const lines = extractStdout(output).split(`
`);
  while (lines.length > 0 && lines[lines.length - 1].trim() === "")
    lines.pop();
  return lines.length;
}
function fitUnderFallback(toolName, output, total, build) {
  const fallback = shellHandler(toolName, output);
  const budget = utf8(fallback.summary);
  const maxShown = Math.min(MAX_SAMPLE, total);
  const fits = (n) => utf8(build(n).summary) <= budget;
  if (fits(maxShown))
    return build(maxShown);
  if (stdoutLineCount(output) <= HEAD_STDOUT)
    return fallback;
  if (!fits(0))
    return fallback;
  let best = 0;
  let lo = 0;
  let hi = maxShown;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const candidate = build(best);
  return utf8(candidate.summary) > budget ? fallback : candidate;
}
var MAX_SAMPLE = 40, clip2 = (s, n = 100) => s.length > n ? s.slice(0, n) + "\u2026" : s, GREP_LINE_RE, grepHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  const lines = stdout.split(`
`).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { summary: "[grep \u2014 no matches]", originalSize };
  }
  const matches = [];
  const files = new Set;
  for (const l of lines) {
    const m = l.match(GREP_LINE_RE);
    if (m) {
      matches.push({ file: m[1], line: m[2], text: m[3] });
      files.add(m[1]);
    }
  }
  if (matches.length < Math.ceil(lines.length * 0.5)) {
    return shellHandler(toolName, output);
  }
  const header = `grep \u2014 ${matches.length} match${matches.length === 1 ? "" : "es"} in ${files.size} file${files.size === 1 ? "" : "s"}`;
  return fitUnderFallback(toolName, output, matches.length, (shown) => ({
    summary: [
      header,
      ...matches.slice(0, shown).map((m) => `  ${m.file}:${m.line}: ${clip2(m.text.trim())}`),
      ...overflowLine(matches.length, shown, "matches")
    ].join(`
`),
    originalSize
  }));
}, LS_LONG_RE, LS_RECURSIVE_HEADER_RE, lsHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  const raw = stdout.split(`
`);
  const nonEmpty = raw.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) {
    return { summary: "[ls \u2014 empty]", originalSize };
  }
  const dirHeaders = nonEmpty.filter((l) => LS_RECURSIVE_HEADER_RE.test(l.trim()));
  const hasBlankSeparator = raw.some((l) => l.trim() === "");
  if (dirHeaders.length >= 2 && hasBlankSeparator) {
    const entries = nonEmpty.length - dirHeaders.length - nonEmpty.filter((l) => /^total\s+\d+$/.test(l.trim())).length;
    const header2 = `ls -R \u2014 ${dirHeaders.length} directories, ~${entries} entries`;
    return fitUnderFallback(toolName, output, dirHeaders.length, (shown) => ({
      summary: [
        header2,
        ...dirHeaders.slice(0, shown).map((d) => `  ${d.trim()}`),
        ...overflowLine(dirHeaders.length, shown, "directories")
      ].join(`
`),
      originalSize
    }));
  }
  const longLines = nonEmpty.filter((l) => LS_LONG_RE.test(l));
  if (longLines.length >= Math.ceil(nonEmpty.length * 0.5)) {
    let dirs = 0;
    const names = [];
    for (const l of longLines) {
      const m = l.match(LS_LONG_RE);
      if (m && m[1] === "d")
        dirs++;
      const name = l.split(/\s+/).slice(8).join(" ");
      if (name)
        names.push(name);
    }
    const files = longLines.length - dirs;
    const header2 = `ls \u2014 ${longLines.length} entries (${dirs} dir${dirs === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"})`;
    return fitUnderFallback(toolName, output, names.length, (shown) => ({
      summary: [
        header2,
        ...names.slice(0, shown).map((n) => `  ${clip2(n)}`),
        ...overflowLine(names.length, shown, "entries")
      ].join(`
`),
      originalSize
    }));
  }
  const tokens = nonEmpty.flatMap((l) => l.split(/\s{2,}|\t/)).map((t) => t.trim()).filter(Boolean);
  if (tokens.length < 2)
    return shellHandler(toolName, output);
  const header = `ls \u2014 ${tokens.length} entries`;
  return fitUnderFallback(toolName, output, tokens.length, (shown) => ({
    summary: [
      header,
      ...tokens.slice(0, shown).map((n) => `  ${clip2(n)}`),
      ...overflowLine(tokens.length, shown, "entries")
    ].join(`
`),
    originalSize
  }));
}, findHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  const paths = stdout.split(`
`).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  if (paths.length === 0) {
    return { summary: "[find \u2014 no results]", originalSize };
  }
  const pathLike = paths.filter((p) => !/^\s/.test(p) && !/^find: /.test(p));
  if (pathLike.length < Math.ceil(paths.length * 0.7)) {
    return shellHandler(toolName, output);
  }
  const header = `find \u2014 ${paths.length} path${paths.length === 1 ? "" : "s"}`;
  return fitUnderFallback(toolName, output, paths.length, (shown) => ({
    summary: [
      header,
      ...paths.slice(0, shown).map((p) => `  ${clip2(p, 120)}`),
      ...overflowLine(paths.length, shown, "paths")
    ].join(`
`),
    originalSize
  }));
};
var init_bash_search = __esm(() => {
  init_shell();
  init_bash_shared();
  GREP_LINE_RE = /^(.+?):(\d+):(.*)$/;
  LS_LONG_RE = /^([-dlbcps])[rwxsStT-]{9}[+@.]?\s+\d+\s/;
  LS_RECURSIVE_HEADER_RE = /^(\.?[^\s:]*):$/;
});

// src/handlers/bash.ts
function quotedCommand(arg) {
  const s = arg.trim();
  let body;
  let rest;
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    if (end === -1)
      return null;
    body = s.slice(1, end);
    rest = s.slice(end + 1);
  } else if (s.startsWith('"')) {
    const m = s.match(/^"((?:[^"\\]|\\[\s\S])*)"/);
    if (!m)
      return null;
    body = m[1].replace(/\\(["\\`$])/g, "$1");
    rest = s.slice(m[0].length);
  } else {
    return s;
  }
  if (rest.trim() === "")
    return body.trim();
  return /^\s*[|;&<>]/.test(rest) ? `${body.trim()} ${rest.trim()}` : null;
}
function skipOptions(args, withValue, flags, long = {}) {
  let rest = args;
  for (let i = 0;i < 16; i++) {
    const opt = rest.match(/^(-[^\s'"]*)(?:\s+|$)/);
    if (!opt)
      return rest;
    rest = rest.slice(opt[0].length);
    const word = opt[1];
    if (word === "--")
      return rest;
    let needsValue = false;
    if (word.startsWith("--")) {
      const [name, inline] = word.slice(2).split("=", 2);
      if (!(name in long))
        return null;
      needsValue = long[name] && inline === undefined;
    } else {
      for (let j = 1;j < word.length; j++) {
        const ch = word[j];
        if (withValue.includes(ch)) {
          needsValue = j === word.length - 1;
          break;
        }
        if (!flags.includes(ch))
          return null;
      }
    }
    if (needsValue) {
      const value = rest.match(/^[^\s'"]+(?:\s+|$)/);
      if (!value)
        return null;
      rest = rest.slice(value[0].length);
    }
  }
  return null;
}
function unwrapCommand(command) {
  let c = command.trim();
  const wrappers = [];
  for (let i = 0;i < 8; i++) {
    const cd = c.match(CD_PREFIX);
    if (cd) {
      c = cd[1].trim();
      continue;
    }
    const wrapper = WRAPPER_PREFIXES.map((re) => c.match(re)).find((m) => m !== null);
    if (wrapper) {
      c = c.slice(wrapper[0].length);
      continue;
    }
    const inner = REMOTE_WRAPPERS.map(({ label, unwrap }) => ({ label, inner: unwrap(c) })).find((r) => r.inner !== null && r.inner !== "");
    if (!inner)
      break;
    if (inner.label)
      wrappers.push(inner.label);
    c = inner.inner;
  }
  c = c.replace(/^git\s+(?:(?:--no-pager|--paginate|-P)\s+|-[cC]\s+\S+\s+)+/, "git ");
  return { command: c, wrappers };
}
function normalizeCommand(command) {
  return unwrapCommand(command).command;
}
function bashFingerprint(command) {
  const { command: inner, wrappers } = unwrapCommand(command);
  return [...wrappers, commandFingerprint(inner)].filter((s) => s !== "").join(" ");
}
function commandFingerprint(command) {
  let c = command.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, "");
  for (let i = 0;i < 4; i++) {
    const w = c.match(/^([a-zA-Z][\w-]*)\s+(?=[a-zA-Z])/);
    if (!w || !WRAPPER_TOOLS.has(w[1]))
      break;
    c = c.slice(w[0].length);
  }
  const first = c.match(BARE_TOKEN);
  if (!first)
    return "";
  const verb = first[1];
  if (!SUBCOMMAND_TOOLS.has(verb))
    return verb;
  const second = c.slice(verb.length).trimStart().match(BARE_TOKEN);
  return second ? `${verb} ${second[1]}` : verb;
}
function splitTopLevel(command) {
  const parts = [];
  let quote = null;
  let depth = 0;
  let start = 0;
  for (let i = 0;i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'")
        quote = null;
    } else if (ch === "\\") {
      i++;
    } else if (quote) {
      if (ch === quote)
        quote = null;
    } else if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && (ch === "|" || ch === ";" || ch === "&" || ch === `
`)) {
      parts.push(command.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(command.slice(start));
  return parts.filter((p) => p.trim() !== "");
}
function unwrappedSegments(command, depth = 0) {
  return splitTopLevel(command).flatMap((part) => {
    const c = normalizeCommand(part);
    return depth < 3 && splitTopLevel(c).length > 1 ? unwrappedSegments(c, depth + 1) : [c];
  });
}
function commandSegments(command) {
  const unquoted = command.split(/\||;|&&|\n/).map((part) => normalizeCommand(part));
  return [...unwrappedSegments(command), ...unquoted];
}
function isBoundedRead(command) {
  return commandSegments(command).some((s) => {
    if (/^(head|tail)(\s|$)/.test(s))
      return true;
    if (SED_LINE_RANGE.test(s))
      return true;
    return /^(grep|egrep|fgrep|rg|ag|git\s+grep)\s/.test(s) && /\s(-[a-zA-Z]*[ABCm]\s*\d+|--(?:after-|before-)?context[=\s]\d+|--max-count[=\s]\d+)/.test(s);
  });
}
function isContentRead(command) {
  return isBoundedRead(command) || commandSegments(command).some((s) => /^(cat|git\s+(diff|show))(\s|$)/.test(s) || /^git\s+(log|stash\s+show)(\s.*)?\s(-p|--patch|-u)(\s|$)/.test(s) || /^rtk\s+(?:-\S+\s+)*(read|recall)(\s|$)/.test(s));
}
function isFileRead(command) {
  const [first = "", ...rest] = splitTopLevel(command).map((s) => normalizeCommand(s));
  if (/^cat\s+<</.test(first))
    return false;
  const reads = /^(cat|head|tail)(\s|$)/.test(first) || SED_LINE_RANGE.test(first) || /^rtk\s+(?:-\S+\s+)*read(\s|$)/.test(first);
  return reads && rest.every((s) => PIPE_FILTER.test(s));
}
function isCompoundCommand(command) {
  let quote = null;
  let depth = 0;
  for (let i = 0;i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'")
        quote = null;
      continue;
    }
    if (ch === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote)
        quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`")
      quote = ch;
    else if (ch === "(")
      depth++;
    else if (ch === ")")
      depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const pair = command.slice(i, i + 2);
      const width = pair === "&&" || pair === "||" ? 2 : ch === ";" || ch === `
` ? 1 : 0;
      if (width > 0 && command.slice(i + width).trim() !== "")
        return true;
    }
  }
  return false;
}
function getBashHandler(input) {
  const rawCommand = extractCommand(input);
  if (!rawCommand)
    return shellHandler;
  const { command, wrappers } = unwrapCommand(rawCommand);
  if (isCompoundCommand(command))
    return compoundHandler;
  if (isFileRead(command))
    return contentReadHandler;
  if (wrappers.includes("rtk"))
    return shellHandler;
  if (/^git\s+grep(\s|$)/.test(command))
    return grepHandler;
  if (/^git\s+(diff|show)(\s|$)/.test(command))
    return gitDiffHandler;
  if (/^git\s+log(\s|$)/.test(command))
    return gitLogHandler;
  if (/^git\s+status(\s|$)/.test(command))
    return gitStatusHandler;
  if (/^git\s+branch(\s|$)/.test(command))
    return gitRefsHandler;
  if (/^git\s+stash\s+list(\s|$)/.test(command))
    return gitRefsHandler;
  if (/^git\s+remote(\s|$)/.test(command))
    return gitRefsHandler;
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
  if (/^cargo\s+(build|check|clippy)(\s|$)/.test(command))
    return compilerDiagnosticsHandler;
  if (/^go\s+(build|vet)(\s|$)/.test(command))
    return compilerDiagnosticsHandler;
  if (/^(npx\s+)?tsc(\s|$)/.test(command))
    return compilerDiagnosticsHandler;
  if (/^(npx\s+)?eslint(\s|$)/.test(command))
    return compilerDiagnosticsHandler;
  if (/^ruff(\s|$)/.test(command))
    return compilerDiagnosticsHandler;
  if (/^(npm|pnpm|yarn|bun)\s+run\s+(typecheck|lint|build|check)(\s|$)/.test(command))
    return compilerDiagnosticsHandler;
  if (/^(grep|egrep|fgrep|rg|ag)(\s|$)/.test(command))
    return grepHandler;
  if (/^ls(\s|$)/.test(command))
    return lsHandler;
  if (/^(find|fd)(\s|$)/.test(command))
    return findHandler;
  return shellHandler;
}
function keepStderrError(handler, output) {
  if (READS_STDERR.has(handler))
    return handler;
  return !extractStdout(output).trim() && extractStderr(output).trim() ? shellHandler : handler;
}
var TERRAFORM_RESOURCE_RE, TERRAFORM_PLAN_SUMMARY_RE, TERRAFORM_SYMBOL, terraformPlanHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
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
}, packageInstallHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}
${stderr}`.trim();
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
  const warnings = [];
  const errors3 = [];
  for (const line of combined.split(`
`)) {
    const t = line.trim();
    if (!t)
      continue;
    if (/^(npm warn|warn |warning )/i.test(t))
      warnings.push(t.slice(0, 100));
    else if (/^(npm error|error |err )/i.test(t))
      errors3.push(t.slice(0, 100));
  }
  let countLine2 = null;
  const bunMatch = combined.match(/(\d+)\s+packages?\s+installed/i);
  if (bunMatch)
    countLine2 = `${bunMatch[1]} packages installed`;
  if (!countLine2) {
    const npmMatch = combined.match(/added\s+(\d+)[^,\n]*/i);
    if (npmMatch)
      countLine2 = npmMatch[0].trim().slice(0, 60);
  }
  if (!countLine2) {
    const pipMatch = combined.match(/Successfully installed (.+)/);
    if (pipMatch) {
      const pkgs = pipMatch[1].trim().split(/\s+/);
      countLine2 = `pip: ${pkgs.length} package${pkgs.length === 1 ? "" : "s"} installed`;
    }
  }
  if (!countLine2) {
    const yarnMatch = combined.match(/success Saved (\d+) new dependenc/i);
    if (yarnMatch)
      countLine2 = `yarn: ${yarnMatch[1]} new dependencies saved`;
  }
  if (!countLine2 && errors3.length === 0) {
    return shellHandler(toolName, output);
  }
  const lines = [countLine2 ?? "package install"];
  if (warnings.length > 0)
    lines.push(`  ${warnings.length} warning${warnings.length === 1 ? "" : "s"}${warnings.length <= 3 ? ": " + warnings.join("; ") : ""}`);
  if (errors3.length > 0)
    lines.push(...errors3.slice(0, 5).map((e) => `  error: ${e}`));
  return { summary: lines.join(`
`), originalSize };
}, buildToolHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const stderr = extractStderr(output);
  const combined = `${stdout}
${stderr}`.trim();
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
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
  const tests = summarizeTestRun(output);
  if (tests) {
    const extra = errorLines.filter((e) => !tests.summary.includes(e));
    if (extra.length === 0)
      return tests;
    const lines2 = [tests.summary, `  build errors (${extra.length}):`];
    lines2.push(...extra.slice(0, MAX_BUILD_ERRORS).map((e) => `    ${e}`));
    if (extra.length > MAX_BUILD_ERRORS)
      lines2.push(`    \u2026 (+${extra.length - MAX_BUILD_ERRORS} more)`);
    return { summary: lines2.join(`
`), originalSize };
  }
  if (errorLines.length === 0 && targetLines.length === 0) {
    return shellHandler(toolName, output);
  }
  const exitCode = extractExitCode(output);
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
}, ghHandler = (toolName, output) => {
  const stdout = extractStdout(output);
  const originalSize = Buffer.byteLength(bashOutputText(output), "utf8");
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
    const meta2 = kvLines.slice(0, 5).map((l) => {
      const [key, ...vals] = l.split("\t");
      return `  ${(key ?? "").replace(/:$/, "")}: ${vals.join(" ").trim().slice(0, 100)}`;
    });
    return {
      summary: `gh view
${meta2.join(`
`)}`,
      originalSize
    };
  }
  return shellHandler(toolName, output);
}, CD_PREFIX, ASSIGN, NEXT, WRAPPER_PREFIXES, SSH_WITH_VALUE = "BbcDEeFIiJLlmOoPpQRSWw", SSH_FLAGS = "46AaCfGgKkMnqsTtVvXxYy", DOCKER_EXEC_WITH_VALUE = "euw", DOCKER_EXEC_FLAGS = "dit", DOCKER_EXEC_LONG, TARGET, REMOTE_WRAPPERS, RTK_OWN_READ, SUBCOMMAND_TOOLS, WRAPPER_TOOLS, BARE_TOKEN, READ_PASSTHROUGH_MAX_BYTES, SED_LINE, SED_LINE_RANGE, PIPE_FILTER, COMPOUND_HEAD_LINES = 30, COMPOUND_TAIL_LINES = 15, compoundHandler = (_toolName, output) => {
  const text = bashOutputText(output);
  const originalSize = Buffer.byteLength(text, "utf8");
  const lines = text.split(`
`);
  if (lines.length <= COMPOUND_HEAD_LINES + COMPOUND_TAIL_LINES) {
    return { summary: lines.map((l) => clipLine(l)).join(`
`), originalSize };
  }
  const window = summarizeLineWindow(lines, COMPOUND_HEAD_LINES, COMPOUND_TAIL_LINES);
  return { summary: `[bash \xB7 compound command \xB7 ${lines.length} lines]
${window}`, originalSize };
}, READS_STDERR;
var init_bash = __esm(() => {
  init_shell();
  init_bash_shared();
  init_bash_git();
  init_bash_test();
  init_bash_docker();
  init_bash_compilers();
  init_bash_search();
  init_generic();
  init_clip();
  init_bash_git();
  init_bash_test();
  init_bash_docker();
  init_bash_compilers();
  init_bash_search();
  TERRAFORM_RESOURCE_RE = /^\s+#\s+(.+?)\s+will\s+be\s+(created|destroyed|updated in-place|replaced)/;
  TERRAFORM_PLAN_SUMMARY_RE = /^Plan:\s+.+$/m;
  TERRAFORM_SYMBOL = {
    created: "+",
    destroyed: "-",
    "updated in-place": "~",
    replaced: "-/+"
  };
  CD_PREFIX = /^cd\s+(?:"[^"]*"|'[^']*'|(?:\\[\s\S]|[^\s\\&;|<>])+)[ \t]*(?:&&|;|\r?\n)\s*(.+)$/s;
  ASSIGN = String.raw`[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s"']*)`;
  NEXT = String.raw`(?=[A-Za-z_./~])`;
  WRAPPER_PREFIXES = [
    new RegExp(String.raw`^timeout\s+(?:(?:-[sk]\s+\S+|--[a-z-]+(?:=\S+)?|-v)\s+)*\d+(?:\.\d+)?[smhd]?\s+${NEXT}`),
    new RegExp(String.raw`^time(?:\s+-p)?\s+${NEXT}`),
    new RegExp(String.raw`^nice(?:\s+(?:-n\s*-?\d+|--adjustment=-?\d+|-\d+))?\s+${NEXT}`),
    new RegExp(String.raw`^env(?:\s+-i)?(?:\s+${ASSIGN})*\s+${NEXT}`),
    new RegExp(String.raw`^(?:${ASSIGN}\s+)+${NEXT}`),
    new RegExp(String.raw`^(?:sudo|doas)\s+${NEXT}`)
  ];
  DOCKER_EXEC_LONG = {
    detach: false,
    interactive: false,
    tty: false,
    privileged: false,
    env: true,
    "env-file": true,
    user: true,
    workdir: true,
    "detach-keys": true
  };
  TARGET = /^[A-Za-z0-9_][\w.@:-]*\s+/;
  REMOTE_WRAPPERS = [
    {
      label: "rtk",
      unwrap: (c) => {
        const m = c.match(/^rtk\s+(?:(?:-v+|--verbose|--skip-env)\s+)*/);
        const inner = m ? c.slice(m[0].length) : null;
        return inner === null || RTK_OWN_READ.test(inner) ? null : inner;
      }
    },
    {
      label: "ssh",
      unwrap: (c) => {
        const args = c.match(/^ssh\s+/) ? skipOptions(c.replace(/^ssh\s+/, ""), SSH_WITH_VALUE, SSH_FLAGS) : null;
        const host = args?.match(TARGET);
        return host ? quotedCommand(args.slice(host[0].length)) : null;
      }
    },
    {
      label: "pct exec",
      unwrap: (c) => {
        const m = c.match(/^pct\s+exec\s+\d+\s+(?:--\s+)?/);
        return m ? quotedCommand(c.slice(m[0].length)) : null;
      }
    },
    {
      label: "docker exec",
      unwrap: (c) => {
        const args = c.match(/^docker\s+exec\s+/) ? skipOptions(c.replace(/^docker\s+exec\s+/, ""), DOCKER_EXEC_WITH_VALUE, DOCKER_EXEC_FLAGS, DOCKER_EXEC_LONG) : null;
        const ctr = args?.match(TARGET);
        return ctr ? quotedCommand(args.slice(ctr[0].length)) : null;
      }
    },
    {
      label: null,
      unwrap: (c) => {
        const m = c.match(/^(?:ba)?sh\s+-[elx]*c[elx]*\s+(?=['"])/);
        return m ? quotedCommand(c.slice(m[0].length)) : null;
      }
    }
  ];
  RTK_OWN_READ = /^(read|recall)(\s|$)/;
  SUBCOMMAND_TOOLS = new Set([
    "git",
    "cargo",
    "go",
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "docker",
    "kubectl",
    "rtk"
  ]);
  WRAPPER_TOOLS = new Set(["sudo", "doas", "time", "nice"]);
  BARE_TOKEN = /^([a-zA-Z][\w-]*)(?=[\s;&|<>()]|$)/;
  READ_PASSTHROUGH_MAX_BYTES = 8 * 1024;
  SED_LINE = String.raw`(?:\d+|\$(?:\w+|\{\w+\}|\(\([^()]*\)\))|\$)`;
  SED_LINE_RANGE = new RegExp(String.raw`^sed\s+(?:-\S+\s+)*-n\s+['"]?${SED_LINE}(?:,\s*\+?${SED_LINE})?p['"]?(\s|$)`);
  PIPE_FILTER = /^(grep|egrep|fgrep|rg|head|tail|sed|awk|cut|sort|uniq|wc|tr|nl|column|less|cat)(\s|$)/;
  READS_STDERR = new Set([
    shellHandler,
    contentReadHandler,
    compoundHandler,
    testRunnerHandler,
    buildToolHandler,
    compilerDiagnosticsHandler,
    packageInstallHandler
  ]);
});

// src/handlers/linear.ts
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
function summariseIssue(issue2, includeDesc = true) {
  const parts = [];
  const id = issue2["identifier"] ?? issue2["id"];
  if (id != null)
    parts.push(String(id));
  if (typeof issue2["title"] === "string")
    parts.push(`"${issue2["title"]}"`);
  const state = stateLabel(issue2["state"] ?? issue2["stateName"]);
  if (state)
    parts.push(`[${state}]`);
  const priority = priorityLabel(issue2["priority"]);
  if (priority)
    parts.push(`Priority: ${priority}`);
  const url = issue2["url"] ?? issue2["branchName"];
  if (typeof url === "string" && url.startsWith("http"))
    parts.push(url);
  const lines = [parts.join(" \xB7 ")];
  if (includeDesc) {
    const desc = issue2["description"];
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
var PRIORITY_LABEL, DESC_CHARS = 200, MAX_LIST_ITEMS = 10, linearHandler = (_toolName, output) => {
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
  const lines = issues.slice(0, MAX_LIST_ITEMS).map((issue2, i) => `${i + 1}. ${summariseIssue(issue2, false)}`);
  const more = issues.length > MAX_LIST_ITEMS ? `
\u2026and ${issues.length - MAX_LIST_ITEMS} more` : "";
  return {
    summary: `${issues.length} Linear issues:
${lines.join(`
`)}${more}`,
    originalSize
  };
};
var init_linear = __esm(() => {
  init_types();
  PRIORITY_LABEL = {
    0: "No Priority",
    1: "Urgent",
    2: "High",
    3: "Medium",
    4: "Low"
  };
});

// src/handlers/slack.ts
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
var MSG_CHARS = 200, MAX_MESSAGES = 10, slackHandler = (_toolName, output) => {
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
var init_slack = __esm(() => {
  init_types();
});

// src/handlers/tavily.ts
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
var SNIPPET_CHARS = 150, MAX_RESULTS = 10, tavilyHandler = (_toolName, output) => {
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
var init_tavily = __esm(() => {
  init_types();
});

// src/handlers/database.ts
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
var MAX_PREVIEW_ROWS = 10, MAX_COLS_DISPLAY = 8, databaseHandler = (_toolName, output) => {
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
var init_database = __esm(() => {
  init_types();
});

// src/handlers/sentry.ts
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
  const meta2 = [];
  if (typeof event["level"] === "string")
    meta2.push(`[${event["level"]}]`);
  if (typeof event["environment"] === "string")
    meta2.push(`env:${event["environment"]}`);
  if (typeof event["release"] === "string")
    meta2.push(`release:${event["release"]}`);
  if (typeof event["event_id"] === "string")
    meta2.push(`id:${event["event_id"].slice(0, 8)}`);
  if (meta2.length > 0)
    parts.push(meta2.join(" "));
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
var MAX_FRAMES = 8, sentryHandler = (_toolName, output) => {
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
var init_sentry = __esm(() => {
  init_types();
});

// src/handlers/stripe.ts
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
function summariseList(items, summarise) {
  const lines = items.slice(0, MAX_ITEMS).map((item) => typeof item === "object" && item !== null ? summarise(item) : String(item));
  const overflow = items.length > MAX_ITEMS ? `
\u2026and ${items.length - MAX_ITEMS} more` : "";
  return lines.join(`
`) + overflow;
}
var ZERO_DECIMAL, MAX_ITEMS = 10, stripeHandler = (toolName, output) => {
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
var init_stripe = __esm(() => {
  init_types();
  ZERO_DECIMAL = new Set([
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
});

// src/handlers/csv.ts
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
function looksLikeCsv(text) {
  const lines = text.split(`
`).filter((l) => l.trim().length > 0);
  if (lines.length < 3)
    return false;
  const firstLineCommas = (lines[0].match(/,/g) ?? []).length;
  return firstLineCommas >= 2;
}
var MAX_PREVIEW_ROWS2 = 5, csvHandler = (_toolName, output) => {
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
var init_csv = __esm(() => {
  init_types();
});

// src/handlers/content-blocks.ts
var contentBlockHandler = (_toolName, output) => {
  const originalSize = payloadByteLength(output);
  const blocks = asMcpContentBlocks(output);
  const text = blocks ? joinTextBlocks(blocks) : extractText(output);
  const stripped = blocks?.filter((b) => b.type !== "text") ?? [];
  if (stripped.length === 0) {
    return { summary: text, originalSize };
  }
  const types2 = [...new Set(stripped.map((b) => b.type))];
  const label = types2.length === 1 ? types2[0] : "non-text";
  const note = `[stripped ${stripped.length} ${label} content block${stripped.length === 1 ? "" : "s"}]`;
  const summary = text.length > 0 ? `${text}
${note}` : note;
  return { summary, originalSize };
};
var init_content_blocks = __esm(() => {
  init_types();
});

// src/profiles/loader.ts
import { readdirSync as readdirSync2, readFileSync as readFileSync2, statSync as statSync3 } from "fs";
import { join as join4 } from "path";
import { homedir as homedir3 } from "os";
function getUserProfilesDir() {
  return process.env.RECALL_USER_PROFILES_PATH ?? join4(homedir3(), ".config", "mcp-recall", "profiles");
}
function getCommunityProfilesDir() {
  return process.env.RECALL_COMMUNITY_PROFILES_PATH ?? join4(homedir3(), ".local", "share", "mcp-recall", "profiles", "community");
}
function getBundledProfilesDir() {
  if (process.env.RECALL_BUNDLED_PROFILES_PATH) {
    return process.env.RECALL_BUNDLED_PROFILES_PATH;
  }
  const devPath = join4(import.meta.dir, "../../profiles");
  const distPath = join4(import.meta.dir, "../profiles");
  try {
    statSync3(devPath);
    return devPath;
  } catch (e) {
    if (e.code !== "ENOENT")
      throw e;
    return distPath;
  }
}
function loadSpec(filePath) {
  let mtime;
  try {
    mtime = statSync3(filePath).mtimeMs;
  } catch {
    fileCache.delete(filePath);
    return null;
  }
  const cached3 = fileCache.get(filePath);
  if (cached3 && cached3.mtime === mtime)
    return cached3.spec;
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
    log.debug(`profile parse error \xB7 ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
  const spec = validateSpec(parsed, filePath);
  if (!spec)
    return null;
  fileCache.set(filePath, { mtime, spec });
  return spec;
}
function validateSpec(raw, filePath) {
  if (typeof raw !== "object" || raw === null)
    return null;
  const obj = raw;
  const profile = obj["profile"];
  const strategy = obj["strategy"];
  if (!profile || !strategy) {
    log.debug(`profile skip \xB7 missing [profile] or [strategy] \xB7 ${filePath}`);
    return null;
  }
  if (typeof profile["id"] !== "string" || typeof profile["version"] !== "string" || typeof profile["description"] !== "string" || typeof profile["mcp_pattern"] !== "string" && !Array.isArray(profile["mcp_pattern"])) {
    log.debug(`profile skip \xB7 missing required fields \xB7 ${filePath}`);
    return null;
  }
  const type = strategy["type"];
  if (!VALID_TYPES.has(type)) {
    log.debug(`profile skip \xB7 unknown strategy.type "${type}" \xB7 ${filePath}`);
    return null;
  }
  if (type === "json_extract") {
    const fields = strategy["fields"];
    if (!Array.isArray(fields) || fields.length === 0) {
      log.debug(`profile skip \xB7 json_extract missing fields \xB7 ${filePath}`);
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
      log.debug(`profile skip \xB7 ${field} exceeds maximum allowed value of ${ceiling} \xB7 ${filePath}`);
      return null;
    }
  }
  return raw;
}
function scanDir(dir, tier) {
  let entries;
  try {
    entries = readdirSync2(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const entry of entries) {
    const full = join4(dir, entry);
    let stat;
    try {
      stat = statSync3(full);
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
var fileCache, VALID_TYPES;
var init_loader = __esm(() => {
  init_dist();
  init_log();
  fileCache = new Map;
  VALID_TYPES = new Set(["json_extract", "json_truncate", "text_truncate"]);
});

// src/profiles/strategies.ts
function profileText(output) {
  const blocks = asMcpContentBlocks(output);
  if (blocks?.some((b) => b.type === "text"))
    return joinTextBlocks(blocks);
  return extractText(output);
}
function excerpt(raw, maxChars) {
  if (raw.length <= maxChars)
    return raw;
  return `${raw.slice(0, maxChars).trimEnd()}
\u2026`;
}
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
  const raw = profileText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const fallbackChars = strategy.fallback_chars ?? 500;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: excerpt(raw, fallbackChars), originalSize };
  }
  const items = resolveItems(parsed, strategy.items_path ?? []);
  if (!items || items.length === 0) {
    return { summary: excerpt(raw, fallbackChars), originalSize };
  }
  const fields = strategy.fields ?? [];
  const maxItems = strategy.max_items ?? 10;
  const maxCharsPerField = strategy.max_chars_per_field ?? 200;
  const labels = strategy.labels;
  const count = items.length;
  const extracted = items.slice(0, maxItems).map((item) => fields.flatMap((f) => {
    const val = fieldValue(item, f, maxCharsPerField);
    return val ? [`${getLabel(f, labels)}: ${val}`] : [];
  }));
  if (extracted.every((parts) => parts.length === 0)) {
    return { summary: excerpt(raw, fallbackChars), originalSize };
  }
  const lines = extracted.map((parts, i) => `${i + 1}. ${parts.join(" \xB7 ")}`);
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
  const raw = profileText(output);
  const originalSize = Buffer.byteLength(raw, "utf8");
  const fallbackChars = strategy.fallback_chars ?? 500;
  const maxDepth = strategy.max_depth ?? 3;
  const maxArrayItems = strategy.max_array_items ?? 3;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { summary: excerpt(raw, fallbackChars), originalSize };
  }
  const truncated = truncateJson(parsed, 0, maxDepth, maxArrayItems);
  return { summary: JSON.stringify(truncated, null, 2), originalSize };
}
function applyTextTruncate(strategy, _toolName, output) {
  const raw = profileText(output);
  return { summary: excerpt(raw, strategy.max_chars ?? 500), originalSize: Buffer.byteLength(raw, "utf8") };
}
var init_strategies = __esm(() => {
  init_types();
});

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
  log.debug(`profile match \xB7 ${match.spec.profile.id} (${match.tier}) \xB7 ${toolName}`);
  return makeHandler(match);
}
var TIER_ORDER;
var init_profiles = __esm(() => {
  init_loader();
  init_strategies();
  init_log();
  init_loader();
  TIER_ORDER = ["user", "community", "bundled"];
});

// src/handlers/index.ts
function getHandler(toolName, output, input) {
  if (toolName === "Bash") {
    return keepStderrError(getBashHandler(input), output);
  }
  const highPriorityProfile = getProfileHandler(toolName, ["user", "community"]);
  if (highPriorityProfile)
    return highPriorityProfile;
  for (const { match, handler } of HANDLER_REGISTRY) {
    if (match(toolName))
      return handler;
  }
  const bundledProfile = getProfileHandler(toolName, ["bundled"]);
  if (bundledProfile)
    return bundledProfile;
  if (hasNonTextContentBlocks(output)) {
    return contentBlockHandler;
  }
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
var HANDLER_REGISTRY;
var init_handlers = __esm(() => {
  init_playwright();
  init_github();
  init_gitlab();
  init_filesystem();
  init_shell();
  init_bash();
  init_linear();
  init_slack();
  init_tavily();
  init_database();
  init_sentry();
  init_stripe();
  init_csv();
  init_json();
  init_generic();
  init_content_blocks();
  init_types();
  init_profiles();
  init_types();
  init_content_blocks();
  HANDLER_REGISTRY = [
    {
      match: (t) => t.includes("playwright") && t.includes("snapshot"),
      handler: playwrightHandler
    },
    {
      match: (t) => t.startsWith("mcp__github__"),
      handler: githubHandler
    },
    {
      match: (t) => t.startsWith("mcp__gitlab__"),
      handler: gitlabHandler
    },
    {
      match: (t) => t.startsWith("mcp__stripe__"),
      handler: stripeHandler
    },
    {
      match: (t) => t.startsWith("mcp__filesystem__") || t.includes("read_file") || t.includes("get_file"),
      handler: filesystemHandler
    },
    {
      match: (t) => t.includes("bash") || t.includes("shell") || t.includes("terminal") || t.includes("run_command") || t.includes("ssh_exec") || t.includes("exec_command") || t.includes("remote_exec") || t.includes("container_exec"),
      handler: shellHandler
    },
    {
      match: (t) => t.includes("linear"),
      handler: linearHandler
    },
    {
      match: (t) => t.includes("slack"),
      handler: slackHandler
    },
    {
      match: (t) => t.includes("tavily"),
      handler: tavilyHandler
    },
    {
      match: (t) => t.includes("postgres") || t.includes("mysql") || t.includes("sqlite") || t.includes("database"),
      handler: databaseHandler
    },
    {
      match: (t) => t.includes("sentry"),
      handler: sentryHandler
    },
    {
      match: (t) => t.includes("csv"),
      handler: csvHandler
    }
  ];
});

// package.json
var require_package = __commonJS((exports, module) => {
  module.exports = {
    name: "mcp-recall",
    version: "1.18.1",
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
    keywords: [
      "mcp",
      "claude",
      "claude-code",
      "context",
      "compression",
      "memory",
      "sqlite",
      "plugin"
    ],
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
      bench: "bun run scripts/benchmark.ts",
      "build:binary": "bun run scripts/build-binary.ts",
      "sandbox:binary": "bash scripts/sandbox-binary.sh",
      measure: "bun run scripts/measure-store.ts",
      fidelity: "bun run scripts/fidelity.ts",
      quality: "bun run scripts/quality.ts",
      build: "bun build src/server.ts --target bun --outfile plugins/mcp-recall/dist/server.js && bun build src/cli.ts --target bun --outfile plugins/mcp-recall/dist/cli.js && cp hooks/hooks.json plugins/mcp-recall/hooks/hooks.json && rm -rf plugins/mcp-recall/profiles && cp -r profiles plugins/mcp-recall/profiles",
      prepare: "git config core.hooksPath .githooks"
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.30.0",
      "smol-toml": "^1.8.0",
      zod: "^4.6.7"
    },
    devDependencies: {
      "@types/bun": "^1.4.2",
      typescript: "^5.7.0"
    }
  };
});

// src/learn/retrain.ts
import { readFileSync as readFileSync4, writeFileSync } from "fs";
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
function bumpPatch(version2) {
  const parts = version2.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN))
    return version2;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}
function applyRetrainToToml(tomlContent, newFields, date2) {
  let result = tomlContent;
  const firstContentIdx = result.search(/^[^\s#]/m);
  const retrainLine = `# Retrained: ${date2}
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
function applyResult(result, date2) {
  if (result.newFields.length === 0)
    return;
  let toml;
  try {
    toml = readFileSync4(result.profileFilePath, "utf8");
  } catch (e) {
    console.log(`  \u2717 Could not read ${result.profileFilePath}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const oldVersion = toml.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "?";
  const updated = applyRetrainToToml(toml, result.newFields, date2);
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
  const date2 = new Date().toISOString().slice(0, 10);
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
      applyResult(result, date2);
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
var MIN_SAMPLES = 3, MAX_SAMPLES = 5, DEFAULT_DEPTH = 3, MIN_FIELD_PCT = 0.5, ALL_TIERS;
var init_retrain = __esm(() => {
  init_db();
  init_project_key();
  init_loader();
  init_profiles();
  ALL_TIERS = ["user", "community", "bundled"];
});

// src/profiles/shared.ts
import { readFileSync as readFileSync5, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync3, unlinkSync } from "fs";
import { join as join5 } from "path";
import { homedir as homedir4, tmpdir } from "os";
import { createHash as createHash4 } from "crypto";
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
  return process.env.RECALL_COMMUNITY_PROFILES_PATH ?? join5(homedir4(), ".local", "share", "mcp-recall", "profiles", "community");
}
function userDir() {
  return process.env.RECALL_USER_PROFILES_PATH ?? join5(homedir4(), ".config", "mcp-recall", "profiles");
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
  const actual = createHash4("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(`Profile ${id}: hash mismatch (expected ${expected.slice(0, 8)}\u2026, got ${actual.slice(0, 8)}\u2026)`);
  }
}
function reportUnavailable(mode, reason) {
  if (mode === "error") {
    throw new ManifestVerificationError(`[recall] manifest signature cannot be verified: ${reason}. ` + `verify_signature = "error" requires verification to succeed \u2014 ` + `install or upgrade gh, or pass --skip-verify to proceed without it.`);
  }
  process.stderr.write(`[recall] manifest signature verification skipped: ${reason}
`);
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
    reportUnavailable(mode, "gh CLI not found in PATH");
    return;
  }
  const result = Bun.spawnSync([
    "gh",
    "attestation",
    "verify",
    manifestPath,
    "--repo",
    COMMUNITY_REPO,
    "--cert-identity",
    SIGNER_IDENTITY
  ], { stderr: "pipe", stdout: "ignore" });
  if (result.exitCode !== 0) {
    const errText = result.stderr ? new TextDecoder().decode(result.stderr).trim() : "";
    if (UNSUPPORTED_FLAG_RE.test(errText)) {
      reportUnavailable(mode, "this gh CLI does not support the flags we verify with (upgrade gh)");
      return;
    }
    const msg = `[recall] manifest signature verification failed${errText ? `: ${errText}` : ""}
`;
    if (mode === "error") {
      throw new ManifestVerificationError(msg.trim());
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
    const tmpPath = join5(tmpdir(), `mcp-recall-manifest-${process.pid}.json`);
    try {
      writeFileSync2(tmpPath, text, "utf8");
      const config2 = loadConfig();
      verifyManifest(tmpPath, config2.profiles.verify_signature);
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
  const dir = join5(communityDir(), profileId);
  mkdirSync2(dir, { recursive: true });
  const filePath = join5(dir, "default.toml");
  writeFileSync2(filePath, content);
  return filePath;
}
function installedCommunityMap() {
  const map = new Map;
  let entries;
  try {
    entries = readdirSync3(communityDir());
  } catch {
    return map;
  }
  for (const entry of entries) {
    const toml = join5(communityDir(), entry, "default.toml");
    try {
      const p = parse(readFileSync5(toml, "utf8"));
      const version2 = p["profile"]["version"];
      map.set(entry, version2 ?? "0.0.0");
    } catch {}
  }
  return map;
}
async function promptNumber(msg, min, max) {
  for (let attempt = 0;attempt < 3; attempt++) {
    process.stdout.write(msg);
    const line = await new Promise((resolve3) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (d) => resolve3(String(d).trim()));
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
var MANIFEST_URL = "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/manifest.json", PROFILE_BASE_URL = "https://raw.githubusercontent.com/sakebomb/mcp-recall-profiles/main/", COMMUNITY_REPO = "sakebomb/mcp-recall-profiles", SIGNER_WORKFLOW_PATH = ".github/workflows/manifest.yml", SIGNER_REF = "refs/heads/main", SIGNER_IDENTITY, SAFE_ID_RE, SAFE_FILE_RE, ManifestVerificationError, UNSUPPORTED_FLAG_RE;
var init_shared = __esm(() => {
  init_dist();
  init_config();
  SIGNER_IDENTITY = `https://github.com/${COMMUNITY_REPO}/${SIGNER_WORKFLOW_PATH}@${SIGNER_REF}`;
  SAFE_ID_RE = /^[a-z0-9_-]+$/;
  SAFE_FILE_RE = /^profiles\/[a-z0-9_-]+\/[a-z0-9_.-]+\.toml$/;
  ManifestVerificationError = class ManifestVerificationError extends Error {
    constructor(message) {
      super(message);
      this.name = "ManifestVerificationError";
    }
  };
  UNSUPPORTED_FLAG_RE = /unknown (flag|command|shorthand flag)/i;
});

// src/profiles/cmd-local.ts
import { readFileSync as readFileSync6, readdirSync as readdirSync4, rmSync as rmSync2 } from "fs";
import { join as join6 } from "path";
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
  rmSync2(join6(communityDir(), id), { recursive: true });
  clearProfileCache();
  console.log(`\u2713 Removed ${id}`);
}
function cmdFeed(args) {
  const profilePath = args[0];
  if (!profilePath) {
    const dir = userDir();
    const files = [];
    try {
      for (const entry of readdirSync4(dir)) {
        if (entry.endsWith(".toml"))
          files.push(join6(dir, entry));
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
    content = readFileSync6(profilePath, "utf8");
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
  const meta2 = parsed["profile"];
  if (!meta2?.["id"] || !meta2?.["version"] || !meta2?.["mcp_pattern"]) {
    console.error("Profile missing required fields (id, version, mcp_pattern).");
    process.exit(1);
  }
  const id = meta2["id"];
  const patterns = Array.isArray(meta2["mcp_pattern"]) ? meta2["mcp_pattern"].join(", ") : meta2["mcp_pattern"];
  console.log(`
Profile: ${id} (v${meta2["version"]})`);
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
var init_cmd_local = __esm(() => {
  init_dist();
  init_loader();
  init_shared();
});

// src/profiles/cmd-catalog.ts
import { readFileSync as readFileSync7 } from "fs";
import { join as join7 } from "path";
import { homedir as homedir5 } from "os";
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
    const raw = JSON.parse(readFileSync7(join7(homedir5(), ".claude.json"), "utf8"));
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
  } catch (err) {
    if (err instanceof ManifestVerificationError)
      throw err;
    console.log("(offline \u2014 showing local data only)");
  }
  if (!local && !manifestEntry) {
    console.error(`Profile "${nameOrId}" not found (not installed and not in community catalog).`);
    process.exit(1);
  }
  const id = local?.spec.profile.id ?? manifestEntry.id;
  const shortName = local ? getShortName(local.spec) : manifestShortName(manifestEntry);
  const version2 = local?.spec.profile.version ?? manifestEntry.version;
  const description = sanitize(local?.spec.profile.description ?? manifestEntry.description ?? "\u2014");
  const author = sanitize(String(local?.spec.profile.author ?? manifestEntry?.author ?? "\u2014"));
  const mcpUrl = sanitize(String(local?.spec.profile.mcp_url ?? manifestEntry?.mcp_url ?? "\u2014"));
  const patterns = local?.patterns ?? (Array.isArray(manifestEntry.mcp_pattern) ? manifestEntry.mcp_pattern : [manifestEntry.mcp_pattern]);
  const tier = local ? local.tier : "community (not installed)";
  console.log(`
${shortName} (${id} v${version2})`);
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
var init_cmd_catalog = __esm(() => {
  init_loader();
  init_shared();
});

// src/profiles/cmd-test.ts
import { readFileSync as readFileSync8 } from "fs";
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
      content = readFileSync8(inputFile, "utf8");
    } catch {
      console.error(`Cannot read: ${inputFile}`);
      process.exit(1);
    }
    contentSource = inputFile;
  }
  const config2 = loadConfig();
  if (isDenied(toolName, config2)) {
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
var init_cmd_test = __esm(() => {
  init_loader();
  init_profiles();
  init_handlers();
  init_db();
  init_project_key();
  init_denylist();
  init_config();
});

// src/profiles/commands.ts
var exports_commands = {};
__export(exports_commands, {
  verifyManifest: () => verifyManifest,
  testProfile: () => testProfile,
  patternsOverlap: () => patternsOverlap,
  handleProfilesCommand: () => handleProfilesCommand,
  cmdSeed: () => cmdSeed,
  cmdRemove: () => cmdRemove,
  cmdList: () => cmdList,
  cmdInstall: () => cmdInstall,
  cmdInfo: () => cmdInfo,
  cmdAvailable: () => cmdAvailable
});
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
var init_commands = __esm(() => {
  init_retrain();
  init_cmd_local();
  init_cmd_catalog();
  init_cmd_test();
  init_cmd_local();
  init_cmd_catalog();
  init_cmd_test();
  init_shared();
});

// src/learn/client.ts
class LineReader {
  buf = "";
  reader;
  dec = new TextDecoder;
  constructor(stream) {
    this.reader = stream.getReader();
  }
  async readLine(timeoutMs) {
    const timer = new Promise((resolve3) => setTimeout(() => resolve3(null), timeoutMs));
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
        protocolVersion: "2025-03-26",
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

// src/learn/http-client.ts
async function* parseSseStream(body, signal) {
  const reader = body.getReader();
  const dec = new TextDecoder;
  let buf = "";
  try {
    while (!signal.aborted) {
      let done, value;
      try {
        ({ done, value } = await reader.read());
      } catch {
        break;
      }
      if (done)
        break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split(`

`);
      buf = blocks.pop() ?? "";
      for (const block of blocks) {
        if (!block.trim())
          continue;
        let eventType;
        const dataLines = [];
        for (const line of block.split(`
`)) {
          if (line.startsWith("event: "))
            eventType = line.slice(7).trim();
          else if (line.startsWith("data: "))
            dataLines.push(line.slice(6));
          else if (line === "data")
            dataLines.push("");
        }
        if (dataLines.length > 0) {
          yield { event: eventType, data: dataLines.join(`
`) };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
async function awaitSseResult(stream, id) {
  for await (const { data } of stream) {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      continue;
    }
    if (msg.id !== id)
      continue;
    if (msg.error)
      throw new McpProtocolError(`MCP error: ${msg.error.message}`);
    return msg.result;
  }
  throw new Error("SSE stream ended without a matching response");
}
async function streamableRpc(url, body, signal) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    },
    body: JSON.stringify(body),
    signal
  });
  if (!resp.ok)
    throw new Error(`HTTP ${resp.status}`);
  if (body.id === undefined)
    return;
  const ct = resp.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const msg = await resp.json();
    if (msg.error)
      throw new McpProtocolError(`MCP error: ${msg.error.message}`);
    return msg.result;
  }
  if (ct.includes("text/event-stream")) {
    const stream = parseSseStream(resp.body, signal);
    return awaitSseResult(stream, body.id);
  }
  throw new Error(`Unexpected Content-Type: ${ct}`);
}
async function tryStreamableHttp(url, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  await streamableRpc(url, { jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS }, signal);
  await streamableRpc(url, { jsonrpc: "2.0", method: "notifications/initialized" }, signal);
  const result = await streamableRpc(url, { jsonrpc: "2.0", id: 2, method: "tools/list" }, signal);
  return result?.tools ?? [];
}
async function tryLegacySse(url, timeoutMs) {
  const abort = new AbortController;
  const timer = setTimeout(() => abort.abort(new Error("timeout")), timeoutMs);
  try {
    const sseResp = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: abort.signal
    });
    if (!sseResp.ok)
      throw new Error(`HTTP ${sseResp.status}`);
    const ct = sseResp.headers.get("content-type") ?? "";
    if (!ct.includes("text/event-stream")) {
      throw new Error(`Expected SSE stream, got Content-Type: ${ct}`);
    }
    const pending = new Map;
    let postUrl = null;
    const postUrlResolve = Promise.withResolvers();
    const sseStream = parseSseStream(sseResp.body, abort.signal);
    const readerDone = (async () => {
      try {
        for await (const { event, data } of sseStream) {
          if (event === "endpoint") {
            const resolved = new URL(data.trim(), url).href;
            assertHttpScheme(resolved, "endpoint URL from SSE event");
            postUrlResolve.resolve(resolved);
            postUrl = resolved;
            continue;
          }
          let msg;
          try {
            msg = JSON.parse(data);
          } catch {
            continue;
          }
          if (msg.id === undefined)
            continue;
          const p = pending.get(msg.id);
          if (!p)
            continue;
          pending.delete(msg.id);
          if (msg.error)
            p.reject(new McpProtocolError(`MCP error: ${msg.error.message}`));
          else
            p.resolve(msg.result);
        }
        postUrlResolve.reject(new Error("SSE stream closed before endpoint event received"));
        for (const { reject } of pending.values()) {
          reject(new Error("SSE stream closed before response received"));
        }
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        postUrlResolve.reject(err);
        for (const { reject } of pending.values())
          reject(err);
      }
    })();
    postUrl = await postUrlResolve.promise;
    const post = (body) => {
      const req = fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal
      });
      if (body.id === undefined)
        return req.then(() => {
          return;
        });
      return new Promise((resolve3, reject) => {
        pending.set(body.id, { resolve: resolve3, reject });
        req.catch(reject);
      });
    };
    await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT_PARAMS });
    await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    const result = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    abort.abort();
    await readerDone.catch(() => {});
    return result?.tools ?? [];
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}
function assertHttpScheme(rawUrl, label) {
  const { protocol } = new URL(rawUrl);
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`${label} has unsupported URL scheme: ${protocol}`);
  }
}
async function listMcpToolsHttp(url, timeoutMs = 1e4) {
  assertHttpScheme(url, "MCP server URL");
  let streamableError = null;
  try {
    const tools = await tryStreamableHttp(url, timeoutMs);
    return { tools, transport: "streamable-http" };
  } catch (e) {
    if (e instanceof McpProtocolError)
      throw e;
    streamableError = e instanceof Error ? e.message : String(e);
  }
  try {
    const tools = await tryLegacySse(url, timeoutMs);
    return { tools, transport: "legacy-sse", streamableError: streamableError ?? undefined };
  } catch (e) {
    const sseError = e instanceof Error ? e.message : String(e);
    throw new Error(`streamable HTTP: ${streamableError}; legacy SSE: ${sseError}`);
  }
}
var McpProtocolError, INIT_PARAMS;
var init_http_client = __esm(() => {
  McpProtocolError = class McpProtocolError extends Error {
    constructor(msg) {
      super(msg);
      this.name = "McpProtocolError";
    }
  };
  INIT_PARAMS = {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "mcp-recall-learn", version: "1.0.0" }
  };
});

// src/learn/generate.ts
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
var LIST_VERBS, SINGLE_VERBS, WRITE_VERBS, COMMON_FIELDS;
var init_generate = __esm(() => {
  LIST_VERBS = /^(list|search|find|query|get_all|fetch_all)/i;
  SINGLE_VERBS = /^(get|fetch|read|describe|show|retrieve)/i;
  WRITE_VERBS = /^(create|update|delete|remove|set|add|post|put|patch)/i;
  COMMON_FIELDS = ["id", "title", "name", "status", "description"];
});

// src/learn/index.ts
var exports_learn = {};
__export(exports_learn, {
  handleLearnCommand: () => handleLearnCommand
});
import { readFileSync as readFileSync9, writeFileSync as writeFileSync3, mkdirSync as mkdirSync3 } from "fs";
import { join as join8 } from "path";
import { homedir as homedir6 } from "os";
function userProfilesDir() {
  return process.env.RECALL_USER_PROFILES_PATH ?? join8(homedir6(), ".config", "mcp-recall", "profiles");
}
function readClaudeJson() {
  const path = join8(homedir6(), ".claude.json");
  const raw = JSON.parse(readFileSync9(path, "utf8"));
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
    if (!cfg.command && !cfg.url) {
      console.log(`  ${key}: skipped (no command or url in config)`);
      return false;
    }
    return true;
  });
  if (candidates.length === 0) {
    console.log("No MCP servers found to learn from.");
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
      if (cfg.url) {
        const result = await listMcpToolsHttp(cfg.url, 1e4);
        tools = result.tools;
        if (result.streamableError) {
          process.stdout.write(`
    streamable HTTP failed (${result.streamableError}), used legacy SSE \u2014 `);
        }
        console.log(`${tools.length} tool(s) found (${result.transport})`);
      } else {
        tools = await listMcpTools(cfg.command, cfg.args ?? [], cfg.env ?? {}, 1e4);
        console.log(`${tools.length} tool(s) found`);
      }
    } catch (e) {
      console.log(`failed \u2014 ${e instanceof Error ? e.message : String(e)}`);
      skipped++;
      continue;
    }
    const toml = generateProfile(key, tools);
    if (dryRun) {
      console.log(`
\u2500\u2500\u2500 ${key} \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
      console.log(toml);
      continue;
    }
    const profileDir = join8(outputDir, `mcp__${key.replace(/-/g, "_")}`);
    mkdirSync3(profileDir, { recursive: true });
    const filePath = join8(profileDir, "default.toml");
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
var init_learn = __esm(() => {
  init_http_client();
  init_generate();
  init_loader();
});

// src/import/index.ts
var exports_import = {};
__export(exports_import, {
  validateExport: () => validateExport,
  handleImportCommand: () => handleImportCommand,
  MAX_REPORTED_ISSUES: () => MAX_REPORTED_ISSUES
});
import { readFileSync as readFileSync10, statSync as statSync5, existsSync as existsSync2 } from "fs";
import { resolve as resolve3 } from "path";
import { Database as Database3 } from "bun:sqlite";
function validateExport(parsed) {
  if (!Array.isArray(parsed)) {
    return { success: false, issues: [formatIssue([], "expected an array of exported rows")] };
  }
  const items = [];
  const issues = [];
  for (let i = 0;i < parsed.length; i++) {
    const row = StoredOutputSchema.safeParse(parsed[i]);
    if (row.success) {
      items.push(row.data);
      continue;
    }
    for (const issue2 of row.error.issues) {
      issues.push(formatIssue([i, ...issue2.path], issue2.message));
      if (issues.length === MAX_REPORTED_ISSUES)
        return { success: false, issues };
    }
  }
  return issues.length > 0 ? { success: false, issues } : { success: true, items };
}
function partitionSecrets(items) {
  const clean = [];
  const patterns = new Set;
  let withheld = 0;
  for (const item of items) {
    const found = findSecrets(`${item.summary}
${item.full_content}`);
    if (found.length > 0) {
      withheld++;
      for (const name of found)
        patterns.add(name);
      continue;
    }
    clean.push(item);
  }
  return { clean, withheld, patterns: [...patterns].sort() };
}
function dryRunCount(dbPath, items, overwrite) {
  if (dbPath === ":memory:" || !existsSync2(dbPath)) {
    return { imported: items.length, skipped: 0, overwritten: 0 };
  }
  let db = null;
  try {
    db = new Database3(dbPath, { readonly: true });
    const hasTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stored_outputs' LIMIT 1`).get();
    if (!hasTable)
      return { imported: items.length, skipped: 0, overwritten: 0 };
    const result = { imported: 0, skipped: 0, overwritten: 0 };
    const check = db.prepare(`SELECT id FROM stored_outputs WHERE id = ? LIMIT 1`);
    for (const item of items) {
      const existing = check.get(item.id);
      if (existing) {
        if (overwrite)
          result.overwritten++;
        else
          result.skipped++;
      } else {
        result.imported++;
      }
    }
    return result;
  } catch {
    return { imported: items.length, skipped: 0, overwritten: 0 };
  } finally {
    db?.close();
  }
}
function importItems(dbPath, items, opts) {
  const db = getDb(dbPath);
  const result = { imported: 0, skipped: 0, overwritten: 0 };
  const chunkStmt = db.prepare(`INSERT INTO content_chunks (output_id, chunk_index, content) VALUES (?, ?, ?)`);
  const insertItem = db.transaction((item) => {
    const projectKey = opts.projectKey;
    const existing = db.prepare(`SELECT id FROM stored_outputs WHERE id = ? LIMIT 1`).get(item.id);
    if (existing) {
      if (!opts.overwrite)
        return "skipped";
      db.prepare(`DELETE FROM stored_outputs WHERE id = ?`).run(item.id);
    }
    db.prepare(`
      INSERT INTO stored_outputs
        (id, project_key, session_id, tool_name, summary, full_content,
         original_size, summary_size, created_at, pinned, access_count,
         last_accessed, input_hash, full_retained, command_fp, delivered_size, handler)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(item.id, projectKey, item.session_id, item.tool_name, item.summary, item.full_retained ? item.full_content : "", item.original_size, item.summary_size, item.created_at, item.pinned, item.access_count, item.last_accessed, item.input_hash, item.full_retained, item.command_fp, item.delivered_size, item.handler);
    if (item.full_retained) {
      const chunks = chunkText(item.full_content);
      for (let i = 0;i < chunks.length; i++) {
        chunkStmt.run(item.id, i, chunks[i]);
      }
    }
    return existing ? "overwritten" : "imported";
  });
  for (const item of items) {
    const action = insertItem(item);
    result[action]++;
  }
  return result;
}
async function handleImportCommand(args) {
  const overwrite = args.includes("--overwrite");
  const dryRun = args.includes("--dry-run");
  if (args.includes("--keep-project-key")) {
    console.error(`The --keep-project-key flag was removed (#226): it wrote rows into the current
` + `project's database while stamping them with the dump's original key, leaving them
` + `unreachable by search/list_stored/forget and invisible to the size cap.
` + "Run `mcp-recall import <file>` without it \u2014 items land in the current project and\n" + `behave normally. To recover rows already stranded by the old flag, see
` + '"Recovering rows stranded by --keep-project-key" in docs/troubleshooting.md.');
    process.exit(1);
  }
  const rawPath = args.find((a) => !a.startsWith("--"));
  const filePath = rawPath ? resolve3(rawPath) : null;
  let raw;
  if (filePath) {
    try {
      const size2 = statSync5(filePath).size;
      if (size2 > LARGE_FILE_BYTES) {
        console.error(`Warning: file is ${Math.round(size2 / 1024 / 1024)} MB \u2014 this may take a while.`);
      }
      raw = readFileSync10(filePath, "utf8");
    } catch {
      console.error(`Cannot read file: ${filePath}`);
      process.exit(1);
    }
  } else {
    try {
      raw = readFileSync10("/dev/stdin", "utf8");
    } catch {
      console.error("No file specified and stdin is not readable.");
      console.error("Usage: mcp-recall import <file.json> [--overwrite] [--dry-run]");
      process.exit(1);
    }
  }
  if (raw.trimStart().startsWith(EMPTY_EXPORT_SENTINEL)) {
    console.log("Nothing to import (empty export).");
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("Invalid JSON input.");
    process.exit(1);
  }
  const validation = validateExport(parsed);
  if (!validation.success) {
    console.error("Input does not look like a recall__export dump:");
    for (const issue2 of validation.issues) {
      console.error(`  ${issue2}`);
    }
    process.exit(1);
  }
  const items = validation.items;
  if (items.length === 0) {
    console.log("Nothing to import (empty export).");
    return;
  }
  const projectKey = getProjectKey(process.cwd());
  const dbPath = defaultDbPath(projectKey);
  const { clean, withheld, patterns } = partitionSecrets(items);
  console.log(`
Importing ${clean.length} item(s) into ${dbPath}`);
  if (dryRun)
    console.log(`(dry run \u2014 nothing will be written)
`);
  if (withheld > 0) {
    console.error(`${dryRun ? "Would withhold" : "Withheld"} ${withheld} row(s) containing secrets ` + `(${patterns.join(", ")}). ${dryRun ? "They would not be imported." : "They were NOT imported."}`);
  }
  const result = dryRun ? dryRunCount(dbPath, clean, overwrite) : importItems(dbPath, clean, { overwrite, projectKey });
  const parts = [];
  if (result.imported > 0)
    parts.push(`${result.imported} imported`);
  if (result.overwritten > 0)
    parts.push(`${result.overwritten} overwritten`);
  if (result.skipped > 0)
    parts.push(`${result.skipped} skipped (already exist \u2014 use --overwrite to replace)`);
  console.log(parts.length > 0 ? parts.join(", ") + "." : "Nothing imported.");
  if (!dryRun && result.imported + result.overwritten > 0) {
    console.log(`
Next steps:`);
    console.log("  recall__search <query>   \u2014 verify content is searchable");
    console.log("  recall__list_stored      \u2014 browse imported items");
  }
}
var LARGE_FILE_BYTES, EMPTY_EXPORT_SENTINEL = "[recall: no items to export]", StoredOutputSchema, MAX_REPORTED_ISSUES = 5, formatIssue = (path, message) => `[${path.map(String).join(".")}] ${message}`;
var init_import = __esm(() => {
  init_zod();
  init_schema();
  init_project_key();
  init_secrets();
  LARGE_FILE_BYTES = 50 * 1024 * 1024;
  StoredOutputSchema = object({
    id: string2().min(1),
    project_key: string2().min(1),
    session_id: string2().min(1),
    tool_name: string2().min(1),
    summary: string2(),
    full_content: string2(),
    original_size: number2().int().nonnegative(),
    summary_size: number2().int().nonnegative(),
    created_at: number2().int().positive(),
    pinned: number2().int().min(0).max(1),
    access_count: number2().int().nonnegative(),
    last_accessed: number2().int().nullable(),
    input_hash: string2().nullable(),
    full_retained: number2().int().min(0).max(1).optional().default(1),
    command_fp: string2().nullable().optional().default(null),
    delivered_size: number2().int().nonnegative().nullable().optional().default(null),
    handler: string2().nullable().optional().default(null)
  });
});

// src/install/index.ts
var exports_install = {};
__export(exports_install, {
  writeJsonFile: () => writeJsonFile,
  upsertHook: () => upsertHook,
  uninstallCommand: () => uninstallCommand,
  statusCommand: () => statusCommand,
  shellWords: () => shellWords,
  shellWord: () => shellWord,
  removeOurHooks: () => removeOurHooks,
  removeClaudeMd: () => removeClaudeMd,
  registeredFiles: () => registeredFiles,
  recallHooks: () => recallHooks,
  readJsonFile: () => readJsonFile,
  makeSessionStartEntry: () => makeSessionStartEntry,
  makePostToolUseEntry: () => makePostToolUseEntry,
  isStandaloneBinary: () => isStandaloneBinary,
  isOurSessionStartHook: () => isOurSessionStartHook,
  isOurPostToolUseHook: () => isOurPostToolUseHook,
  isClaudeMdInjected: () => isClaudeMdInjected,
  installCommand: () => installCommand,
  injectClaudeMd: () => injectClaudeMd,
  detectLaunch: () => detectLaunch,
  defaultSettingsPath: () => defaultSettingsPath,
  defaultClaudeMdPath: () => defaultClaudeMdPath,
  defaultClaudeJsonPath: () => defaultClaudeJsonPath,
  SESSION_START_MARKER: () => SESSION_START_MARKER,
  POST_TOOL_USE_MATCHER: () => POST_TOOL_USE_MATCHER,
  POST_TOOL_USE_MARKER: () => POST_TOOL_USE_MARKER,
  CLAUDE_MD_SNIPPET: () => CLAUDE_MD_SNIPPET,
  CLAUDE_MD_MARKER_START: () => CLAUDE_MD_MARKER_START,
  CLAUDE_MD_MARKER_END: () => CLAUDE_MD_MARKER_END,
  CLAUDE_MD_BLOCK: () => CLAUDE_MD_BLOCK
});
import { existsSync as existsSync3 } from "fs";
import { mkdir, rename, readFile, realpath, readlink, stat, chmod, rm, writeFile } from "fs/promises";
import path from "path";
import os from "os";
function isEnoent(e) {
  return typeof e === "object" && e !== null && e.code === "ENOENT";
}
function defaultClaudeJsonPath() {
  return path.join(os.homedir(), ".claude.json");
}
function defaultSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}
function defaultClaudeMdPath() {
  return path.join(os.homedir(), ".claude", "CLAUDE.md");
}
function isStandaloneBinary(modulePath = import.meta.path) {
  const flag = Bun.isStandaloneExecutable;
  if (typeof flag === "boolean")
    return flag;
  return /^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(modulePath);
}
function shellWord(p) {
  return /[^\w@%+=:,./-]/.test(p) ? `'${p.replace(/'/g, `'\\''`)}'` : p;
}
function shellWords(cmd) {
  const words = [];
  let i = 0;
  while (i < cmd.length) {
    while (cmd[i] === " ")
      i++;
    if (i >= cmd.length)
      break;
    let word = "";
    while (i < cmd.length && cmd[i] !== " ") {
      if (cmd[i] === "'") {
        const end = cmd.indexOf("'", i + 1);
        if (end === -1)
          return words;
        word += cmd.slice(i + 1, end);
        i = end + 1;
      } else if (cmd[i] === "\\") {
        word += cmd[i + 1] ?? "";
        i += 2;
      } else {
        word += cmd[i++];
      }
    }
    words.push(word);
  }
  return words;
}
function detectLaunch(standalone = isStandaloneBinary()) {
  if (standalone) {
    const bin = process.execPath;
    return {
      cli: shellWord(bin),
      server: { type: "stdio", command: bin, args: ["serve"] },
      artifacts: [{ label: "binary", path: bin }]
    };
  }
  const isBuilt = import.meta.path.endsWith(".js");
  const distDir = isBuilt ? import.meta.dir : path.resolve(import.meta.dir, "../../plugins/mcp-recall/dist");
  const serverJs = path.join(distDir, "server.js");
  const cliJs = path.join(distDir, "cli.js");
  return {
    cli: `bun ${shellWord(cliJs)}`,
    server: { type: "stdio", command: "bun", args: [serverJs] },
    artifacts: [{ label: "dist/server.js", path: serverJs }, { label: "dist/cli.js", path: cliJs }]
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
  await writeTextFile(filePath, JSON.stringify(data, null, 2) + `
`);
}
async function writeTarget(filePath) {
  try {
    return await realpath(filePath);
  } catch (e) {
    if (!isEnoent(e))
      throw e;
  }
  let target = filePath;
  for (let hop = 0;hop < MAX_LINK_HOPS; hop++) {
    try {
      target = path.resolve(path.dirname(target), await readlink(target));
    } catch {
      return target;
    }
  }
  return target;
}
async function writeTextFile(filePath, content) {
  const target = await writeTarget(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  const mode = await stat(target).then((s) => s.mode & 4095, () => {
    return;
  });
  const tmp = target + ".tmp";
  await rm(tmp, { force: true });
  await writeFile(tmp, content, mode === undefined ? undefined : { mode });
  if (mode !== undefined)
    await chmod(tmp, mode);
  await rename(tmp, target);
}
function isClaudeMdInjected(content) {
  return content.includes(CLAUDE_MD_MARKER_START);
}
async function injectClaudeMd(filePath, dryRun = false) {
  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (e) {
    if (!isEnoent(e))
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
    if (isEnoent(e))
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
function makeSessionStartEntry(cli) {
  return {
    hooks: [{ type: "command", command: `${cli} session-start`, timeout: 10 }]
  };
}
function makePostToolUseEntry(cli) {
  return {
    matcher: POST_TOOL_USE_MATCHER,
    hooks: [{ type: "command", command: `${cli} post-tool-use`, timeout: 10 }]
  };
}
function recallHooks(clis = []) {
  const recogniser = (marker, matcher) => {
    const hook = (h) => {
      const cmd = h?.["command"];
      if (typeof cmd !== "string")
        return false;
      return cmd.includes("recall") && cmd.includes(marker) || clis.some((cli) => cmd === `${cli} ${marker}`);
    };
    const entry = (e) => {
      if (!e || typeof e !== "object")
        return false;
      const { matcher: m, hooks } = e;
      return (matcher === undefined || m === matcher) && Array.isArray(hooks) && hooks.some(hook);
    };
    return { entry, hook };
  };
  return {
    SessionStart: recogniser(SESSION_START_MARKER),
    PostToolUse: recogniser(POST_TOOL_USE_MARKER, POST_TOOL_USE_MATCHER)
  };
}
function knownClis(launch, server) {
  const command = server?.["command"];
  return typeof command === "string" && !isBunProgram(command) ? [launch.cli, shellWord(command)] : [launch.cli];
}
function isOurSessionStartHook(entry) {
  return recallHooks().SessionStart.entry(entry);
}
function isOurPostToolUseHook(entry) {
  return recallHooks().PostToolUse.entry(entry);
}
function removeOurHooks(entries, ours) {
  let removed = 0;
  const kept = entries.flatMap((e) => {
    if (!ours.entry(e))
      return [e];
    const entry = e;
    const hooks = entry.hooks.filter((h) => !ours.hook(h));
    removed += entry.hooks.length - hooks.length;
    return hooks.length > 0 ? [{ ...entry, hooks }] : [];
  });
  return { entries: kept, removed };
}
function upsertHook(entries, ours, fresh) {
  const idx = entries.findIndex(ours.entry);
  if (idx === -1)
    return { entries: [...entries, fresh], result: "added" };
  const dupes = removeOurHooks(entries.slice(idx + 1), ours);
  const entry = entries[idx];
  const first = entry.hooks.findIndex(ours.hook);
  const command = fresh.hooks[0].command;
  const hooks = entry.hooks.flatMap((h, i) => {
    if (i === first)
      return [{ ...h, command }];
    return ours.hook(h) ? [] : [h];
  });
  const changed = dupes.removed > 0 || hooks.length !== entry.hooks.length || entry.hooks[first].command !== command;
  if (!changed)
    return { entries, result: "present" };
  return { entries: [...entries.slice(0, idx), { ...entry, hooks }, ...dupes.entries], result: "updated" };
}
async function installCommand(opts = {}) {
  const {
    dryRun = false,
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath = defaultSettingsPath(),
    claudeMdPath = defaultClaudeMdPath(),
    launch = detectLaunch()
  } = opts;
  const missing = launch.artifacts.find((a) => !existsSync3(a.path));
  if (missing) {
    console.error(`${RED}\u2717 Build artifacts not found.${RESET}`);
    console.error(`  Expected: ${DIM}${missing.path}${RESET}`);
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
  const newServer = launch.server;
  const existing = mcpServers["recall"];
  const sameServer = runsServer(existing, newServer);
  if (!existing) {
    if (!dryRun) {
      claudeJson["mcpServers"] = { ...mcpServers, recall: newServer };
      await writeJsonFile(claudeJsonPath, claudeJson);
    }
    console.log(`${GREEN}\u2713${RESET} MCP server registered     ${DIM}(${claudeJsonPath})${RESET}`);
    anyChange = true;
  } else if (!sameServer) {
    if (!dryRun) {
      claudeJson["mcpServers"] = { ...mcpServers, recall: { ...existing, ...newServer } };
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
  const ours = recallHooks(knownClis(launch, existing));
  const ss = upsertHook(hooks["SessionStart"] ?? [], ours.SessionStart, makeSessionStartEntry(launch.cli));
  hooks["SessionStart"] = ss.entries;
  if (ss.result === "added") {
    console.log(`${GREEN}\u2713${RESET} SessionStart hook added    ${DIM}(${settingsPath})${RESET}`);
  } else if (ss.result === "updated") {
    console.log(`${YELLOW}\u21BA${RESET} SessionStart hook updated   ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}\u2139 SessionStart hook already registered${RESET}`);
  }
  const ptu = upsertHook(hooks["PostToolUse"] ?? [], ours.PostToolUse, makePostToolUseEntry(launch.cli));
  hooks["PostToolUse"] = ptu.entries;
  if (ptu.result === "added") {
    console.log(`${GREEN}\u2713${RESET} PostToolUse hook added     ${DIM}(${settingsPath})${RESET}`);
  } else if (ptu.result === "updated") {
    console.log(`${YELLOW}\u21BA${RESET} PostToolUse hook updated    ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}\u2139 PostToolUse hook already registered${RESET}`);
  }
  if (ss.result !== "present" || ptu.result !== "present") {
    settingsChanged = true;
    anyChange = true;
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
    console.log(`    ${BOLD}mcp-recall completions zsh > ~/.zfunc/_mcp-recall${RESET}   ${DIM}# zsh${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions bash >> ~/.bash_completion${RESET}    ${DIM}# bash${RESET}`);
    console.log(`    ${BOLD}mcp-recall completions fish > ~/.config/fish/completions/mcp-recall.fish${RESET}  ${DIM}# fish${RESET}`);
  }
}
async function uninstallCommand(opts = {}) {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath = defaultSettingsPath(),
    claudeMdPath = defaultClaudeMdPath(),
    launch = detectLaunch()
  } = opts;
  let anyChange = false;
  const claudeJson = await readJsonFile(claudeJsonPath);
  const mcpServers = claudeJson["mcpServers"];
  const ours = recallHooks(knownClis(launch, mcpServers?.["recall"]));
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
  const ss = removeOurHooks(hooks["SessionStart"] ?? [], ours.SessionStart);
  if (ss.removed > 0) {
    hooks["SessionStart"] = ss.entries;
    settingsChanged = true;
    anyChange = true;
    console.log(`${GREEN}\u2713${RESET} Removed SessionStart hook   ${DIM}(${settingsPath})${RESET}`);
  } else {
    console.log(`${DIM}\u2139 SessionStart hook not present${RESET}`);
  }
  const ptu = removeOurHooks(hooks["PostToolUse"] ?? [], ours.PostToolUse);
  if (ptu.removed > 0) {
    hooks["PostToolUse"] = ptu.entries;
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
function runsServer(entry, server) {
  const e = entry;
  return e?.["command"] === server.command && JSON.stringify(e?.["args"]) === JSON.stringify(server.args);
}
function isBunProgram(program) {
  return /(^|[\\/])bun(\.exe)?$/.test(program);
}
function describeLaunch(command) {
  return typeof command === "string" && !isBunProgram(command) ? `the binary at ${command}` : "the npm install";
}
function locate(program) {
  if (path.isAbsolute(program) || path.win32.isAbsolute(program)) {
    return { path: program, exists: existsSync3(program) };
  }
  const found = Bun.which(program);
  return { path: found ?? program, exists: found !== null };
}
function registeredFiles(launches) {
  const files = new Map;
  const add = (label, p) => {
    if (!files.has(p))
      files.set(p, { label, ...locate(p) });
  };
  for (const [program, script] of launches) {
    if (!program)
      continue;
    if (isBunProgram(program)) {
      add("bun", program);
      if (script)
        add(path.basename(script), script);
    } else {
      add("binary", program);
    }
  }
  return [...files.values()];
}
function ourHookCommands(entries, ours) {
  return (entries ?? []).filter(ours.entry).flatMap((e) => e.hooks.filter(ours.hook).map((h) => h.command));
}
async function statusCommand(opts = {}) {
  const {
    claudeJsonPath = defaultClaudeJsonPath(),
    settingsPath = defaultSettingsPath(),
    claudeMdPath = defaultClaudeMdPath(),
    launch = detectLaunch()
  } = opts;
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
  const server = mcpServers?.["recall"];
  const ours = recallHooks(knownClis(launch, server));
  const serverRegistered = !!server;
  const ssRegistered = (hooks["SessionStart"] ?? []).some(ours.SessionStart.entry);
  const ptuRegistered = (hooks["PostToolUse"] ?? []).some(ours.PostToolUse.entry);
  let claudeMdContent = "";
  try {
    claudeMdContent = await readFile(claudeMdPath, "utf8");
  } catch {}
  const claudeMdOk = isClaudeMdInjected(claudeMdContent);
  const serverWords = typeof server?.["command"] === "string" ? [[server["command"], ...Array.isArray(server["args"]) ? server["args"].map(String) : []]] : [];
  const files = registeredFiles([
    ...serverWords,
    ...ourHookCommands(hooks["SessionStart"], ours.SessionStart).map(shellWords),
    ...ourHookCommands(hooks["PostToolUse"], ours.PostToolUse).map(shellWords)
  ]);
  const filesOk = files.every((f) => f.exists);
  const elsewhere = server !== undefined && !runsServer(server, launch.server);
  const fullyInstalled = serverRegistered && ssRegistered && ptuRegistered && claudeMdOk && filesOk;
  const label = fullyInstalled ? `${GREEN}installed${RESET}` : serverRegistered || ssRegistered || ptuRegistered ? `${YELLOW}partial / stale${RESET}` : `${RED}not installed${RESET}`;
  console.log(`
Installation: ${BOLD}${label}${RESET}
`);
  console.log(`  ${pad("~/.claude.json", 30)}  ${tick(serverRegistered)} mcpServers.recall`);
  console.log(`  ${pad("~/.claude/settings.json", 30)}  ${tick(ssRegistered)} SessionStart hook`);
  console.log(`  ${pad("", 30)}  ${tick(ptuRegistered)} PostToolUse hook`);
  console.log(`  ${pad("~/.claude/CLAUDE.md", 30)}  ${tick(claudeMdOk)} mcp-recall instructions`);
  if (files.length > 0) {
    console.log("");
    console.log(`  ${pad("Registered launch", 30)}`);
    for (const f of files) {
      console.log(`  ${pad(`  ${f.label}`, 30)}  ${tick(f.exists)} ${DIM}${f.path}${RESET}`);
    }
  }
  if (elsewhere) {
    console.log("");
    console.log(`  Registered: ${describeLaunch(server["command"])}; this is ${describeLaunch(launch.server.command)}.`);
    console.log(`  Run ${BOLD}mcp-recall install${RESET} from this one to switch Claude Code to it.`);
  }
  if (!fullyInstalled) {
    console.log("");
    if (!filesOk) {
      console.log(`  Run ${BOLD}mcp-recall install${RESET} from the install Claude Code should use: what is marked ${RED}\u2717${RESET} is gone`);
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
  const { totalBytes, dbCount } = storeFootprint();
  const reminderMb = loadConfig().store.gc_reminder_mb;
  const large = reminderMb > 0 && totalBytes >= reminderMb * 1024 * 1024;
  const storeIcon = large ? `${YELLOW}!${RESET}` : `${GREEN}\u2713${RESET}`;
  console.log(`  ${storeIcon} Store: ${formatBytes(totalBytes)} across ${dbCount} project database${dbCount === 1 ? "" : "s"}`);
  if (large) {
    console.log(`    \u2192 Reclaim space: ${BOLD}mcp-recall gc${RESET} (review, then re-run with ${BOLD}--force${RESET})`);
  }
  console.log("");
}
var BOLD = "\x1B[1m", GREEN = "\x1B[32m", YELLOW = "\x1B[33m", RED = "\x1B[31m", DIM = "\x1B[2m", RESET = "\x1B[0m", MAX_LINK_HOPS = 40, CLAUDE_MD_MARKER_START = "<!-- BEGIN mcp-recall -->", CLAUDE_MD_MARKER_END = "<!-- END mcp-recall -->", CLAUDE_MD_SNIPPET = `## mcp-recall

Session context from previous sessions is automatically injected at startup (pinned items, notes, recent activity). If it was truncated, call \`recall__context()\` for the full view.

When a tool output was compressed by mcp-recall (you'll see a summary with a recall ID like \`recall_abc123\`), call \`recall__retrieve("recall_abc123")\` when you need the full content.

Proactively:
- \`recall__note("\u2026")\` \u2014 save important decisions or context worth keeping across sessions
- \`recall__pin("recall_abc123")\` \u2014 protect frequently-needed items from expiry and eviction
- \`recall__search("query")\` \u2014 find stored outputs by content when you don't have an ID`, CLAUDE_MD_BLOCK, SESSION_START_MARKER = "session-start", POST_TOOL_USE_MARKER = "post-tool-use", POST_TOOL_USE_MATCHER = "(mcp__(?!recall__).*|Bash)";
var init_install = __esm(() => {
  init_loader();
  init_gc();
  init_config();
  CLAUDE_MD_BLOCK = `${CLAUDE_MD_MARKER_START}
${CLAUDE_MD_SNIPPET}
${CLAUDE_MD_MARKER_END}`;
});

// src/discover/index.ts
var exports_discover = {};
__export(exports_discover, {
  storeFiles: () => storeFiles,
  readStore: () => readStore,
  parseSince: () => parseSince,
  mergeReports: () => mergeReports,
  formatReport: () => formatReport,
  discoverCommand: () => discoverCommand,
  DEFAULT_LIMIT: () => DEFAULT_LIMIT
});
import { Database as Database4 } from "bun:sqlite";
import { existsSync as existsSync4, readdirSync as readdirSync5 } from "fs";
import { join as join9 } from "path";
function hasHandlerColumn(db) {
  const cols = db.prepare(`PRAGMA table_info(stored_outputs)`).all();
  return cols.some((c) => c.name === "handler");
}
function readStore(file, opts = {}) {
  let db = null;
  try {
    db = new Database4(file, { readonly: true });
    const isRecallDb = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='stored_outputs'`).get();
    if (!isRecallDb)
      return EMPTY;
    const keys = db.prepare(`SELECT DISTINCT project_key FROM stored_outputs`).all().map((r) => r.project_key);
    if (!hasHandlerColumn(db)) {
      const since = opts.since ?? 0;
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM stored_outputs WHERE tool_name != 'recall__note' AND created_at >= ?`).get(since);
      return { ...EMPTY, unrecorded: n, stores: 1 };
    }
    const reports = keys.map((key) => ({
      routes: getFallbackRoutes(db, key, opts),
      handlers: getHandlerBreakdown(db, key, opts),
      unrecorded: countUnrecordedHandler(db, key, opts),
      stores: 0
    }));
    return { ...mergeReports(reports), stores: 1 };
  } catch {
    return EMPTY;
  } finally {
    db?.close();
  }
}
function addCounts(a, b) {
  return {
    ...a,
    items: a.items + b.items,
    original_bytes: a.original_bytes + b.original_bytes,
    summary_bytes: a.summary_bytes + b.summary_bytes,
    retrieved: a.retrieved + b.retrieved
  };
}
function sumBy(rows, key) {
  const merged = new Map;
  for (const row of rows) {
    const k = key(row);
    const prev = merged.get(k);
    merged.set(k, prev ? addCounts(prev, row) : row);
  }
  return [...merged.values()].sort((a, b) => b.original_bytes - a.original_bytes);
}
function mergeReports(reports) {
  return {
    routes: sumBy(reports.flatMap((r) => r.routes), (r) => `${r.tool_name}\x00${r.command_fp ?? ""}\x00${r.handler}`),
    handlers: sumBy(reports.flatMap((r) => r.handlers), (r) => r.handler),
    unrecorded: reports.reduce((n, r) => n + r.unrecorded, 0),
    stores: reports.reduce((n, r) => n + r.stores, 0)
  };
}
function storeFiles(all, cwd = process.cwd()) {
  if (!all) {
    const file = defaultDbPath(getProjectKey(cwd));
    return existsSync4(file) ? [file] : [];
  }
  const dir = dataDir();
  if (!existsSync4(dir))
    return [];
  return readdirSync5(dir).filter((n) => n.endsWith(".db")).map((n) => join9(dir, n));
}
function pct(part, whole) {
  return whole > 0 ? `${(part / whole * 100).toFixed(0)}%` : "\u2014";
}
function reduction(row) {
  return row.original_bytes > 0 ? pct(row.original_bytes - row.summary_bytes, row.original_bytes) : "\u2014";
}
function routeLabel(row) {
  return row.command_fp !== null ? `${row.tool_name}: ${row.command_fp}` : row.tool_name;
}
function table(header, rows, textCols = 1) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells) => "  " + cells.map((c, i) => i < textCols ? c.padEnd(widths[i]) : c.padStart(widths[i])).join("  ");
  return [fmt(header), ...rows.map(fmt)];
}
function formatReport(report, limit = DEFAULT_LIMIT) {
  const lines = [];
  const shown = report.routes.slice(0, limit);
  lines.push("Fallback-routed output, by original size (candidates for a new handler):");
  if (shown.length === 0) {
    lines.push("  none recorded");
  } else {
    lines.push(...table(["tool / command", "handler", "items", "original", "delivered", "reduction", "retrieved"], shown.map((r) => [
      routeLabel(r),
      r.handler,
      String(r.items),
      formatBytes(r.original_bytes),
      formatBytes(r.summary_bytes),
      reduction(r),
      pct(r.retrieved, r.items)
    ]), 2));
    const hidden = report.routes.length - shown.length;
    if (hidden > 0)
      lines.push(`  \u2026 ${hidden} more (--limit to show more)`);
  }
  lines.push("", "By handler:");
  if (report.handlers.length === 0) {
    lines.push("  none recorded");
  } else {
    lines.push(...table(["handler", "items", "original", "delivered", "reduction", "retrieved"], report.handlers.map((r) => [
      r.handler,
      String(r.items),
      formatBytes(r.original_bytes),
      formatBytes(r.summary_bytes),
      reduction(r),
      pct(r.retrieved, r.items)
    ])));
  }
  lines.push("", "retrieved = share fetched at least once with recall__retrieve; a high rate means the summary dropped something needed.");
  if (report.unrecorded > 0) {
    lines.push(`${report.unrecorded} item${report.unrecorded === 1 ? "" : "s"} stored before handlers were recorded (1.17.0) ` + `${report.unrecorded === 1 ? "is" : "are"} not included.`);
  }
  return lines.join(`
`);
}
function parseSince(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m)
    return null;
  const date2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (date2.getMonth() !== Number(m[2]) - 1 || date2.getDate() !== Number(m[3]))
    return null;
  return Math.floor(date2.getTime() / 1000);
}
function localDate(seconds) {
  const d = new Date(seconds * 1000);
  const two = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}
function discoverCommand(opts = {}) {
  const files = storeFiles(opts.all ?? false);
  if (files.length === 0) {
    console.log(opts.all ? "No stores found." : "No store for this project yet.");
    return;
  }
  const report = mergeReports(files.map((f) => readStore(f, { since: opts.since })));
  const scope = opts.all ? `${report.stores} store${report.stores === 1 ? "" : "s"}` : "this project";
  const since = opts.since !== undefined ? ` since ${localDate(opts.since)}` : "";
  console.log(`mcp-recall discover \xB7 ${scope}${since}
`);
  console.log(formatReport(report, opts.limit));
}
var DEFAULT_LIMIT = 10, EMPTY;
var init_discover = __esm(() => {
  init_db();
  init_project_key();
  EMPTY = { routes: [], handlers: [], unrecorded: 0, stores: 0 };
});

// src/hooks/session-start.ts
init_config();
init_project_key();
init_db();
import { statSync as statSync2 } from "fs";

// src/tools.ts
init_db();
init_config();
init_secrets();
var CONTEXT_EMPTY_RESPONSE = "[recall: no context available yet \u2014 use recall tools to build up your context store]";
var CONTEXT_EXCERPT_LEN = 100;
var LIST_TOOL_COL_WIDTH = 40;
function formatDate(unixSecs) {
  return new Date(unixSecs * 1000).toISOString().slice(0, 10);
}
function reductionPct(original, summary) {
  if (original === 0)
    return "0%";
  return `${((1 - summary / original) * 100).toFixed(0)}%`;
}
var OVERFLOW_SESSIONS = 3;
function formatSampleCount(sample) {
  return sample.overflow.length > 0 ? `${sample.items.length} of ${sample.total.toLocaleString("en-US")}` : `${sample.items.length}`;
}
function formatSampleOverflow(overflow) {
  const named = overflow.slice(0, OVERFLOW_SESSIONS).map((o) => `+${o.count.toLocaleString("en-US")} more from ${o.session_id}`);
  const rest = overflow.slice(OVERFLOW_SESSIONS);
  if (rest.length > 0) {
    const restCount = rest.reduce((sum, o) => sum + o.count, 0);
    named.push(`+${restCount.toLocaleString("en-US")} more from ${rest.length} other sessions`);
  }
  return `  ${named.join(" \xB7 ")}
` + `    (recall__list_stored to browse; recall__forget session_id clears a session, force: true for pinned)`;
}
function toolContext(db, projectKey, args) {
  const data = getContext(db, projectKey, args);
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const isEmpty = data.pinned.items.length === 0 && data.notes.length === 0 && data.recent.length === 0 && data.hot.length === 0 && data.last_session === null;
  if (isEmpty) {
    return CONTEXT_EMPTY_RESPONSE;
  }
  const lines = [
    `Context \u2014 ${today}`,
    "\u2550".repeat(36),
    `Generated ${formatRelativeTime(Date.now() - now)}`
  ];
  if (data.pinned.items.length > 0) {
    lines.push("", `Pinned (${formatSampleCount(data.pinned)}):`);
    for (const item of data.pinned.items) {
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "\u2026" : "";
      lines.push(`  \uD83D\uDCCC ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  ${formatDate(item.created_at)}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
    if (data.pinned.overflow.length > 0)
      lines.push(formatSampleOverflow(data.pinned.overflow));
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
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "\u2026" : "";
      lines.push(`  ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  ${formatDate(item.created_at)}  \xD7${item.access_count}`);
      lines.push(`    ${excerpt}${ellipsis}`);
    }
  }
  if (data.hot.length > 0) {
    const date2 = data.last_session?.date ?? "";
    lines.push("", `Hot from last session (${date2}, ${data.hot.length} item${data.hot.length === 1 ? "" : "s"}):`);
    for (const item of data.hot) {
      const excerpt = item.summary.slice(0, CONTEXT_EXCERPT_LEN).replace(/\n/g, " ");
      const ellipsis = item.summary.length > CONTEXT_EXCERPT_LEN ? "\u2026" : "";
      lines.push(`  ${item.id}  ${item.tool_name.padEnd(LIST_TOOL_COL_WIDTH)}  ${formatDate(item.created_at)}  \xD7${item.access_count}`);
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

// src/hooks/session-start.ts
init_gc();
init_log();
var INJECT_MAX_CHARS = 2000;
function isExistingDir(path) {
  try {
    return statSync2(path).isDirectory();
  } catch {
    return false;
  }
}
function handleSessionStart(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.error("session-start received invalid JSON \u2014 skipping");
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.error("session-start received unexpected input shape \u2014 skipping");
    return;
  }
  const input = parsed;
  const config2 = loadConfig();
  const projectKey = getProjectKey(input.cwd);
  const db = getDb(defaultDbPath(projectKey));
  const projectPath = getProjectPath(input.cwd);
  if (isExistingDir(projectPath)) {
    setMeta(db, "project_path", projectPath);
  } else {
    log.debug(`session-start \xB7 resolved project path is not a directory, leaving meta as-is: ${projectPath}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  recordSession(db, today);
  pruneExpired(db, projectKey, config2.store.expire_after_session_days);
  const parts = [];
  const reminder = gcReminderText(storeFootprint(), config2.store.gc_reminder_mb);
  if (reminder)
    parts.push(reminder);
  let snapshot = toolContext(db, projectKey, {});
  if (snapshot !== CONTEXT_EMPTY_RESPONSE) {
    if (snapshot.length > INJECT_MAX_CHARS) {
      snapshot = snapshot.slice(0, INJECT_MAX_CHARS) + `
\u2026 (truncated \u2014 call recall__context for the full view)`;
    }
    parts.push(snapshot);
  }
  if (parts.length === 0) {
    log.debug(`session-start \xB7 project=${projectKey.slice(0, 8)} \xB7 nothing to inject`);
  } else {
    const out = parts.join(`

`);
    process.stdout.write(out + `
`);
    log.debug(`session-start \xB7 project=${projectKey.slice(0, 8)} \xB7 injected ${out.length} chars`);
  }
}

// src/hooks/post-tool-use.ts
init_config();
init_project_key();
init_denylist();
init_secrets();
init_handlers();
init_types();
init_generic();
import { createHash as createHash3 } from "crypto";
import { readFileSync as readFileSync3, statSync as statSync4 } from "fs";
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute2 } from "path";

// src/hints.ts
var DEFAULT_MAX_HINTS = 5;
var MIN_TOKEN_LEN = 3;
var MAX_TOKEN_LEN = 40;
var IDENTIFIER_BOOST = 2;
var PROPER_NOUN_BOOST = 1;
var TOKEN_RE = /[A-Za-z][A-Za-z0-9_]*/g;
var CAMEL_RE = /[a-z][A-Z]/;
var STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "with",
  "this",
  "that",
  "from",
  "into",
  "over",
  "has",
  "have",
  "had",
  "was",
  "were",
  "will",
  "would",
  "should",
  "could",
  "not",
  "but",
  "you",
  "your",
  "yours",
  "all",
  "any",
  "can",
  "use",
  "used",
  "using",
  "its",
  "out",
  "per",
  "via",
  "one",
  "two",
  "get",
  "set",
  "new",
  "null",
  "true",
  "false",
  "none",
  "nan",
  "undefined"
]);
function isIdentifier(token) {
  return token.includes("_") || CAMEL_RE.test(token);
}
function extractHints(content, maxHints = DEFAULT_MAX_HINTS) {
  if (maxHints <= 0)
    return [];
  const acc = new Map;
  for (const match of content.matchAll(TOKEN_RE)) {
    const raw = match[0];
    if (raw.length < MIN_TOKEN_LEN || raw.length > MAX_TOKEN_LEN)
      continue;
    const key = raw.toLowerCase();
    if (STOPWORDS.has(key))
      continue;
    const existing = acc.get(key);
    if (existing) {
      existing.count++;
    } else {
      acc.set(key, {
        display: raw,
        count: 1,
        identifier: isIdentifier(raw),
        proper: raw[0] >= "A" && raw[0] <= "Z"
      });
    }
  }
  return [...acc.values()].map((t) => ({
    display: t.display,
    key: t.display.toLowerCase(),
    score: t.count + (t.identifier ? IDENTIFIER_BOOST : 0) + (t.proper ? PROPER_NOUN_BOOST : 0)
  })).sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, maxHints).map((t) => t.display);
}

// src/hooks/post-tool-use.ts
init_db();

// src/retention.ts
init_bash();
init_clip();
var NETWORK_BASH_RE = /^(curl|wget|https?|xh)\b|^gh\s+api\b/;
var unwrapCommand2 = normalizeCommand;
function shouldRetainFullBody(level, toolName, command, summary = "") {
  if (level === "full")
    return true;
  if (level === "minimal")
    return false;
  if (hasClippedLine(summary))
    return true;
  if (toolName.startsWith("mcp__"))
    return true;
  if (toolName === "Bash") {
    return NETWORK_BASH_RE.test(unwrapCommand2(command ?? "")) || isContentRead(command ?? "");
  }
  return true;
}

// src/hooks/post-tool-use.ts
init_bash();
init_bash_shared();
init_log();
function asBashResponse(toolResponse) {
  let value = toolResponse;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  return typeof value.stdout === "string" ? value : null;
}
var MAX_PERSISTED_BYTES = 20 * 1024 * 1024;
function withPersistedOutput(toolResponse) {
  const bash = asBashResponse(toolResponse);
  const path = bash?.persistedOutputPath;
  const size2 = bash?.persistedOutputSize;
  if (!bash || typeof path !== "string" || typeof size2 !== "number")
    return toolResponse;
  if (!isAbsolute2(path) || basename2(dirname3(path)) !== "tool-results" || size2 > MAX_PERSISTED_BYTES) {
    return toolResponse;
  }
  try {
    if (statSync4(path).size !== size2)
      return toolResponse;
    return { ...bash, stdout: readFileSync3(path, "utf8"), stderr: "" };
  } catch (err) {
    log.debug(`persisted output unreadable \xB7 ${path} \xB7 ${String(err)}`);
    return toolResponse;
  }
}
var SAVED_RESULT_RE = /^Error: result \(([\d,]+) characters(?: across ([\d,]+) lines?)?\) exceeds maximum allowed tokens\. Output has been saved to (.+?)\.(?:\n|$)/;
function hasLines(text, lines) {
  const segments = text.split(`
`).length;
  return segments === lines || text.endsWith(`
`) && segments - 1 === lines;
}
function withSavedMcpResult(toolResponse) {
  const blocks = asMcpContentBlocks(toolResponse);
  const text = blocks ? joinTextBlocks(blocks) : typeof toolResponse === "string" ? toolResponse : "";
  const match = text.match(SAVED_RESULT_RE);
  if (!match)
    return toolResponse;
  const count = (s) => Number(s.replace(/,/g, ""));
  const chars = count(match[1]);
  const lines = match[2] === undefined ? null : count(match[2]);
  const path = match[3];
  if (!isAbsolute2(path) || basename2(dirname3(path)) !== "tool-results")
    return null;
  try {
    if (statSync4(path).size > MAX_PERSISTED_BYTES)
      return null;
    const saved = readFileSync3(path, "utf8");
    if (saved.length !== chars || lines !== null && !hasLines(saved, lines))
      return null;
    if (typeof toolResponse === "string")
      return saved;
    const base = Array.isArray(toolResponse) ? {} : toolResponse;
    return { ...base, content: [{ type: "text", text: saved }] };
  } catch (err) {
    log.debug(`saved MCP result unreadable \xB7 ${path} \xB7 ${String(err)}`);
    return null;
  }
}
function replaceOutput(text, toolResponse) {
  const bash = asBashResponse(toolResponse);
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedToolOutput: bash ? { ...bash, stdout: text, stderr: "" } : text
    },
    updatedMCPToolOutput: text,
    suppressOutput: true
  };
}
function handlePostToolUse(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.error("post-tool-use received invalid JSON \u2014 skipping");
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    log.error("post-tool-use received unexpected input shape \u2014 skipping");
    return {};
  }
  const input = parsed;
  const { tool_name, tool_input, tool_response, cwd, session_id } = input;
  const config2 = loadConfig();
  let response = tool_name === "Bash" ? withPersistedOutput(tool_response) : tool_response;
  if (isDenied(tool_name, config2)) {
    log.debug(`SKIP denylist \xB7 ${tool_name}`);
    return {};
  }
  if (tool_name.startsWith("mcp__")) {
    const saved = withSavedMcpResult(tool_response);
    if (saved === null) {
      log.debug(`SKIP saved-result-unverified \xB7 ${tool_name}`);
      return {};
    }
    response = saved;
  }
  const fullContent = tool_name === "Bash" ? bashOutputText(response) : extractText(response);
  log.debug(`intercepted ${tool_name} \xB7 ${formatBytes(Buffer.byteLength(fullContent, "utf8"))}`);
  const secretNames = findSecrets(fullContent);
  if (secretNames.length > 0) {
    log.warn(`skipped ${tool_name}: detected ${secretNames.join(", ")}`);
    return {};
  }
  const command = tool_input !== null && typeof tool_input === "object" && typeof tool_input.command === "string" ? tool_input.command : undefined;
  if (tool_name === "Bash" && command && isContentRead(command) && Buffer.byteLength(fullContent, "utf8") <= READ_PASSTHROUGH_MAX_BYTES) {
    log.debug(`SKIP content-read \xB7 ${formatBytes(Buffer.byteLength(fullContent, "utf8"))}`);
    return {};
  }
  const projectKey = getProjectKey(cwd);
  const db = getDb(defaultDbPath(projectKey));
  const command_fp = tool_name === "Bash" && command ? bashFingerprint(command) || null : null;
  const input_hash = tool_input !== undefined ? createHash3("sha256").update(tool_name + JSON.stringify(tool_input)).digest("hex") : null;
  const output_hash = hashContent(fullContent);
  const cachedResponse = (cached4) => {
    const cachedDate = new Date(cached4.created_at * 1000).toISOString().slice(0, 10);
    const text = `[recall:${cached4.id} \xB7 cached \xB7 ${cachedDate}]
${cached4.summary}`;
    if (!savesEnough(Buffer.byteLength(text, "utf8"), Buffer.byteLength(fullContent, "utf8"))) {
      log.debug(`SKIP cached-not-smaller \xB7 ${tool_name} \xB7 id=${cached4.id}`);
      return {};
    }
    log.debug(`CACHE HIT \xB7 ${tool_name} \xB7 id=${cached4.id} \xB7 cached ${cachedDate}`);
    return replaceOutput(text, tool_response);
  };
  const cached3 = checkOutputDedup(db, projectKey, output_hash, tool_name, command_fp);
  if (cached3)
    return cachedResponse(cached3);
  const handler = getHandler(tool_name, response, tool_input);
  log.debug(`handler: ${handler.name} \xB7 ${tool_name}`);
  let { summary, originalSize } = handler(tool_name, response);
  let handlerName = handler.name;
  if (summary.trim() === "" && originalSize > 0) {
    log.debug(`empty summary from ${handler.name} \xB7 ${tool_name} \xB7 falling back to genericHandler`);
    ({ summary, originalSize } = genericHandler(tool_name, response));
    handlerName = genericHandler.name;
  }
  const summarySize = Buffer.byteLength(summary, "utf8");
  const hints = extractHints(fullContent);
  const deliveredSize = deliveredBytes(summary, originalSize, hints);
  if (!savesEnough(deliveredSize, originalSize)) {
    log.debug(`SKIP no-compression \xB7 ${tool_name} \xB7 ${formatBytes(deliveredSize)} of ${formatBytes(originalSize)}`);
    return {};
  }
  const full_retained = shouldRetainFullBody(config2.store.retention, tool_name, command, summary) ? 1 : 0;
  if (!full_retained)
    log.debug(`summary-only \xB7 ${tool_name} \xB7 retention=${config2.store.retention}`);
  const stored = storeOutput(db, {
    project_key: projectKey,
    session_id,
    tool_name,
    summary,
    full_content: fullContent,
    original_size: originalSize,
    input_hash: input_hash ?? undefined,
    output_hash,
    full_retained,
    command_fp,
    delivered_size: deliveredSize,
    handler: handlerName
  });
  evictIfNeeded(db, projectKey, config2.store.max_size_mb, config2.store.eviction_half_life_days);
  log.debug(`STORED \xB7 ${tool_name} \xB7 id=${stored.id} \xB7 ${formatBytes(originalSize)}\u2192${formatBytes(summarySize)} (${reductionPercent(summarySize, originalSize)}% reduction)`);
  return replaceOutput(`${recallHeader(stored.id, originalSize, summarySize, hints)}
${summary}`, tool_response);
}
function reductionPercent(summarySize, originalSize) {
  return ((1 - summarySize / originalSize) * 100).toFixed(0);
}
function recallHeader(id, originalSize, summarySize, hints) {
  const hintStr = hints.length ? ` \xB7 search: ${hints.map((h) => `"${h}"`).join(", ")}` : "";
  return `[recall:${id} \xB7 ${formatBytes(originalSize)}\u2192${formatBytes(summarySize)} (${reductionPercent(summarySize, originalSize)}% reduction)${hintStr}]`;
}
var MIN_SAVING = 0.25;
function savesEnough(delivered, original) {
  return original > 0 && delivered <= original * (1 - MIN_SAVING);
}
var ID_PLACEHOLDER = `recall_${"0".repeat(16)}`;
function deliveredBytes(summary, originalSize, hints) {
  const summarySize = Buffer.byteLength(summary, "utf8");
  return Buffer.byteLength(recallHeader(ID_PLACEHOLDER, originalSize, summarySize, hints), "utf8") + 1 + summarySize;
}

// src/cli.ts
init_log();
import { join as join10 } from "path";
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
  serve                Run the MCP server on stdio (Claude Code starts this)
  gc [--force]         Reclaim disk: list/delete orphaned project DBs
    --stale-days N     Legacy DBs (no recorded path) older than N days are candidates (default 90)
    --vacuum           Full-VACUUM surviving DBs to reclaim free pages
  discover             Rank output routed to fallback handlers: where a new handler would pay
    --all              Every project's store, not just this one
    --since YYYY-MM-DD Only output stored on or after this date
    --limit N          Rows to list (default 10)
  profiles <cmd>       Manage compression profiles
    seed [--all]       Install profiles for detected MCPs (--all for entire catalog)
    list               Show installed profiles
    install <id>       Install a specific community profile
    update             Update all community profiles
    remove <id>        Remove a community profile
    available          List community profiles available to install
    info <id>          Show details for a profile (falls back to local data offline)
    feed [path]        Contribute a profile to the community
    check              Detect pattern conflicts
    retrain            Suggest profile improvements from stored data
    test <tool>        Test a profile against real input
  learn                Generate profiles from your installed MCP servers
  import <file>        Restore items from a recall__export JSON dump
  completions <shell>  Print shell completion script (bash, zsh, fish)

Options:
  --help, -h           Show this help
  --version, -v        Show version

Examples:
  mcp-recall install              # first-time setup
  mcp-recall profiles seed        # install profiles for your MCPs
  mcp-recall status               # check everything is working
  mcp-recall completions zsh > ~/.zfunc/_mcp-recall
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

  local commands="install uninstall status gc discover profiles learn import completions --help --version"
  local profiles_cmds="list install update remove available info seed feed check retrain test"

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
# Add to your fpath, e.g.: mcp-recall completions zsh > ~/.zfunc/_mcp-recall
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
        'available:list community profiles available to install'
        'info:show details for a profile'
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
        'gc:reclaim disk from orphaned project databases'
        'discover:rank output routed to fallback handlers'
        'profiles:manage compression profiles'
        'learn:generate profiles from your installed MCP servers'
        'import:restore items from a recall__export JSON dump'
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

set -l commands install uninstall status gc discover profiles learn import completions

# Top-level commands
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a install -d "Register hooks and MCP server in Claude Code"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a uninstall -d "Remove hooks and MCP server"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a status -d "Show current configuration and health"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a gc -d "Reclaim disk from orphaned project databases"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a discover -d "Rank output routed to fallback handlers"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a profiles -d "Manage compression profiles"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a learn -d "Generate profiles from your installed MCP servers"
complete -c mcp-recall -f -n "not __fish_seen_subcommand_from $commands" \\
  -a import -d "Restore items from a recall__export JSON dump"
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
set -l profile_cmds list install update remove available info seed feed check retrain test

complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a list -d "Show installed profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a install -d "Install a community profile by ID"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a update -d "Update all installed community profiles"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a remove -d "Remove an installed community profile"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a available -d "List community profiles available to install"
complete -c mcp-recall -f -n "__fish_seen_subcommand_from profiles; and not __fish_seen_subcommand_from $profile_cmds" \\
  -a info -d "Show details for a profile"
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
    const { handleProfilesCommand: handleProfilesCommand2 } = await Promise.resolve().then(() => (init_commands(), exports_commands));
    await handleProfilesCommand2(process.argv.slice(3));
    process.exit(0);
  }
  if (subcommand === "learn") {
    const { handleLearnCommand: handleLearnCommand2 } = await Promise.resolve().then(() => (init_learn(), exports_learn));
    await handleLearnCommand2(process.argv.slice(3));
    process.exit(0);
  }
  if (subcommand === "import") {
    const { handleImportCommand: handleImportCommand2 } = await Promise.resolve().then(() => (init_import(), exports_import));
    await handleImportCommand2(process.argv.slice(3));
    process.exit(0);
  }
  if (subcommand === "install") {
    const { installCommand: installCommand2 } = await Promise.resolve().then(() => (init_install(), exports_install));
    const dryRun = process.argv.includes("--dry-run");
    await installCommand2({ dryRun });
    process.exit(0);
  }
  if (subcommand === "uninstall") {
    const { uninstallCommand: uninstallCommand2 } = await Promise.resolve().then(() => (init_install(), exports_install));
    await uninstallCommand2();
    process.exit(0);
  }
  if (subcommand === "status") {
    const { statusCommand: statusCommand2 } = await Promise.resolve().then(() => (init_install(), exports_install));
    await statusCommand2();
    process.exit(0);
  }
  if (subcommand === "discover") {
    const { discoverCommand: discoverCommand2, parseSince: parseSince2 } = await Promise.resolve().then(() => (init_discover(), exports_discover));
    const sinceIdx = process.argv.indexOf("--since");
    let since;
    if (sinceIdx !== -1) {
      const parsed = parseSince2(process.argv[sinceIdx + 1] ?? "");
      if (parsed === null) {
        console.error("--since must be a date, YYYY-MM-DD");
        process.exit(1);
      }
      since = parsed;
    }
    const limitIdx = process.argv.indexOf("--limit");
    const limit = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      console.error("--limit must be a positive integer");
      process.exit(1);
    }
    discoverCommand2({ all: process.argv.includes("--all"), since, limit });
    process.exit(0);
  }
  if (subcommand === "serve") {
    await import(join10(import.meta.dir, import.meta.path.endsWith(".js") ? "server.js" : "server.ts"));
    return;
  }
  if (subcommand === "gc") {
    const { gcCommand: gcCommand2 } = await Promise.resolve().then(() => (init_gc(), exports_gc));
    const staleIdx = process.argv.indexOf("--stale-days");
    const staleDays = staleIdx !== -1 && process.argv[staleIdx + 1] ? Number(process.argv[staleIdx + 1]) : undefined;
    if (staleDays !== undefined && (!Number.isFinite(staleDays) || staleDays < 1)) {
      console.error("--stale-days must be a positive number");
      process.exit(1);
    }
    gcCommand2({
      dryRun: !process.argv.includes("--force"),
      vacuum: process.argv.includes("--vacuum"),
      staleDays
    });
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
        log.error(`unknown subcommand: ${subcommand}`);
        process.exit(1);
    }
  } catch (err) {
    log.debug(`STACK: ${err instanceof Error ? err.stack : String(err)}`);
    log.error(`error in ${subcommand}: ${err}`);
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
  main,
  getVersion,
  completionScript
};
