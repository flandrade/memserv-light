/*
  RESP (Redis Serialization Protocol)
  https://redis.io/docs/latest/develop/reference/protocol-spec/

  Simple string: +<string>\r\n
  Error: -<string>\r\n
  Integer: :<integer>\r\n
  Bulk string: $<integer>\r\n<string>\r\n
  Array: *<integer>\r\n<array>\r\n

  This file is a simplified implementation of the RESP protocol.
*/

import { RespSerializeError } from '../utils/error';

export type RespValue = string | number | boolean | null | RespValue[];

export interface ParseResult {
  value: RespValue;
  nextIndex: number;
}

// Constants
const CRLF = '\r\n' as const;
const NULL_BULK_STRING = '$-1\r\n' as const;

// RESP type identifiers
export enum RespType {
  SimpleString = '+',
  Error = '-',
  Integer = ':',
  BulkString = '$',
  Array = '*'
}

// Pre-computed constants for common responses
const OK_RESPONSE = `${RespType.SimpleString}OK${CRLF}`;
const PONG_RESPONSE = `${RespType.SimpleString}PONG${CRLF}`;
const ZERO_INT = `${RespType.Integer}0${CRLF}`;
const ONE_INT = `${RespType.Integer}1${CRLF}`;
const EMPTY_ARRAY = `${RespType.Array}0${CRLF}`;

export const serialize = (data: RespValue): string => {
  if (data === null) return NULL_BULK_STRING;

  switch (typeof data) {
    case 'string':
      return RespType.SimpleString + data + CRLF;
    case 'number':
      if (!Number.isInteger(data)) {
        throw new RespSerializeError('RESP only supports integers', data);
      }
      // Use pre-computed constants for common numbers
      if (data === 0) return ZERO_INT;
      if (data === 1) return ONE_INT;
      return RespType.Integer + data + CRLF;
    case 'boolean':
      return data ? ONE_INT : ZERO_INT;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return EMPTY_ARRAY;

    // Use array buffer for better performance with large arrays
    let result = RespType.Array + data.length + CRLF;
    for (const item of data) {
      result += serialize(item);
    }
    return result;
  }

  // Fallback to bulk string
  const str = String(data);
  return RespType.BulkString + str.length + CRLF + str + CRLF;
};

// Cache for split results to avoid repeated splitting
const splitCache = new Map<string, string[]>();
const MAX_CACHE_SIZE = 100;

export const deserialize = (data: string): RespValue => {
  if (!data || data.length === 0) {
    throw new RespSerializeError('Empty input data');
  }

  // Use cache for commonly repeated commands
  let lines = splitCache.get(data);
  if (!lines) {
    lines = data.split(CRLF);
    if (splitCache.size < MAX_CACHE_SIZE) {
      splitCache.set(data, lines);
    }
  }

  return parseValue(lines, 0).value;
};

const parseValue = (lines: readonly string[], index: number): ParseResult => {
  if (index >= lines.length) {
    throw new RespSerializeError('Unexpected end of input', index);
  }

  const line = lines[index];
  if (!line || line.length === 0) {
    throw new RespSerializeError('Empty line encountered', index);
  }

  const typeIndicator = line[0] as RespType;
  const content = line.slice(1);

  switch (typeIndicator) {
    case RespType.SimpleString:
      return { value: content, nextIndex: index + 1 };

    case RespType.Integer: {
      const value = parseInt(content, 10);
      if (Number.isNaN(value)) {
        throw new RespSerializeError(`Invalid integer: ${content}`, index);
      }
      return { value, nextIndex: index + 1 };
    }

    case RespType.BulkString: {
      const length = parseInt(content, 10);
      if (Number.isNaN(length)) {
        throw new RespSerializeError(`Invalid bulk string length: ${content}`, index);
      }

      if (length === -1) return { value: null, nextIndex: index + 1 };
      if (length === 0) return { value: '', nextIndex: index + 2 };

      if (index + 1 >= lines.length) {
        throw new RespSerializeError('Missing bulk string data', index);
      }

      return { value: lines[index + 1], nextIndex: index + 2 };
    }

    case RespType.Array: {
      const arrayLength = parseInt(content, 10);
      if (Number.isNaN(arrayLength)) {
        throw new RespSerializeError(`Invalid array length: ${content}`, index);
      }

      if (arrayLength === 0) return { value: [], nextIndex: index + 1 };

      const result: RespValue[] = [];
      let currentIndex = index + 1;

      for (let i = 0; i < arrayLength; i++) {
        try {
          const parsed = parseValue(lines, currentIndex);
          result.push(parsed.value);
          currentIndex = parsed.nextIndex;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new RespSerializeError(`Error parsing array element ${i}: ${errorMessage}`, currentIndex);
        }
      }

      return { value: result, nextIndex: currentIndex };
    }

    case RespType.Error:
      throw new Error(`Server error: ${content}`);

    default:
      return { value: content, nextIndex: index + 1 };
  }
};

export const formatResponse = (status: 'OK' | 'ERROR' | 'PONG' | 'DATA' | 'NULL',  data?: RespValue): string => {
  switch (status) {
    case 'OK':
      return OK_RESPONSE;
    case 'ERROR':
      return `${RespType.Error}ERROR ${data || 'Unknown error'}${CRLF}`;
    case 'PONG':
      return PONG_RESPONSE;
    case 'NULL':
      return NULL_BULK_STRING;
    case 'DATA':
      return data !== undefined ? serialize(data) : NULL_BULK_STRING;
    default:
      return data !== undefined ? serialize(data) : NULL_BULK_STRING;
  }
};
