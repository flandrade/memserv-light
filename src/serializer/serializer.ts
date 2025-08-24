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
  ONE: `:1${CRLF}`
};

export const serialize = (data: RespValue): string => {
  if (data === null) return COMMON_RESP_VALUES.NULL;
  const type = typeof data;
  switch (type) {
    case 'string': return `+${data}${CRLF}`;
    case 'number': return data === 0 ? `:0${CRLF}` : data === 1 ? `:1${CRLF}` : `:${data}${CRLF}`;
    case 'boolean': return data ? `:1${CRLF}` : `:0${CRLF}`;
    case 'object': {
      // Array
      if (Array.isArray(data)) {
        if (data.length === 0) return `*0${CRLF}`;
        let result = `*${data.length}${CRLF}`;
        for (const item of data) result += serialize(item);
        return result;
      }
      // Fallback for objects - serialize as bulk string
      const str = String(data);
      return `$${str.length}${CRLF}${str}${CRLF}`;
    }
    default: {
      // Handle any other types as bulk string
      const str = String(data);
      return `$${str.length}${CRLF}${str}${CRLF}`;
    }
  }
};

export const deserialize = (data: string): RespValue => {
  if (!data) throw new Error('Empty input data');

  // Fast path for single-line responses
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
        result.push(parsed.value);
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
