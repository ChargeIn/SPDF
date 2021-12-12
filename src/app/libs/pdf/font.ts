/*
 * Original PDFKit - font.js/font_factory.js
 * Translated to ts by Florian Plesker
 */
import fontkit, { Font } from 'fontkit';
import { PDFReference } from './reference';
import { PDFDocument } from './document';
import { StandardFont } from './font/standard';
import { EmbeddedFont } from './font/embedded';
import { FontGlyphPosition } from './types';
import { fs } from '../fs';

export abstract class PDFFont {
  ascender: number;
  descender: number;
  id: string;
  name: string;
  xHeight: number;
  lineGap: number;
  capHeight: number;
  dictionary: PDFReference;
  protected document: PDFDocument;
  private _embedded: boolean;

  ref() {
    return this.dictionary != null
      ? this.dictionary
      : (this.dictionary = this.document.ref());
  }

  finalize() {
    if (this._embedded || this.dictionary == null) {
      return;
    }

    this.embed();
    return (this._embedded = true);
  }

  lineHeight(size, includeGap) {
    if (includeGap == null) {
      includeGap = false;
    }
    const gap = includeGap ? this.lineGap : 0;
    return ((this.ascender + gap - this.descender) / 1000) * size;
  }

  encode(text: string, features?: string[]): [string[], FontGlyphPosition[]] {
    throw new Error('Must be implemented by subclasses');
  }

  widthOfString(str: string, size: number, features?: string[]): number {
    throw new Error('Must be implemented by subclasses');
  }

  embed(): void {
    throw new Error('Must be implemented by subclasses');
  }
}

export class PDFFontFactory {
  static open(document, src, family, id) {
    let font: Font;
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
