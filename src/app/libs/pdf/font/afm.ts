/*
 * Original PDFKit - afm.js
 * Translated to ts by Florian Plesker
 */
import { fs } from '../../fs';

const WIN_ANSI_MAP = {
  402: 131,
  8211: 150,
  8212: 151,
  8216: 145,
  8217: 146,
  8218: 130,
  8220: 147,
  8221: 148,
  8222: 132,
  8224: 134,
  8225: 135,
  8226: 149,
  8230: 133,
  8364: 128,
  8240: 137,
  8249: 139,
  8250: 155,
  710: 136,
  8482: 153,
  338: 140,
  339: 156,
  732: 152,
  352: 138,
  353: 154,
  376: 159,
  381: 142,
  382: 158,
};

const characters = `\
.notdef       .notdef        .notdef        .notdef
.notdef       .notdef        .notdef        .notdef
.notdef       .notdef        .notdef        .notdef
.notdef       .notdef        .notdef        .notdef
.notdef       .notdef        .notdef        .notdef
.notdef       .notdef        .notdef        .notdef
.notdef       .notdef        .notdef        .notdef
.notdef       .notdef        .notdef        .notdef
  
space         exclam         quotedbl       numbersign
dollar        percent        ampersand      quotesingle
parenleft     parenright     asterisk       plus
comma         hyphen         period         slash
zero          one            two            three
four          five           six            seven
eight         nine           colon          semicolon
less          equal          greater        question
  
at            A              B              C
D             E              F              G
H             I              J              K
L             M              N              O
P             Q              R              S
T             U              V              W
X             Y              Z              bracketleft
backslash     bracketright   asciicircum    underscore
  
grave         a              b              c
d             e              f              g
h             i              j              k
l             m              n              o
p             q              r              s
t             u              v              w
x             y              z              braceleft
bar           braceright     asciitilde     .notdef
  
Euro          .notdef        quotesinglbase florin
quotedblbase  ellipsis       dagger         daggerdbl
circumflex    perthousand    Scaron         guilsinglleft
OE            .notdef        Zcaron         .notdef
.notdef       quoteleft      quoteright     quotedblleft
quotedblright bullet         endash         emdash
tilde         trademark      scaron         guilsinglright
oe            .notdef        zcaron         ydieresis
  
space         exclamdown     cent           sterling
currency      yen            brokenbar      section
dieresis      copyright      ordfeminine    guillemotleft
logicalnot    hyphen         registered     macron
degree        plusminus      twosuperior    threesuperior
acute         mu             paragraph      periodcentered
cedilla       onesuperior    ordmasculine   guillemotright
onequarter    onehalf        threequarters  questiondown
  
Agrave        Aacute         Acircumflex    Atilde
Adieresis     Aring          AE             Ccedilla
Egrave        Eacute         Ecircumflex    Edieresis
Igrave        Iacute         Icircumflex    Idieresis
Eth           Ntilde         Ograve         Oacute
Ocircumflex   Otilde         Odieresis      multiply
Oslash        Ugrave         Uacute         Ucircumflex
Udieresis     Yacute         Thorn          germandbls
  
agrave        aacute         acircumflex    atilde
adieresis     aring          ae             ccedilla
egrave        eacute         ecircumflex    edieresis
igrave        iacute         icircumflex    idieresis
eth           ntilde         ograve         oacute
ocircumflex   otilde         odieresis      divide
oslash        ugrave         uacute         ucircumflex
udieresis     yacute         thorn          ydieresis\
`.split(/\s+/);

export class AFMFont {
  bbox: number[];
  ascender: number;
  descender: number;
  xHeight: number;
  capHeight: number;
  lineGap: number;

  private _contents: string;
  private _attributes: {
    FontBBox?: string;
    Ascender?: number;
    Descender?: number;
    XHeight?: number;
    CapHeight?: number;
  };
  private _glyphWidths: { [key: string]: number };
  private _boundingBoxes: { [key: string]: number };
  private _kernPairs: { [key: string]: number };
  private _charWidths: number[];

  constructor(contents: string) {
    this._contents = contents;
    this._attributes = {};
    this._glyphWidths = {};
    this._boundingBoxes = {};
    this._kernPairs = {};

    this.parse();
    // todo: remove charWidths since appears to not be used
    this._charWidths = new Array(256);
    for (let char = 0; char <= 255; char++) {
      this._charWidths[char] = this._glyphWidths[characters[char]];
    }

    this.bbox = this._attributes.FontBBox.split(/\s+/).map((e) => +e);
    this.ascender = +(this._attributes.Ascender || 0);
    this.descender = +(this._attributes.Descender || 0);
    this.xHeight = +(this._attributes.XHeight || 0);
    this.capHeight = +(this._attributes.CapHeight || 0);
    this.lineGap =
      this.bbox[3] - this.bbox[1] - (this.ascender - this.descender);
  }

  static open(filename: string) {
    return new AFMFont(fs.readFileSync(filename, 'utf8'));
  }

  parse() {
    let section = '';
    for (const line of this._contents.split('\n')) {
      let match;
      let a;
      if ((match = line.match(/^Start(\w+)/))) {
        section = match[1];
        continue;
      } else if ((match = line.match(/^End(\w+)/))) {
        section = '';
        continue;
      }

      switch (section) {
        case 'FontMetrics':
          match = line.match(/(^\w+)\s+(.*)/);
          const key = match[1];
          const value = match[2];

          if ((a = this._attributes[key])) {
            if (!Array.isArray(a)) {
              a = this._attributes[key] = [a];
            }
            a.push(value);
          } else {
            this._attributes[key] = value;
          }
          break;

        case 'CharMetrics':
          if (!/^CH?\s/.test(line)) {
            continue;
          }
          const name = line.match(/\bN\s+(\.?\w+)\s*;/)[1];
          this._glyphWidths[name] = +line.match(/\bWX\s+(\d+)\s*;/)[1];
          break;

        case 'KernPairs':
          match = line.match(/^KPX\s+(\.?\w+)\s+(\.?\w+)\s+(-?\d+)/);
          if (match) {
            this._kernPairs[match[1] + '\0' + match[2]] = parseInt(match[3]);
          }
          break;
      }
    }
  }

  encodeText(text): string[] {
    const res: string[] = [];
    for (let i = 0, len = text.length; i < len; i++) {
      let char = text.charCodeAt(i);
      char = WIN_ANSI_MAP[char] || char;
      res.push(char.toString(16));
    }

    return res;
  }

  glyphsForString(str: string) {
    const glyphs = [];

    for (let i = 0, len = str.length; i < len; i++) {
      const charCode = str.charCodeAt(i);
      glyphs.push(this.characterToGlyph(charCode));
    }

    return glyphs;
  }

  characterToGlyph(character) {
    return characters[WIN_ANSI_MAP[character] || character] || '.notdef';
  }

  widthOfGlyph(glyph) {
    return this._glyphWidths[glyph] || 0;
  }

  getKernPair(left, right) {
    return this._kernPairs[left + '\0' + right] || 0;
  }

  advancesForGlyphs(glyphs) {
    const advances = [];

    for (let index = 0; index < glyphs.length; index++) {
      const left = glyphs[index];
      const right = glyphs[index + 1];
      advances.push(this.widthOfGlyph(left) + this.getKernPair(left, right));
    }

    return advances;
  }
}
