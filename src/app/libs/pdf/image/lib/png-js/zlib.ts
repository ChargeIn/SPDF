/*
 * Extracted from pdf.js
 * https://github.com/andreasgal/pdf.js
 *
 * Copyright (c) 2011 Mozilla Foundation
 * Translated to ts by Florian Plesker
 *
 * Contributors: Andreas Gal <gal@mozilla.com>
 *               Chris G Jones <cjones@mozilla.com>
 *               Shaon Barman <shaon.barman@gmail.com>
 *               Vivien Nicolas <21@vingtetun.org>
 *               Justin D'Arcangelo <justindarc@gmail.com>
 *               Yury Delendik
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */
import { Stream } from 'stream';

//  For easier use with type script the classes FlateStream and DecodeStream where merged
export class DecodeFlateStream {
  codeLenCodeMap = new Uint32Array([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
  ]);

  lengthDecode = new Uint32Array([
    0x00003, 0x00004, 0x00005, 0x00006, 0x00007, 0x00008, 0x00009, 0x0000a,
    0x1000b, 0x1000d, 0x1000f, 0x10011, 0x20013, 0x20017, 0x2001b, 0x2001f,
    0x30023, 0x3002b, 0x30033, 0x3003b, 0x40043, 0x40053, 0x40063, 0x40073,
    0x50083, 0x500a3, 0x500c3, 0x500e3, 0x00102, 0x00102, 0x00102,
  ]);

  distDecode = new Uint32Array([
    0x00001, 0x00002, 0x00003, 0x00004, 0x10005, 0x10007, 0x20009, 0x2000d,
    0x30011, 0x30019, 0x40021, 0x40031, 0x50041, 0x50061, 0x60081, 0x600c1,
    0x70101, 0x70181, 0x80201, 0x80301, 0x90401, 0x90601, 0xa0801, 0xa0c01,
    0xb1001, 0xb1801, 0xc2001, 0xc3001, 0xd4001, 0xd6001,
  ]);

  fixedLitCodeTab = [
    new Uint32Array([
      0x70100, 0x80050, 0x80010, 0x80118, 0x70110, 0x80070, 0x80030, 0x900c0,
      0x70108, 0x80060, 0x80020, 0x900a0, 0x80000, 0x80080, 0x80040, 0x900e0,
      0x70104, 0x80058, 0x80018, 0x90090, 0x70114, 0x80078, 0x80038, 0x900d0,
      0x7010c, 0x80068, 0x80028, 0x900b0, 0x80008, 0x80088, 0x80048, 0x900f0,
      0x70102, 0x80054, 0x80014, 0x8011c, 0x70112, 0x80074, 0x80034, 0x900c8,
      0x7010a, 0x80064, 0x80024, 0x900a8, 0x80004, 0x80084, 0x80044, 0x900e8,
      0x70106, 0x8005c, 0x8001c, 0x90098, 0x70116, 0x8007c, 0x8003c, 0x900d8,
      0x7010e, 0x8006c, 0x8002c, 0x900b8, 0x8000c, 0x8008c, 0x8004c, 0x900f8,
      0x70101, 0x80052, 0x80012, 0x8011a, 0x70111, 0x80072, 0x80032, 0x900c4,
      0x70109, 0x80062, 0x80022, 0x900a4, 0x80002, 0x80082, 0x80042, 0x900e4,
      0x70105, 0x8005a, 0x8001a, 0x90094, 0x70115, 0x8007a, 0x8003a, 0x900d4,
      0x7010d, 0x8006a, 0x8002a, 0x900b4, 0x8000a, 0x8008a, 0x8004a, 0x900f4,
      0x70103, 0x80056, 0x80016, 0x8011e, 0x70113, 0x80076, 0x80036, 0x900cc,
      0x7010b, 0x80066, 0x80026, 0x900ac, 0x80006, 0x80086, 0x80046, 0x900ec,
      0x70107, 0x8005e, 0x8001e, 0x9009c, 0x70117, 0x8007e, 0x8003e, 0x900dc,
      0x7010f, 0x8006e, 0x8002e, 0x900bc, 0x8000e, 0x8008e, 0x8004e, 0x900fc,
      0x70100, 0x80051, 0x80011, 0x80119, 0x70110, 0x80071, 0x80031, 0x900c2,
      0x70108, 0x80061, 0x80021, 0x900a2, 0x80001, 0x80081, 0x80041, 0x900e2,
      0x70104, 0x80059, 0x80019, 0x90092, 0x70114, 0x80079, 0x80039, 0x900d2,
      0x7010c, 0x80069, 0x80029, 0x900b2, 0x80009, 0x80089, 0x80049, 0x900f2,
      0x70102, 0x80055, 0x80015, 0x8011d, 0x70112, 0x80075, 0x80035, 0x900ca,
      0x7010a, 0x80065, 0x80025, 0x900aa, 0x80005, 0x80085, 0x80045, 0x900ea,
      0x70106, 0x8005d, 0x8001d, 0x9009a, 0x70116, 0x8007d, 0x8003d, 0x900da,
      0x7010e, 0x8006d, 0x8002d, 0x900ba, 0x8000d, 0x8008d, 0x8004d, 0x900fa,
      0x70101, 0x80053, 0x80013, 0x8011b, 0x70111, 0x80073, 0x80033, 0x900c6,
      0x70109, 0x80063, 0x80023, 0x900a6, 0x80003, 0x80083, 0x80043, 0x900e6,
      0x70105, 0x8005b, 0x8001b, 0x90096, 0x70115, 0x8007b, 0x8003b, 0x900d6,
      0x7010d, 0x8006b, 0x8002b, 0x900b6, 0x8000b, 0x8008b, 0x8004b, 0x900f6,
      0x70103, 0x80057, 0x80017, 0x8011f, 0x70113, 0x80077, 0x80037, 0x900ce,
      0x7010b, 0x80067, 0x80027, 0x900ae, 0x80007, 0x80087, 0x80047, 0x900ee,
      0x70107, 0x8005f, 0x8001f, 0x9009e, 0x70117, 0x8007f, 0x8003f, 0x900de,
      0x7010f, 0x8006f, 0x8002f, 0x900be, 0x8000f, 0x8008f, 0x8004f, 0x900fe,
      0x70100, 0x80050, 0x80010, 0x80118, 0x70110, 0x80070, 0x80030, 0x900c1,
      0x70108, 0x80060, 0x80020, 0x900a1, 0x80000, 0x80080, 0x80040, 0x900e1,
      0x70104, 0x80058, 0x80018, 0x90091, 0x70114, 0x80078, 0x80038, 0x900d1,
      0x7010c, 0x80068, 0x80028, 0x900b1, 0x80008, 0x80088, 0x80048, 0x900f1,
      0x70102, 0x80054, 0x80014, 0x8011c, 0x70112, 0x80074, 0x80034, 0x900c9,
      0x7010a, 0x80064, 0x80024, 0x900a9, 0x80004, 0x80084, 0x80044, 0x900e9,
      0x70106, 0x8005c, 0x8001c, 0x90099, 0x70116, 0x8007c, 0x8003c, 0x900d9,
      0x7010e, 0x8006c, 0x8002c, 0x900b9, 0x8000c, 0x8008c, 0x8004c, 0x900f9,
      0x70101, 0x80052, 0x80012, 0x8011a, 0x70111, 0x80072, 0x80032, 0x900c5,
      0x70109, 0x80062, 0x80022, 0x900a5, 0x80002, 0x80082, 0x80042, 0x900e5,
      0x70105, 0x8005a, 0x8001a, 0x90095, 0x70115, 0x8007a, 0x8003a, 0x900d5,
      0x7010d, 0x8006a, 0x8002a, 0x900b5, 0x8000a, 0x8008a, 0x8004a, 0x900f5,
      0x70103, 0x80056, 0x80016, 0x8011e, 0x70113, 0x80076, 0x80036, 0x900cd,
      0x7010b, 0x80066, 0x80026, 0x900ad, 0x80006, 0x80086, 0x80046, 0x900ed,
      0x70107, 0x8005e, 0x8001e, 0x9009d, 0x70117, 0x8007e, 0x8003e, 0x900dd,
      0x7010f, 0x8006e, 0x8002e, 0x900bd, 0x8000e, 0x8008e, 0x8004e, 0x900fd,
      0x70100, 0x80051, 0x80011, 0x80119, 0x70110, 0x80071, 0x80031, 0x900c3,
      0x70108, 0x80061, 0x80021, 0x900a3, 0x80001, 0x80081, 0x80041, 0x900e3,
      0x70104, 0x80059, 0x80019, 0x90093, 0x70114, 0x80079, 0x80039, 0x900d3,
      0x7010c, 0x80069, 0x80029, 0x900b3, 0x80009, 0x80089, 0x80049, 0x900f3,
      0x70102, 0x80055, 0x80015, 0x8011d, 0x70112, 0x80075, 0x80035, 0x900cb,
      0x7010a, 0x80065, 0x80025, 0x900ab, 0x80005, 0x80085, 0x80045, 0x900eb,
      0x70106, 0x8005d, 0x8001d, 0x9009b, 0x70116, 0x8007d, 0x8003d, 0x900db,
      0x7010e, 0x8006d, 0x8002d, 0x900bb, 0x8000d, 0x8008d, 0x8004d, 0x900fb,
      0x70101, 0x80053, 0x80013, 0x8011b, 0x70111, 0x80073, 0x80033, 0x900c7,
      0x70109, 0x80063, 0x80023, 0x900a7, 0x80003, 0x80083, 0x80043, 0x900e7,
      0x70105, 0x8005b, 0x8001b, 0x90097, 0x70115, 0x8007b, 0x8003b, 0x900d7,
      0x7010d, 0x8006b, 0x8002b, 0x900b7, 0x8000b, 0x8008b, 0x8004b, 0x900f7,
      0x70103, 0x80057, 0x80017, 0x8011f, 0x70113, 0x80077, 0x80037, 0x900cf,
      0x7010b, 0x80067, 0x80027, 0x900af, 0x80007, 0x80087, 0x80047, 0x900ef,
      0x70107, 0x8005f, 0x8001f, 0x9009f, 0x70117, 0x8007f, 0x8003f, 0x900df,
      0x7010f, 0x8006f, 0x8002f, 0x900bf, 0x8000f, 0x8008f, 0x8004f, 0x900ff,
    ]),
    9,
  ];

  fixedDistCodeTab = [
    new Uint32Array([
      0x50000, 0x50010, 0x50008, 0x50018, 0x50004, 0x50014, 0x5000c, 0x5001c,
      0x50002, 0x50012, 0x5000a, 0x5001a, 0x50006, 0x50016, 0x5000e, 0x00000,
      0x50001, 0x50011, 0x50009, 0x50019, 0x50005, 0x50015, 0x5000d, 0x5001d,
      0x50003, 0x50013, 0x5000b, 0x5001b, 0x50007, 0x50017, 0x5000f, 0x00000,
    ]),
    5,
  ];

  buffer: Uint8Array = null;
  private readonly _bytes: number[];
  private _bytesPos: number;
  private _codeSize: number;
  private _codeBuf: number;
  private _eof = false;
  private _bufferLength = 0;
  private _pos = 0;

  constructor(bytes) {
    //let bytes = stream.getBytes();
    let bytesPos = 0;

    const cmf = bytes[bytesPos++];
    const flg = bytes[bytesPos++];
    // eslint-disable-next-line eqeqeq
    if (cmf == -1 || flg == -1) {
      this.error('Invalid header in flate stream');
    }
    // eslint-disable-next-line eqeqeq
    if ((cmf & 0x0f) != 0x08) {
      this.error('Unknown compression method in flate stream');
    }
    // eslint-disable-next-line eqeqeq
    if (((cmf << 8) + flg) % 31 != 0) {
      this.error('Bad FCHECK in flate stream');
    }
    if (flg & 0x20) {
      this.error('FDICT bit set in flate stream');
    }

    this._bytes = bytes;
    this._bytesPos = bytesPos;

    this._codeSize = 0;
    this._codeBuf = 0;
  }

  error(e) {
    throw new Error(e);
  }

  getBits(bits) {
    let codeSize = this._codeSize;
    let codeBuf = this._codeBuf;
    const bytes = this._bytes;
    let bytesPos = this._bytesPos;

    let b;
    while (codeSize < bits) {
      if (typeof (b = bytes[bytesPos++]) == 'undefined') {
        this.error('Bad encoding in flate stream');
      }
      codeBuf |= b << codeSize;
      codeSize += 8;
    }
    b = codeBuf & ((1 << bits) - 1);
    this._codeBuf = codeBuf >> bits;
    this._codeSize = codeSize - bits;
    this._bytesPos = bytesPos;
    return b;
  }

  getCode(table) {
    const codes = table[0];
    const maxLen = table[1];
    let codeSize = this._codeSize;
    let codeBuf = this._codeBuf;
    const bytes = this._bytes;
    let bytesPos = this._bytesPos;

    while (codeSize < maxLen) {
      let b;
      if (typeof (b = bytes[bytesPos++]) == 'undefined') {
        this.error('Bad encoding in flate stream');
      }
      codeBuf |= b << codeSize;
      codeSize += 8;
    }
    const code = codes[codeBuf & ((1 << maxLen) - 1)];
    const codeLen = code >> 16;
    const codeVal = code & 0xffff;
    // eslint-disable-next-line eqeqeq
    if (codeSize == 0 || codeSize < codeLen || codeLen == 0) {
      this.error('Bad encoding in flate stream');
    }
    this._codeBuf = codeBuf >> codeLen;
    this._codeSize = codeSize - codeLen;
    this._bytesPos = bytesPos;
    return codeVal;
  }

  generateHuffmanTable(lengths) {
    const n = lengths.length;

    // find max code length
    let maxLen = 0;
    for (let i = 0; i < n; ++i) {
      if (lengths[i] > maxLen) {
        maxLen = lengths[i];
      }
    }

    // build the table
    const size = 1 << maxLen;
    const codes = new Uint32Array(size);
    for (
      let len = 1, code = 0, skip = 2;
      len <= maxLen;
      ++len, code <<= 1, skip <<= 1
    ) {
      for (let val = 0; val < n; ++val) {
        // eslint-disable-next-line eqeqeq
        if (lengths[val] == len) {
          // bit-reverse the code
          let code2 = 0;
          let t = code;
          for (let i = 0; i < len; ++i) {
            code2 = (code2 << 1) | (t & 1);
            t >>= 1;
          }

          // fill the table entries
          for (let i = code2; i < size; i += skip) {
            codes[i] = (len << 16) | val;
          }

          ++code;
        }
      }
    }

    return [codes, maxLen];
  }

  readBlock() {
    // read block header
    let hdr = this.getBits(3);
    if (hdr & 1) {
      this._eof = true;
    }
    hdr >>= 1;

    // eslint-disable-next-line eqeqeq
    if (hdr == 0) {
      // uncompressed block
      const bytes = this._bytes;
      let bytesPos = this._bytesPos;
      let b;

      if (typeof (b = bytes[bytesPos++]) == 'undefined') {
        this.error('Bad block header in flate stream');
      }
      let blockLen = b;
      if (typeof (b = bytes[bytesPos++]) == 'undefined') {
        this.error('Bad block header in flate stream');
      }
      blockLen |= b << 8;
      if (typeof (b = bytes[bytesPos++]) == 'undefined') {
        this.error('Bad block header in flate stream');
      }
      let check = b;
      if (typeof (b = bytes[bytesPos++]) == 'undefined') {
        this.error('Bad block header in flate stream');
      }
      check |= b << 8;
      // eslint-disable-next-line eqeqeq
      if (check != (~blockLen & 0xffff)) {
        this.error('Bad uncompressed block length in flate stream');
      }

      this._codeBuf = 0;
      this._codeSize = 0;

      const bufferLength = this._bufferLength;
      const buff = this.ensureBuffer(bufferLength + blockLen);
      const end = bufferLength + blockLen;
      this._bufferLength = end;
      for (let n = bufferLength; n < end; ++n) {
        if (typeof (b = bytes[bytesPos++]) == 'undefined') {
          this._eof = true;
          break;
        }
        buff[n] = b;
      }
      this._bytesPos = bytesPos;
      return;
    }

    let litCodeTable;
    let distCodeTable;
    // eslint-disable-next-line eqeqeq
    if (hdr == 1) {
      // compressed block, fixed codes
      litCodeTable = this.fixedLitCodeTab;
      distCodeTable = this.fixedDistCodeTab;
      // eslint-disable-next-line eqeqeq
    } else if (hdr == 2) {
      // compressed block, dynamic codes
      const numLitCodes = this.getBits(5) + 257;
      const numDistCodes = this.getBits(5) + 1;
      const numCodeLenCodes = this.getBits(4) + 4;

      // build the code lengths code table
      const codeLenCodeLengths = Array(this.codeLenCodeMap.length);
      let i = 0;
      while (i < numCodeLenCodes) {
        codeLenCodeLengths[this.codeLenCodeMap[i++]] = this.getBits(3);
      }
      const codeLenCodeTab = this.generateHuffmanTable(codeLenCodeLengths);

      // build the literal and distance code tables
      let len = 0;
      i = 0;
      const codes = numLitCodes + numDistCodes;
      const codeLengths = new Array(codes);
      while (i < codes) {
        const code = this.getCode(codeLenCodeTab);
        // eslint-disable-next-line eqeqeq
        if (code == 16) {
          let rep = this.getBits(2) + 3;
          while (rep-- > 0) {
            codeLengths[i++] = len;
          }
          // eslint-disable-next-line eqeqeq
        } else if (code == 17) {
          const what = (len = 0);
          let rep = this.getBits(3) + 3;
          while (rep-- > 0) {
            codeLengths[i++] = what;
          }
          // eslint-disable-next-line eqeqeq
        } else if (code == 18) {
          const what = (len = 0);
          let rep = this.getBits(7) + 11;
          while (rep-- > 0) {
            codeLengths[i++] = what;
          }
        } else {
          codeLengths[i++] = len = code;
        }
      }

      litCodeTable = this.generateHuffmanTable(
        codeLengths.slice(0, numLitCodes)
      );
      distCodeTable = this.generateHuffmanTable(
        codeLengths.slice(numLitCodes, codes)
      );
    } else {
      this.error('Unknown block type in flate stream');
    }

    let buffer = this.buffer;
    let limit = buffer ? buffer.length : 0;
    let pos = this._bufferLength;
    while (true) {
      let code1 = this.getCode(litCodeTable);
      if (code1 < 256) {
        if (pos + 1 >= limit) {
          buffer = this.ensureBuffer(pos + 1);
          limit = buffer.length;
        }
        buffer[pos++] = code1;
        continue;
      }
      // eslint-disable-next-line eqeqeq
      if (code1 == 256) {
        this._bufferLength = pos;
        return;
      }
      code1 -= 257;
      code1 = this.lengthDecode[code1];
      let code2 = code1 >> 16;
      if (code2 > 0) {
        code2 = this.getBits(code2);
      }
      const len = (code1 & 0xffff) + code2;
      code1 = this.getCode(distCodeTable);
      code1 = this.distDecode[code1];
      code2 = code1 >> 16;
      if (code2 > 0) {
        code2 = this.getBits(code2);
      }
      const dist = (code1 & 0xffff) + code2;
      if (pos + len >= limit) {
        buffer = this.ensureBuffer(pos + len);
        limit = buffer.length;
      }
      for (let k = 0; k < len; ++k, ++pos) {
        buffer[pos] = buffer[pos - dist];
      }
    }
  }

  ensureBuffer(requested) {
    const buffer = this.buffer;
    const current = buffer ? buffer.byteLength : 0;
    if (requested < current) {
      return buffer;
    }
    let size = 512;
    while (size < requested) {
      size <<= 1;
    }
    const buffer2 = new Uint8Array(size);
    for (let i = 0; i < current; ++i) {
      buffer2[i] = buffer[i];
    }
    return (this.buffer = buffer2);
  }

  getByte() {
    const pos = this._pos;
    while (this._bufferLength <= pos) {
      if (this._eof) {
        return null;
      }
      this.readBlock();
    }
    return this.buffer[this._pos++];
  }

  getBytes(length?: number) {
    const pos = this._pos;

    let end;
    if (length) {
      this.ensureBuffer(pos + length);
      end = pos + length;

      while (!this._eof && this._bufferLength < end) {
        this.readBlock();
      }

      const bufEnd = this._bufferLength;
      if (end > bufEnd) {
        end = bufEnd;
      }
    } else {
      while (!this._eof) {
        this.readBlock();
      }

      end = this._bufferLength;
    }

    this._pos = end;
    return this.buffer.subarray(pos, end);
  }

  lookChar() {
    const pos = this._pos;
    while (this._bufferLength <= pos) {
      if (this._eof) {
        return null;
      }
      this.readBlock();
    }
    return String.fromCharCode(this.buffer[this._pos]);
  }

  getChar() {
    const pos = this._pos;
    while (this._bufferLength <= pos) {
      if (this._eof) {
        return null;
      }
      this.readBlock();
    }
    return String.fromCharCode(this.buffer[this._pos++]);
  }

  makeSubStream(start, length, dict) {
    const end = start + length;
    while (this._bufferLength <= end && !this._eof) {
      this.readBlock();
    }
    // @ts-ignore
    return new Stream(this.buffer, start, length, dict);
  }

  skip(n) {
    if (!n) {
      n = 1;
    }
    this._pos += n;
  }

  reset() {
    this._pos = 0;
  }
}
