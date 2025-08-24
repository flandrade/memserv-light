/*
  RESP (Redis Serialization Protocol) - Ultra-simplified implementation
*/

export type RespValue = string | number | boolean | null | RespValue[];

const CRLF = '\r\n';

export const COMMON_RESP_VALUES = {
  OK: `+OK${CRLF}`,
  PONG: `+PONG${CRLF}`,
  NULL: `$-1${CRLF}`,
  ZERO: `:0${CRLF}`,
  ONE: `:1${CRLF}`,
  EMPTY_ARRAY: `*0${CRLF}`,
  // Common numbers
  NEG_ONE: `:-1${CRLF}`,
  FIVE: `:5${CRLF}`,
  // Common arrays
  SINGLE_ELEMENT_ARRAY_PREFIX: `*1${CRLF}`,
  TWO_ELEMENT_ARRAY_PREFIX: `*2${CRLF}`,
  THREE_ELEMENT_ARRAY_PREFIX: `*3${CRLF}`
};

export const serialize = (data: RespValue): string => {
  if (data === null) return COMMON_RESP_VALUES.NULL;

  const type = typeof data;
  if (type === 'string') {
    return `+${data}${CRLF}`;
  }

  if (type === 'number') {
    // Fast path for common numbers
    switch (data) {
      case 0: return COMMON_RESP_VALUES.ZERO;
      case 1: return COMMON_RESP_VALUES.ONE;
      case -1: return COMMON_RESP_VALUES.NEG_ONE;
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

const multiLineDeserialize = (lines: string[], index: number): { value: RespValue; nextIndex: number } => {
  const line = lines[index];
  const type = line[0];
  const content = line.slice(1);

  switch (type) {
    case '+': return { value: content, nextIndex: index + 1 };
    case ':': return { value: parseInt(content, 10), nextIndex: index + 1 };
    case '$': {
      const length = parseInt(content, 10);
      if (length === -1) return { value: null, nextIndex: index + 1 };
      if (length === 0) return { value: '', nextIndex: index + 2 };
      return { value: lines[index + 1], nextIndex: index + 2 };
    }
    case '*': {
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
      throw new Error(`Server error: ${content}`);
    default:
      return { value: content, nextIndex: index + 1 }; // Return as string for malformed input
  }
};

export const formatError = (data?: RespValue): string => {
  return `-ERROR ${data || 'Unknown error'}${CRLF}`;
};
