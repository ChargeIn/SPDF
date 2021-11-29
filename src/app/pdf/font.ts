/*
 * Original PDFKit - font.js/font_factory.js
 * Translated to ts by Florian Plesker
 */
import fs from 'fs';
import fontkit from 'fontkit';
import { PDFReference } from './reference';
import { PDFDocument } from './document';
import { StandardFont } from './font/standard';
import { EmbeddedFont } from './font/embedded';

export class PDFFont {
  private dictionary: PDFReference;
  private document: PDFDocument;
  private embedded: boolean;
  private lineGap: number;
  private ascender: number;
  private descender: number;
  constructor() {}

  encode() {
    throw new Error('Must be implemented by subclasses');
  }

  widthOfString() {
    throw new Error('Must be implemented by subclasses');
  }

  ref() {
    return this.dictionary != null
      ? this.dictionary
      : (this.dictionary = this.document.ref());
  }

  finalize() {
    if (this.embedded || this.dictionary == null) {
      return;
    }

    this.embed();
    return (this.embedded = true);
  }

  embed() {
    throw new Error('Must be implemented by subclasses');
  }

  lineHeight(size, includeGap) {
    if (includeGap == null) {
      includeGap = false;
    }
    const gap = includeGap ? this.lineGap : 0;
    return ((this.ascender + gap - this.descender) / 1000) * size;
  }
}

export class PDFFontFactory {
  static open(document, src, family, id) {
    let font;
    if (typeof src === 'string') {
      if (StandardFont.isStandardFont(src)) {
        return new StandardFont(document, src, id);
      }

      src = fs.readFileSync(src);
    }
    if (Buffer.isBuffer(src)) {
      font = fontkit.create(src, family);
    } else if (src instanceof Uint8Array) {
      font = fontkit.create(Buffer.from(src), family);
    } else if (src instanceof ArrayBuffer) {
      font = fontkit.create(Buffer.from(new Uint8Array(src)), family);
    }

    if (font == null) {
      throw new Error('Not a supported font format or standard PDF font.');
    }

    return new EmbeddedFont(document, font, id);
  }
}
