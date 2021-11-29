/*
PDFReference - represents a reference to another object in the PDF object heirarchy
By Devon Govett
Translated to ts by Florian Plesker
*/
import { PDFDocument } from './document';
import * as zlib from 'zlib';
import { PDFObject } from './object';

export class PDFAbstractReference {
  toString(): string {
    throw new Error('Must be implemented by subclasses');
  }
}

export class PDFReference extends PDFAbstractReference {
  id: number;
  document: PDFDocument;
  data: any;
  gen = 0;
  uncompressedLength = 0;
  buffer: Buffer[] = [];
  offset = 0;

  constructor(document: PDFDocument, id: number, data = {}) {
    super();
    this.document = document;
    this.id = id;
    this.data = data;
  }

  write(chunk: any) {
    if (!Buffer.isBuffer(chunk)) {
      chunk = Buffer.from(chunk + '\n', 'binary');
    }

    this.uncompressedLength += chunk.length;

    if (this.data.length === null) {
      this.data.length = 0;
    }

    this.buffer.push(chunk);
    this.data.length += chunk.length;

    if (this.document.compress) {
      return (this.data.Filter = 'FlateDecode');
    }

    return undefined;
  }

  end(chunk?: any) {
    if (chunk) {
      this.write(chunk);
    }

    return this.finalize();
  }

  finalize() {
    this.offset = this.document.offset;

    const encryptFn = this.document.security
      ? this.document.security.getEncryptFn(this.id, this.gen)
      : null;

    let fBuffer;

    if (this.buffer.length) {
      fBuffer = Buffer.concat(this.buffer);

      if (this.document.compress) {
        fBuffer = zlib.deflateSync(fBuffer);
      }

      if (encryptFn) {
        fBuffer = encryptFn(fBuffer);
      }

      this.data.length = this.buffer.length;

      this.document.write(`${this.id} ${this.gen} obj`);
      this.document.write(PDFObject.convert(this.data, encryptFn) as string);

      if (this.buffer.length) {
        this.document.write('stream');
        this.document.write(fBuffer);

        this.buffer = [];
        this.document.write('\nendstream');
      }

      this.document.write('endobj');
      this.document.refEnd(this);
    }
  }

  override toString() {
    return `${this.id} ${this.gen} R`;
  }
}
