/*
 * PDFObject - converts JavaScript types into their corresponding PDF types.
 * By Devon Govett
 * Translated to ts by Florian Plesker
 */
import { PDFAbstractReference } from './reference';
import { PDFTree } from './trees';

const pad = (str: number, length: number) =>
  (Array(length + 1).join('0') + str).slice(-length);

const escapableRe = /[\n\r\t\b\f()\\]/g;
const escapable: { [key: string]: string } = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
  '\\': '\\\\',
  '(': '\\(',
  ')': '\\)',
};

// Convert little endian UTF-16 to big endian
const swapBytes = function (buff: Buffer) {
  const l = buff.length;
  if (l & 0x01) {
    throw new Error('Buffer length must be even');
  } else {
    for (let i = 0, end = l - 1; i < end; i += 2) {
      const a = buff[i];
      buff[i] = buff[i + 1];
      buff[i + 1] = a;
    }
  }

  return buff;
};

export class PDFObject {
  static convert(
    object: any,
    encryptFn: ((buff: Buffer) => Buffer) | null = null
  ): string | number {
    // String literals are converted to the PDF name type
    if (typeof object === 'string') {
      return `/${object}`;

      // String objects are converted to PDF strings (UTF-16)
    } else if (object instanceof String) {
      let str = object;
      // Detect if this is a unicode string
      let isUnicode = false;
      for (let i = 0, end = str.length; i < end; i++) {
        if (str.charCodeAt(i) > 0x7f) {
          isUnicode = true;
          break;
        }
      }

      // If so, encode it as big endian UTF-16
      let stringBuffer;
      if (isUnicode) {
        stringBuffer = swapBytes(Buffer.from(`\ufeff${str}`, 'utf16le'));
      } else {
        stringBuffer = Buffer.from(str.valueOf(), 'ascii');
      }

      // Encrypt the string when necessary
      if (encryptFn) {
        str = encryptFn(stringBuffer).toString('binary');
      } else {
        str = stringBuffer.toString('binary');
      }

      // Escape characters as required by the spec
      str = str.replace(escapableRe, (c) => escapable[c]);

      return `(${str})`;

      // Buffers are converted to PDF hex strings
    } else if (Buffer.isBuffer(object)) {
      return `<${object.toString('hex')}>`;
    } else if (
      object instanceof PDFAbstractReference ||
      object instanceof PDFTree
    ) {
      return object.toString();
    } else if (object instanceof Date) {
      let str =
        `D:${pad(object.getUTCFullYear(), 4)}` +
        pad(object.getUTCMonth() + 1, 2) +
        pad(object.getUTCDate(), 2) +
        pad(object.getUTCHours(), 2) +
        pad(object.getUTCMinutes(), 2) +
        pad(object.getUTCSeconds(), 2) +
        'Z';

      // Encrypt the string when necessary
      if (encryptFn) {
        str = encryptFn(Buffer.from(str, 'ascii')).toString('binary');

        // Escape characters as required by the spec
        str = str.replace(escapableRe, (c) => escapable[c]);
      }

      return `(${str})`;
    } else if (Array.isArray(object)) {
      const items: string = object
        .map((e) => PDFObject.convert(e, encryptFn))
        .join(' ');
      return `[${items}]`;
    } else if ({}.toString.call(object) === '[object Object]') {
      const out = ['<<'];
      // eslint-disable-next-line guard-for-in
      for (const key in object) {
        const val = object[key];
        out.push(`/${key} ${PDFObject.convert(val, encryptFn)}`);
      }

      out.push('>>');
      return out.join('\n');
    } else if (typeof object === 'number') {
      return PDFObject.number(object);
    } else {
      return `${object}`;
    }
  }

  // eslint-disable-next-line id-blacklist
  static number(n: number) {
    if (n > -1e21 && n < 1e21) {
      return Math.round(n * 1e6) / 1e6;
    }

    throw new Error(`unsupported number: ${n}`);
  }
}
