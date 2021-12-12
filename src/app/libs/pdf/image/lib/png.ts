/*
 * Original PDFKit png.ts
 * Translated to ts by Florian Plesker
 */
import { PDFDocument } from '../../document';
import { PNG } from './png-js/png';
import { PDFReference } from '../../reference';
import * as zlib from 'zlib';

export class PNGImage {
  private _label: string;
  private _image: PNG;
  private readonly _width: number;
  private readonly _height: number;
  private _imgData: number[] | Uint8Array;
  private _obj: PDFReference | null;
  private _document: PDFDocument;
  private _alphaChannel: Buffer;

  constructor(data: any, label: string) {
    this._label = label;
    this._image = new PNG(data);
    this._width = this._image.width;
    this._height = this._image.height;
    this._imgData = this._image.imgData;
    this._obj = null;
  }

  embed(document) {
    let dataDecoded = false;

    this._document = document;
    if (this._obj) {
      return;
    }

    const hasAlphaChannel = this._image.hasAlphaChannel;
    const isInterlaced = this._image.interlaceMethod === 1;

    this._obj = this._document.ref({
      Type: 'XObject',
      Subtype: 'Image',
      BitsPerComponent: hasAlphaChannel ? 8 : this._image.bits,
      Width: this._width,
      Height: this._height,
      Filter: 'FlateDecode',
    });

    if (!hasAlphaChannel) {
      const params = this._document.ref({
        Predictor: isInterlaced ? 1 : 15,
        Colors: this._image.colors,
        BitsPerComponent: this._image.bits,
        Columns: this._width,
      });

      this._obj.data.DecodeParms = params;
      params.end();
    }

    if (this._image.palette.length === 0) {
      this._obj.data.ColorSpace = this._image.colorSpace;
    } else {
      // embed the color palette in the PDF as an object stream
      const palette = this._document.ref();
      palette.end(Buffer.from(this._image.palette));

      // build the color space array for the image
      this._obj.data.ColorSpace = [
        'Indexed',
        'DeviceRGB',
        this._image.palette.length / 3 - 1,
        palette,
      ];
    }

    // For PngJs color types 0, 2 and 3, the transparency data is stored in
    // a dedicated PngJs chunk.
    if (this._image.transparency.grayscale != null) {
      // Use Color Key Masking (spec section 4.8.5)
      // An array with N elements, where N is two times the number of color components.
      const val = this._image.transparency.grayscale;
      this._obj.data.Mask = [val, val];
    } else if (this._image.transparency.rgb) {
      // Use Color Key Masking (spec section 4.8.5)
      // An array with N elements, where N is two times the number of color components.
      const { rgb } = this._image.transparency;
      const mask = [];
      for (const x of rgb) {
        mask.push(x, x);
      }

      this._obj.data.Mask = mask;
    } else if (this._image.transparency.indexed) {
      // Create a transparency SMask for the image based on the data
      // in the PLTE and tRNS sections. See below for details on SMasks.
      dataDecoded = true;
      return this.loadIndexedAlphaChannel();
    } else if (hasAlphaChannel) {
      // For PngJs color types 4 and 6, the transparency data is stored as a alpha
      // channel mixed in with the main image data. Separate this data out into an
      // SMask object and store it separately in the PDF.
      dataDecoded = true;
      return this.splitAlphaChannel();
    }

    if (isInterlaced && !dataDecoded) {
      return this.decodeData();
    }

    this.finalize();
  }

  finalize() {
    if (this._alphaChannel) {
      const sMask = this._document.ref({
        Type: 'XObject',
        Subtype: 'Image',
        Height: this._height,
        Width: this._width,
        BitsPerComponent: 8,
        Filter: 'FlateDecode',
        ColorSpace: 'DeviceGray',
        Decode: [0, 1],
      });

      sMask.end(this._alphaChannel);
      this._obj.data.SMask = sMask;
    }

    // add the actual image data
    this._obj.end(this._imgData);

    // free memory
    this._image = null;
    return (this._imgData = null);
  }

  splitAlphaChannel() {
    return this._image.decodePixels((pixels) => {
      let a;
      let p;
      const colorCount = this._image.colors;
      const pixelCount = this._width * this._height;
      const imgData = Buffer.alloc(pixelCount * colorCount);
      const alphaChannel = Buffer.alloc(pixelCount);

      let i = (p = a = 0);
      const len = pixels.length;
      // For 16bit images copy only most significant byte (MSB) - PngJs data is always stored in network byte order (MSB first)
      const skipByteCount = this._image.bits === 16 ? 1 : 0;
      while (i < len) {
        for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
          imgData[p++] = pixels[i++];
          i += skipByteCount;
        }
        alphaChannel[a++] = pixels[i++];
        i += skipByteCount;
      }

      this._imgData = zlib.deflateSync(imgData);
      this._alphaChannel = zlib.deflateSync(alphaChannel);
      return this.finalize();
    });
  }

  loadIndexedAlphaChannel() {
    const transparency = this._image.transparency.indexed;
    return this._image.decodePixels((pixels) => {
      const alphaChannel = Buffer.alloc(this._width * this._height);

      let i = 0;
      for (let j = 0, end = pixels.length; j < end; j++) {
        alphaChannel[i++] = transparency[pixels[j]];
      }

      this._alphaChannel = zlib.deflateSync(alphaChannel);
      return this.finalize();
    });
  }

  decodeData() {
    this._image.decodePixels((pixels) => {
      this._imgData = zlib.deflateSync(pixels);
      this.finalize();
    });
  }
}
