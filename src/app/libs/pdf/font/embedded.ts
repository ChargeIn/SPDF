/*
 * Original PDFKit - embedded.js
 * Translated to ts by Florian Plesker
 */
import { PDFFont } from '../font';
import { PDFDocument } from '../document';
import { BBOX, Font, GlyphPosition } from 'fontkit';
import { DescFontRefData, FontGlyphPosition } from '../types';

const toHex = function (num: number) {
  return `0000${num.toString(16)}`.slice(-4);
};

export class EmbeddedFont extends PDFFont {
  bbox: BBOX;
  font: Font;
  private _subset: any;
  private readonly _scale: number;
  private readonly _widths: number[];
  private readonly _unicode: number[][];
  private readonly _layoutCache: any;

  constructor(document: PDFDocument, font: Font, id: string) {
    super();
    this.document = document;
    this.font = font;
    this.id = id;
    // @ts-ignore (Font is more general than TTFFont -> missing create Subset)
    this._subset = this.font.createSubset();
    this._unicode = [[0]];
    // @ts-ignore
    this._widths = [this.font.getGlyph(0).advanceWidth];

    this.name = this.font.postscriptName;
    this._scale = 1000 / this.font.unitsPerEm;
    this.ascender = this.font.ascent * this._scale;
    this.descender = this.font.descent * this._scale;
    this.xHeight = this.font.xHeight * this._scale;
    this.capHeight = this.font.capHeight * this._scale;
    this.lineGap = this.font.lineGap * this._scale;
    this.bbox = this.font.bbox;

    if (document.options.fontLayoutCache !== false) {
      this._layoutCache = Object.create(null);
    }
  }

  layoutRun(text: string, features?: string[]) {
    const run = this.font.layout(text, features);

    // Normalize position values
    for (let i = 0; i < run.positions.length; i++) {
      const position = run.positions[i];
      for (const key in position) {
        position[key] *= this._scale;
      }

      // @ts-ignore
      position.advanceWidth = run.glyphs[i].advanceWidth * this._scale;
    }

    return run;
  }

  layoutCached(text) {
    if (!this._layoutCache) {
      return this.layoutRun(text);
    }
    let cached;
    if ((cached = this._layoutCache[text])) {
      return cached;
    }

    const run = this.layoutRun(text);
    this._layoutCache[text] = run;
    return run;
  }

  layout(text, features, onlyWidth?: boolean) {
    // Skip the cache if any user defined features are applied
    if (features) {
      return this.layoutRun(text, features);
    }

    let glyphs = onlyWidth ? null : [];
    let positions: GlyphPosition[] = onlyWidth ? null : [];
    let advanceWidth = 0;

    // Split the string by words to increase cache efficiency.
    // For this purpose, spaces and tabs are a good enough delimiter.
    let last = 0;
    let index = 0;
    while (index <= text.length) {
      let needle;
      if (
        (index === text.length && last < index) ||
        ((needle = text.charAt(index)), [' ', '\t'].includes(needle))
      ) {
        const run = this.layoutCached(text.slice(last, ++index));
        if (!onlyWidth) {
          glyphs = glyphs.concat(run.glyphs);
          positions = positions.concat(run.positions);
        }

        advanceWidth += run.advanceWidth;
        last = index;
      } else {
        index++;
      }
    }

    return { glyphs, positions, advanceWidth };
  }

  override encode(text: string, features?: string[]) {
    const { glyphs, positions } = this.layout(text, features);

    const res: string[] = [];
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i];
      const gid = this._subset.includeGlyph(glyph.id);
      res.push(`0000${gid.toString(16)}`.slice(-4));

      if (this._widths[gid] == null) {
        this._widths[gid] = glyph.advanceWidth * this._scale;
      }
      if (this._unicode[gid] == null) {
        this._unicode[gid] = glyph.codePoints;
      }
    }
    const result: [string[], FontGlyphPosition[]] = [res, positions];
    return result;
  }

  override widthOfString(str: string, size: number, features?: string[]) {
    const width = this.layout(str, features, true).advanceWidth;
    const scale = size / 1000;
    return width * scale;
  }

  override embed() {
    const isCFF = this._subset.cff != null;
    const fontFile = this.document.ref();

    if (isCFF) {
      fontFile.data.Subtype = 'CIDFontType0C';
    }

    this._subset
      .encodeStream()
      .on('data', (data) => fontFile.write(data))
      .on('end', () => fontFile.end());

    const familyClass =
      ((this.font['OS/2'] != null
        ? this.font['OS/2'].sFamilyClass
        : undefined) || 0) >> 8;
    let flags = 0;
    // @ts-ignore
    if (this.font.post.isFixedPitch) {
      flags |= 1 << 0;
    }
    if (1 <= familyClass && familyClass <= 7) {
      flags |= 1 << 1;
    }
    flags |= 1 << 2; // assume the font uses non-latin characters
    if (familyClass === 10) {
      flags |= 1 << 3;
    }
    // @ts-ignore
    if (this.font.head.macStyle.italic) {
      flags |= 1 << 6;
    }

    // generate a tag (6 uppercase letters. 17 is the char code offset from '0' to 'A'. 73 will map to 'Z')
    const tag = [1, 2, 3, 4, 5, 6]
      .map((i) => String.fromCharCode((this.id.charCodeAt(i) || 73) + 17))
      .join('');
    const name = tag + '+' + this.font.postscriptName;

    const { bbox } = this.font;
    const descriptor = this.document.ref({
      Type: 'FontDescriptor',
      FontName: name,
      Flags: flags,
      FontBBox: [
        bbox.minX * this._scale,
        bbox.minY * this._scale,
        bbox.maxX * this._scale,
        bbox.maxY * this._scale,
      ],
      ItalicAngle: this.font.italicAngle,
      Ascent: this.ascender,
      Descent: this.descender,
      CapHeight: (this.font.capHeight || this.font.ascent) * this._scale,
      XHeight: (this.font.xHeight || 0) * this._scale,
      StemV: 0,
    }); // not sure how to calculate this

    if (isCFF) {
      descriptor.data.FontFile3 = fontFile;
    } else {
      descriptor.data.FontFile2 = fontFile;
    }

    descriptor.end();

    const descendantFontData: DescFontRefData = {
      Type: 'Font',
      Subtype: 'CIDFontType0',
      BaseFont: name,
      CIDSystemInfo: {
        Registry: String('Adobe'),
        Ordering: String('Identity'),
        Supplement: 0,
      },
      FontDescriptor: descriptor,
      W: [0, this._widths],
    };

    if (!isCFF) {
      descendantFontData.Subtype = 'CIDFontType2';
      descendantFontData.CIDToGIDMap = 'Identity';
    }

    const descendantFont = this.document.ref(descendantFontData);

    descendantFont.end();

    this.dictionary.data = {
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: name,
      Encoding: 'Identity-H',
      DescendantFonts: [descendantFont],
      ToUnicode: this.toUnicodeCmap(),
    };

    return this.dictionary.end();
  }

  // Maps the glyph ids encoded in the PDF back to unicode strings
  // Because of ligature substitutions and the like, there may be one or more
  // unicode characters represented by each glyph.
  toUnicodeCmap() {
    const cmap = this.document.ref();

    const entries = [];
    for (const codePoints of this._unicode) {
      const encoded = [];

      // encode codePoints to utf16
      for (let value of codePoints) {
        if (value > 0xffff) {
          value -= 0x10000;
          encoded.push(toHex(((value >>> 10) & 0x3ff) | 0xd800));
          value = 0xdc00 | (value & 0x3ff);
        }

        encoded.push(toHex(value));
      }

      entries.push(`<${encoded.join(' ')}>`);
    }

    cmap.end(`\
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo <<
  /Registry (Adobe)
  /Ordering (UCS)
  /Supplement 0
>> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000><ffff>
endcodespacerange
1 beginbfrange
<0000> <${toHex(entries.length - 1)}> [${entries.join(' ')}]
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end\
`);

    return cmap;
  }
}
