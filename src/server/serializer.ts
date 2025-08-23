/*
  RESP (Redis Serialization Protocol)
  https://redis.io/docs/latest/develop/reference/protocol-spec/

  RESP is a simple protocol for serializing and deserializing data.
  This implementation follows RESP2 specification:

    Simple strings: +<string>\r\n (for status replies like +OK)
    Errors: -<error message>\r\n
    Integers: :<integer>\r\n
    Bulk strings: $<length>\r\n<string>\r\n (for regular strings and binary data)
    Arrays: *<length>\r\n<element1><element2>...<elementN>
    Null: $-1\r\n

  All parts of the protocol are terminated with "\r\n" (CRLF).
  Strings are represented as bulk strings for RESP compliance.
*/

const CRLF = '\r\n';

export const serialize = (data: unknown): string => {
  // Null values are represented as $-1<CRLF>
  if (data === null) return `$-1${CRLF}`;
  // Simple strings are represented as +<string><CRLF>
  if (typeof data === 'string') return `+${data}${CRLF}`;
  // Integers are represented as :<integer><CRLF>
  if (typeof data === 'number') return `:${data}${CRLF}`;
  // Booleans are represented as integers :<0 or :1><CRLF> for RESP2 compatibility
  if (typeof data === 'boolean') return data ? `:1${CRLF}` : `:0${CRLF}`;
  // Arrays are represented as *<length><CRLF><element1><element2>...<elementN>
  if (Array.isArray(data)) {
    return `*${data.length}${CRLF}${data.map(serialize).join('')}`;
  }

  // Bulk strings are represented as $<length><CRLF><string><CRLF>
  const str = String(data);
  return `$${str.length}${CRLF}${str}${CRLF}`;
};

export const deserialize = (data: string): unknown => {
  // Don't filter empty lines as they might be valid empty bulk strings
  const lines = data.split(CRLF);
  return parseValue(lines, 0).value;
};

const parseValue = (lines: string[], index: number): { value: unknown; nextIndex: number } => {
  if (index >= lines.length) return { value: null, nextIndex: index };

  const line = lines[index];
  const type = line[0];
  const content = line.slice(1);

  switch (type) {
    // Simple strings are represented as +<string><CRLF>
    case '+':
        return { value: content, nextIndex: index + 1 };

    // Integers are represented as :<integer><CRLF>
    case ':':
      return { value: parseInt(content), nextIndex: index + 1 };

    // Bulk strings are represented as $<length><CRLF><string><CRLF>
    case '$': {
      const length = parseInt(content);
      if (length === -1) return { value: null, nextIndex: index + 1 };
      if (length === 0) return { value: '', nextIndex: index + 2 }; // Handle empty strings correctly
      if (index + 1 >= lines.length) return { value: null, nextIndex: index + 1 };
      return { value: lines[index + 1], nextIndex: index + 2 };
    }

    // Arrays are represented as *<length><CRLF><data><CRLF>
    case '*': {
      const arrayLength = parseInt(content);
      const result = [];
      let currentIndex = index + 1;

      for (let i = 0; i < arrayLength; i++) {
        const parsed = parseValue(lines, currentIndex);
        result.push(parsed.value);
        currentIndex = parsed.nextIndex;
      }

      return { value: result, nextIndex: currentIndex };
    }

    // Errors are represented as -<error message><CRLF>
    case '-':
      throw new Error(content);

    // Default case is a simple string
    default:
      return { value: content, nextIndex: index + 1 };
  }
};

export const formatResponse = (status: string, data?: unknown): string => {
  if (status === 'OK') return `+OK${CRLF}`;
  if (status === 'ERROR') return `-ERROR ${data || 'Unknown error'}${CRLF}`;
  return serialize(data);
};
