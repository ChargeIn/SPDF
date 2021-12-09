/*
 * Original PDFKit - standard.js
 * Translated to ts by Florian Plesker
 */
// This insanity is so bundlers can inline the font files
import { PDFFont } from '../font';
import * as fs from 'fs';
import { PDFDocument } from '../document';
import { AFMFont } from './afm';

const STANDARD_FONTS = {
  Courier() {
    return fs.readFileSync(__dirname + '/data/Courier.afm', 'utf8');
  },
  'Courier-Bold'() {
    return fs.readFileSync(__dirname + '/data/Courier-Bold.afm', 'utf8');
  },
  'Courier-Oblique'() {
    return fs.readFileSync(__dirname + '/data/Courier-Oblique.afm', 'utf8');
  },
  'Courier-BoldOblique'() {
    return fs.readFileSync(__dirname + '/data/Courier-BoldOblique.afm', 'utf8');
  },
  Helvetica() {
    return fs.readFileSync(__dirname + '/data/Helvetica.afm', 'utf8');
  },
  'Helvetica-Bold'() {
    return fs.readFileSync(__dirname + '/data/Helvetica-Bold.afm', 'utf8');
  },
  'Helvetica-Oblique'() {
    return fs.readFileSync(__dirname + '/data/Helvetica-Oblique.afm', 'utf8');
  },
  'Helvetica-BoldOblique'() {
    return fs.readFileSync(
      __dirname + '/data/Helvetica-BoldOblique.afm',
      'utf8'
    );
  },
  'Times-Roman'() {
    return fs.readFileSync(__dirname + '/data/Times-Roman.afm', 'utf8');
  },
  'Times-Bold'() {
    return fs.readFileSync(__dirname + '/data/Times-Bold.afm', 'utf8');
  },
  'Times-Italic'() {
    return fs.readFileSync(__dirname + '/data/Times-Italic.afm', 'utf8');
  },
  'Times-BoldItalic'() {
    return fs.readFileSync(__dirname + '/data/Times-BoldItalic.afm', 'utf8');
  },
  Symbol() {
    return fs.readFileSync(__dirname + '/data/Symbol.afm', 'utf8');
  },
  ZapfDingbats() {
    return fs.readFileSync(__dirname + '/data/ZapfDingbats.afm', 'utf8');
  },
};

export class StandardFont extends PDFFont {
  constructor(document: PDFDocument, name: string, id: number) {
    super();
    this.document = document;
    this.name = name;
    this.id = id;
    this.font = new AFMFont(STANDARD_FONTS[this.name]());
    ({
      ascender: this.ascender,
      descender: this.descender,
      bbox: this.bbox,
      lineGap: this.lineGap,
      xHeight: this.xHeight,
      capHeight: this.capHeight,
    } = this.font);
  }

  static isStandardFont(name: string) {
    return name in STANDARD_FONTS;
  }

  override embed() {
    this.dictionary.data = {
      Type: 'Font',
      BaseFont: this.name,
      Subtype: 'Type1',
      Encoding: 'WinAnsiEncoding',
    };

    return this.dictionary.end();
  }

  override encode(text: string) {
    const encoded = this.font.encodeText(text);
    const glyphs = this.font.glyphsForString(`${text}`);
    const advances = this.font.advancesForGlyphs(glyphs);
    const positions = [];
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i];
      positions.push({
        xAdvance: advances[i],
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
        advanceWidth: this.font.widthOfGlyph(glyph),
      });
    }

    return [encoded, positions];
  }

  override widthOfString(string: string, size: number) {
    const glyphs = this.font.glyphsForString(`${string}`);
    const advances = this.font.advancesForGlyphs(glyphs);

    let width = 0;
    for (let advance of advances) {
      width += advance;
    }

    const scale = size / 1000;
    return width * scale;
  }
}
