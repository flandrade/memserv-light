/*
  RESP (Redis Serialization Protocol)
*/

import { RespSerializeError } from "../utils/error";

export type RespValue = string | number | boolean | null | RespValue[];

const CRLF = '\r\n';

export const COMMON_RESP_VALUES = {
  OK: `+OK${CRLF}`,
  PONG: `+PONG${CRLF}`,
  NULL: `$-1${CRLF}`,
  MINUS_ONE: `:-1${CRLF}`,
  MINUS_TWO: `:-2${CRLF}`,
  ZERO: `:0${CRLF}`,
  ONE: `:1${CRLF}`,
  EMPTY_ARRAY: `*0${CRLF}`,
  // Common arrays
  SINGLE_ELEMENT_ARRAY_PREFIX: `*1${CRLF}`,
  TWO_ELEMENT_ARRAY_PREFIX: `*2${CRLF}`,
  THREE_ELEMENT_ARRAY_PREFIX: `*3${CRLF}`
};

/**
 * Serializes JavaScript values to RESP (Redis Serialization Protocol) format.
 *
 * Converts various data types to their RESP representation:
 * - null/undefined -> null bulk string ($-1\r\n)
 * - string -> simple string (+string\r\n)
 * - number -> integer (:number\r\n)
 * - boolean -> integer (true=1, false=0)
 * - array -> array (*length\r\n followed by serialized elements)
 * - other types -> bulk string ($length\r\ncontent\r\n)
 *
 * Uses optimized fast paths for common values (0, 1, -1, -2) and array sizes (1, 2, 3).
 *
 * @param data - The value to serialize
 * @returns RESP-formatted string
 *
 * @example
 * serialize("hello") // "+hello\r\n"
 * serialize(42) // ":42\r\n"
 * serialize(["GET", "user"]) // "*2\r\n+GET\r\n+user\r\n"
 */
export const serialize = (data: RespValue): string => {
  if (data === null || data === undefined) return COMMON_RESP_VALUES.NULL;

  const type = typeof data;
  if (type === 'string') {
    return `+${data}${CRLF}`;
  }

  if (type === 'number') {
    // Fast path for common numbers
    switch (data) {
      case 0: return COMMON_RESP_VALUES.ZERO;
      case 1: return COMMON_RESP_VALUES.ONE;
      case -1: return COMMON_RESP_VALUES.MINUS_ONE;
      case -2: return COMMON_RESP_VALUES.MINUS_TWO;
      default: return `:${data}${CRLF}`;
    }
  }

  if (type === 'boolean') return data ? COMMON_RESP_VALUES.ONE : COMMON_RESP_VALUES.ZERO;

  if (Array.isArray(data)) {
    const len = data.length;
    if (len === 0) return COMMON_RESP_VALUES.EMPTY_ARRAY;

    // Fast path for common array sizes
    let prefix: string;
    switch (len) {
      case 1: prefix = COMMON_RESP_VALUES.SINGLE_ELEMENT_ARRAY_PREFIX; break;
      case -1: prefix = COMMON_RESP_VALUES.MINUS_ONE; break;
      case -2: prefix = COMMON_RESP_VALUES.MINUS_TWO; break;
      case 2: prefix = COMMON_RESP_VALUES.TWO_ELEMENT_ARRAY_PREFIX; break;
      case 3: prefix = COMMON_RESP_VALUES.THREE_ELEMENT_ARRAY_PREFIX; break;
      default: prefix = `*${len}${CRLF}`;
    }

    // Pre-allocate for better performance
    const parts = [prefix];
    for (let i = 0; i < len; i++) {
      parts.push(serialize(data[i]));
    }
    return parts.join('');
  }

  // Handle objects and other types as bulk string
  const str = String(data);
  return `$${str.length}${CRLF}${str}${CRLF}`;
};

export const deserialize = (data: string): RespValue => {
  if (!data) throw new Error('Empty input data');

  // Single-line responses
  if (data.indexOf(CRLF) === data.length - 2) {
    const type = data[0];
    const content = data.slice(1, -2);
    switch (type) {
      case '+': return content;
      case ':': return parseInt(content, 10);
      case '$': return content === '-1' ? null : content;
      case '*': return content === '0' ? [] : content;
      case '-': throw new Error(`Server error: ${content}`);
      default: return content; // Return as string for malformed input
    }
  }

  const lines = data.split(CRLF);
  return multiLineDeserialize(lines, 0).value;
};

/**
 * Deserializes RESP (Redis Serialization Protocol) data to JavaScript values.
 *
 * Handles both single-line and multi-line RESP messages. For single-line responses,
 * uses a fast path optimization. For complex multi-line structures, delegates to
 * multiLineDeserialize for recursive parsing.
 *
 * RESP Type Support:
 * - '+' (Simple String): Returns string content
 * - ':' (Integer): Returns parsed number
 * - '$' (Bulk String): Returns string content or null if length is -1
 * - '*' (Array): Returns array of deserialized elements
 * - '-' (Error): Throws Error with message
 *
 * @param data - RESP-formatted string to deserialize
 * @returns Deserialized JavaScript value
 * @throws {Error} If input is empty or contains error responses
 *
 * @example
 * deserialize("+OK\r\n") // "OK"
 * deserialize(":42\r\n") // 42
 * deserialize("*2\r\n+GET\r\n+user\r\n") // ["GET", "user"]
 */
const multiLineDeserialize = (lines: string[], index: number): { value: RespValue; nextIndex: number } => {
  const line = lines[index];
  const type = line[0];
  const content = line.slice(1);

  switch (type) {
    case '+': return { value: content, nextIndex: index + 1 };
    case ':': return { value: parseInt(content, 10), nextIndex: index + 1 };
    case '$': {
      // Bulk string example
      // bulk string: ["$5", "Hello", ""]
      //                ^0    ^1      ^2
      //                 |     |       |
      //                 |     |       └── nextIndex = 2 (start parsing here next)
      //                 |     └── lines[1] = "Hello" (the content we return)
      //                 └── index = 0 (where we started)
      const length = parseInt(content, 10);
      if (length === -1) return { value: null, nextIndex: index + 1 };
      if (length === 0) return { value: '', nextIndex: index + 2 };
      return { value: lines[index + 1], nextIndex: index + 2 };
    }
    case '*': {
      // Array example
      // array: ["*2", "+GET", "+user", ""]
      //          ^0    ^1      ^2      ^3
      const arrayLength = parseInt(content, 10);
      if (arrayLength === 0) return { value: [], nextIndex: index + 1 };
      const result: RespValue[] = [];
      let currentIndex = index + 1;
      for (let i = 0; i < arrayLength; i++) {
        const parsed = multiLineDeserialize(lines, currentIndex);
        result[i] = parsed.value;
        currentIndex = parsed.nextIndex;
      }
      return { value: result, nextIndex: currentIndex };
    }
    case '-':
      throw new RespSerializeError(`Server error: ${content}`);
    default:
      return { value: content, nextIndex: index + 1 }; // Return as string for malformed input
  }
};

export const formatError = (data?: RespValue): string => {
  return `-ERROR ${data || 'Unknown error'}${CRLF}`;
};
