/*
  RESP (Redis Serialization Protocol)
  https://redis.io/docs/latest/develop/reference/protocol-spec/
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

export const serialize = (data: RespValue): string => {
  if (data === null) return NULL_BULK_STRING;

  switch (typeof data) {
    case 'string':
      return `${RespType.SimpleString}${data}${CRLF}`;
    case 'number':
      if (!Number.isInteger(data)) {
        throw new RespSerializeError('RESP only supports integers', data);
      }
      return `${RespType.Integer}${data}${CRLF}`;
    case 'boolean':
      return `${RespType.Integer}${data ? 1 : 0}${CRLF}`;
  }

  if (Array.isArray(data)) {
    const parts = [`${RespType.Array}${data.length}${CRLF}`];
    for (const item of data) {
      parts.push(serialize(item));
    }
    return parts.join('');
  }

  // Fallback to bulk string
  const str = String(data);
  return `${RespType.BulkString}${str.length}${CRLF}${str}${CRLF}`;
};

export const deserialize = (data: string): RespValue => {
  if (!data || data.length === 0) {
    throw new RespSerializeError('Empty input data');
  }

  const lines = data.split(CRLF);
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

export const formatResponse = (status: 'OK' | 'ERROR' | 'DATA', data?: RespValue): string => {
  switch (status) {
    case 'OK':
      return `${RespType.SimpleString}OK${CRLF}`;
    case 'ERROR':
      return `${RespType.Error}ERROR ${data || 'Unknown error'}${CRLF}`;
    case 'DATA':
      return data !== undefined ? serialize(data) : NULL_BULK_STRING;
    default:
      return data !== undefined ? serialize(data) : NULL_BULK_STRING;
  }
};