/*
 * PDF tiling pattern support. Uncolored only.
 * Original: PDFKit -- pattern.js
 * Translated to ts by Florian Plesker
 */
import { PDFDocument } from './document';
import { PDFReference } from './reference';

const underlyingColorSpaces = ['DeviceCMYK', 'DeviceRGB'];

export class PDFTilingPattern {
  private _doc: PDFDocument;
  private readonly _bBox: [number, number, number, number];
  private readonly _xStep: number;
  private readonly _yStep: number;
  private readonly _stream: string;
  private _id?: string;
  private _pattern: PDFReference;

  constructor(
    doc: PDFDocument,
    bBox: [number, number, number, number],
    xStep: number,
    yStep: number,
    stream: string
  ) {
    this._doc = doc;
    this._bBox = bBox;
    this._xStep = xStep;
    this._yStep = yStep;
    this._stream = stream;
  }

  createPattern() {
    // no resources needed for our current usage
    // required entry
    const resources = this._doc.ref();
    resources.end();
    // apply default transform matrix (flipped in the default doc._ctm)
    // see document.js & gradient.js
    const [m0, m1, m2, m3, m4, m5] = this._doc.ctm;
    const [m11, m12, m21, m22, dx, dy] = [1, 0, 0, 1, 0, 0];
    const m = [
      m0 * m11 + m2 * m12,
      m1 * m11 + m3 * m12,
      m0 * m21 + m2 * m22,
      m1 * m21 + m3 * m22,
      m0 * dx + m2 * dy + m4,
      m1 * dx + m3 * dy + m5,
    ];
    const pattern = this._doc.ref({
      Type: 'Pattern',
      PatternType: 1, // tiling
      PaintType: 2, // 1-colored, 2-uncolored
      TilingType: 2, // 2-no distortion
      BBox: this._bBox,
      XStep: this._xStep,
      YStep: this._yStep,
      Matrix: m.map((v) => +v.toFixed(5)),
      Resources: resources,
    });
    pattern.end(this._stream);
    return pattern;
  }

  embedPatternColorSpaces() {
    // map each pattern to an underlying color space
    // and embed on each page
    underlyingColorSpaces.forEach((csName) => {
      const csId = this.getPatternColorSpaceId(csName);

      if (this._doc.page!.colorSpaces[csId]) {
        return;
      }
      const cs = this._doc.ref(['Pattern', csName]);
      cs.end();
      this._doc.page!.colorSpaces[csId] = cs;
    });
  }

  getPatternColorSpaceId(underlyingColorspace) {
    return `CsP${underlyingColorspace}`;
  }

  embed() {
    if (!this._id) {
      this._doc.patternCount = this._doc.patternCount + 1;
      this._id = 'P' + this._doc.patternCount;
      this._pattern = this.createPattern();
    }

    // patterns are embedded in each page
    if (!this._doc.page.patterns[this._id]) {
      this._doc.page.patterns[this._id] = this._pattern;
    }
  }

  apply(stroke: boolean, patternColor: number[]) {
    // do any embedding/creating that might be needed
    this.embedPatternColorSpaces();
    this.embed();

    const normalizedColor = this._doc.normalizeColor(patternColor);
    if (!normalizedColor) {
      throw Error(`invalid pattern color. (value: ${patternColor})`);
    }

    // select one of the pattern color spaces
    const csId = this.getPatternColorSpaceId(
      this._doc.getColorSpace(normalizedColor)
    );
    this._doc.setColorSpace(csId, stroke);

    // stroke/fill using the pattern and color (in the above underlying color space)
    const op = stroke ? 'SCN' : 'scn';
    return this._doc.addContent(
      `${normalizedColor.join(' ')} /${this._id} ${op}`
    );
  }
}
