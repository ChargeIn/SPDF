/*
 * Original PDFKit - images.js
 * Translated to ts by Florian Plesker
 */
import { JPEG } from './image/lib/jpeg';
import { PNG } from './image/lib/png-js/png';
import { PNGImage } from './image/lib/png';
import { fs } from '../fs';

export class PDFImage {
  static open(src, label) {
    let data;
    if (Buffer.isBuffer(src)) {
      data = src;
    } else if (src instanceof ArrayBuffer) {
      data = Buffer.from(new Uint8Array(src));
    } else {
      let match;
      if ((match = /^data:.+;base64,(.*)$/.exec(src))) {
        data = Buffer.from(match[1], 'base64');
      } else {
        data = fs.readFileSync(src);
        if (!data) {
          return;
        }
      }
    }

    if (data[0] === 0xff && data[1] === 0xd8) {
      return new JPEG(data, label);
    } else if (data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG') {
      return new PNGImage(data, label);
    } else {
      throw new Error('Unknown image format.');
    }
  }
}
