/*
 * Original PDFKit jpeg.js
 * Translated to ts by Florian Plesker
 */

import { PDFReference } from '../../reference';
import { PDFDocument } from '../../document';

const MARKERS = [
  0xffc0, 0xffc1, 0xffc2, 0xffc3, 0xffc5, 0xffc6, 0xffc7, 0xffc8, 0xffc9,
  0xffca, 0xffcb, 0xffcc, 0xffcd, 0xffce, 0xffcf,
];

const COLOR_SPACE_MAP: { [key: number]: string } = {
  1: 'DeviceGray',
  3: 'DeviceRGB',
  4: 'DeviceCMYK',
};

export class JPEG {
  private _obj: PDFReference | null;
  private readonly _colorSpace: string;
  private readonly _width: number;
  private readonly _height: number;
  private _data: any;
  private _label: string;
  private readonly _bits: number[];

  constructor(data: any, label: string) {
    let marker;
    this._data = data;
    this._label = label;
    if (this._data.readUInt16BE(0) !== 0xffd8) {
      throw 'SOI not found in JPEG';
    }

    let pos = 2;
    while (pos < this._data.length) {
      marker = this._data.readUInt16BE(pos);
      pos += 2;
      if (MARKERS.includes(marker)) {
        break;
      }
      pos += this._data.readUInt16BE(pos);
    }

    if (!MARKERS.includes(marker)) {
      throw 'Invalid JPEG.';
    }
    pos += 2;

    this._bits = this._data[pos++];
    this._height = this._data.readUInt16BE(pos);
    pos += 2;

    this._width = this._data.readUInt16BE(pos);
    pos += 2;

    const channels = this._data[pos++];
    this._colorSpace = COLOR_SPACE_MAP[channels];

    this._obj = null;
  }

  embed(document: PDFDocument) {
    if (this._obj) {
      return;
    }

    this._obj = document.ref({
      Type: 'XObject',
      Subtype: 'Image',
      BitsPerComponent: this._bits,
      Width: this._width,
      Height: this._height,
      ColorSpace: this._colorSpace,
      Filter: 'DCTDecode',
    });

    // add extra decode params for CMYK images. By swapping the
    // min and max values from the default, we invert the colors. See
    // section 4.8.4 of the spec.
    if (this._colorSpace === 'DeviceCMYK') {
      this._obj.data.Decode = [1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
    }

    this._obj.end(this._data);

    // free memory
    return (this._data = null);
  }
}
