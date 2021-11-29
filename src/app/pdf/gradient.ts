/*
 * Copyright (c) by Florian Plesker
 */
import { PDFDocument } from './document';
import { PDFReference } from './reference';
import { PDFObject } from './object';

export abstract class PDFGradient {
  protected doc: any;
  private readonly stops: [number, number[] | string, number][];
  private embedded: boolean;
  private transform: number[];
  protected _colorSpace = '';
  private matrix: number[] = [];
  private id = '';

  constructor(doc: any) {
    this.doc = doc;
    this.stops = [];
    this.embedded = false;
    this.transform = [1, 0, 0, 0, 0];
  }

  stop(pos: number, color: number[] | string, opacity = 1) {
    color = this.doc._normalizeColor(color);

    if (this.stops.length === 0) {
      if (color.length === 3) {
        this._colorSpace = 'DeviceRGB';
      } else if (color.length === 4) {
        this._colorSpace = 'DeviceCMYK';
      } else if (color.length === 1) {
        this._colorSpace = 'DeviceGray';
      } else {
        throw new Error('Unknown color space');
      }
    } else if (
      (this._colorSpace === 'DeviceRGB' && color.length !== 3) ||
      (this._colorSpace === 'DeviceCMYK' && color.length !== 4) ||
      (this._colorSpace === 'DeviceGray' && color.length !== 1)
    ) {
      throw new Error('All gradient stops must use the same color space');
    }

    opacity = Math.max(0, Math.min(1, opacity));
    this.stops.push([pos, color, opacity]);
    return this;
  }

  setTransform(
    m11: number,
    m12: number,
    m21: number,
    m22: number,
    dx: number,
    dy: number
  ) {
    this.transform = [m11, m12, m21, m22, dx, dy];
    return this;
  }

  embed(m: number[]) {
    let fn;
    const stopsLength = this.stops.length;
    if (stopsLength === 0) {
      return;
    }
    this.embedded = true;
    this.matrix = m;

    // if the last stop comes before 100%, add a copy at 100%
    const last = this.stops[stopsLength - 1];
    if (last[0] < 1) {
      this.stops.push([1, last[1], last[2]]);
    }

    const bounds = [];
    const encode = [];
    const stops = [];

    for (let i = 0; i < stopsLength - 1; i++) {
      encode.push(0, 1);
      if (i + 2 !== stopsLength) {
        bounds.push(this.stops[i + 1][0]);
      }

      fn = this.doc.ref({
        FunctionType: 2,
        Domain: [0, 1],
        C0: this.stops[i + 0][1],
        C1: this.stops[i + 1][1],
        N: 1,
      });

      stops.push(fn);
      fn.end();
    }

    // if there are only two stops, we don't need a stitching function
    if (stopsLength === 1) {
      fn = stops[0];
    } else {
      fn = this.doc.ref({
        FunctionType: 3, // stitching function
        Domain: [0, 1],
        Functions: stops,
        Bounds: bounds,
        Encode: encode,
      });

      fn.end();
    }

    this.id = `Sh${++this.doc._gradCount}`;

    const shader = this.shader(fn);
    shader.end();

    const pattern = this.doc.ref({
      Type: 'Pattern',
      PatternType: 2,
      Shading: shader,
      Matrix: this.matrix.map(PDFObject.number),
    });

    pattern.end();

    if (this.stops.some((stop) => stop[2] < 1)) {
      let grad = this.opacityGradient();
      grad._colorSpace = 'DeviceGray';

      for (let stop of this.stops) {
        grad.stop(stop[0], [stop[2]]);
      }

      grad = grad.embed(this.matrix);

      const pageBBox = [0, 0, this.doc.page.width, this.doc.page.height];

      const form = this.doc.ref({
        Type: 'XObject',
        Subtype: 'Form',
        FormType: 1,
        BBox: pageBBox,
        Group: {
          Type: 'Group',
          S: 'Transparency',
          CS: 'DeviceGray',
        },
        Resources: {
          ProcSet: ['PDF', 'Text', 'ImageB', 'ImageC', 'ImageI'],
          Pattern: {
            Sh1: grad,
          },
        },
      });

      form.write('/Pattern cs /Sh1 scn');
      form.end(`${pageBBox.join(' ')} re f`);

      const gstate = this.doc.ref({
        Type: 'ExtGState',
        SMask: {
          Type: 'Mask',
          S: 'Luminosity',
          G: form,
        },
      });

      gstate.end();

      const opacityPattern = this.doc.ref({
        Type: 'Pattern',
        PatternType: 1,
        PaintType: 1,
        TilingType: 2,
        BBox: pageBBox,
        XStep: pageBBox[2],
        YStep: pageBBox[3],
        Resources: {
          ProcSet: ['PDF', 'Text', 'ImageB', 'ImageC', 'ImageI'],
          Pattern: {
            Sh1: pattern,
          },
          ExtGState: {
            Gs1: gstate,
          },
        },
      });

      opacityPattern.write('/Gs1 gs /Pattern cs /Sh1 scn');
      opacityPattern.end(`${pageBBox.join(' ')} re f`);

      this.doc.page.patterns[this.id] = opacityPattern;
    } else {
      this.doc.page.patterns[this.id] = pattern;
    }

    return pattern;
  }

  apply(stroke: boolean) {
    // apply gradient transform to existing document ctm
    const [m0, m1, m2, m3, m4, m5] = this.doc._ctm;
    const [m11, m12, m21, m22, dx, dy] = this.transform;
    const m = [
      m0 * m11 + m2 * m12,
      m1 * m11 + m3 * m12,
      m0 * m21 + m2 * m22,
      m1 * m21 + m3 * m22,
      m0 * dx + m2 * dy + m4,
      m1 * dx + m3 * dy + m5,
    ];

    if (!this.embedded || m.join(' ') !== this.matrix.join(' ')) {
      this.embed(m);
    }
    this.doc._setColorSpace('Pattern', stroke);
    const op = stroke ? 'SCN' : 'scn';
    return this.doc.addContent(`/${this.id} ${op}`);
  }

  abstract shader(fn: () => {}): PDFReference;

  abstract opacityGradient(): PDFGradient;
}

class PDFLinearGradient extends PDFGradient {
  private readonly x1: number;
  private readonly y1: number;
  private readonly x2: number;
  private readonly y2: number;

  constructor(
    doc: PDFDocument,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) {
    super(doc);
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
  }

  shader(fn: () => {}) {
    return this.doc.ref({
      ShadingType: 2,
      ColorSpace: this._colorSpace,
      Coords: [this.x1, this.y1, this.x2, this.y2],
      Function: fn,
      Extend: [true, true],
    });
  }

  opacityGradient() {
    return new PDFLinearGradient(this.doc, this.x1, this.y1, this.x2, this.y2);
  }
}

class PDFRadialGradient extends PDFGradient {
  private readonly x1: number;
  private readonly y1: number;
  private readonly x2: number;
  private readonly y2: number;
  private readonly r1: number;
  private readonly r2: number;

  constructor(
    doc: PDFDocument,
    x1: number,
    y1: number,
    r1: number,
    x2: number,
    y2: number,
    r2: number
  ) {
    super(doc);
    this.doc = doc;
    this.x1 = x1;
    this.y1 = y1;
    this.r1 = r1;
    this.x2 = x2;
    this.y2 = y2;
    this.r2 = r2;
  }

  shader(fn: () => {}) {
    return this.doc.ref({
      ShadingType: 3,
      ColorSpace: this._colorSpace,
      Coords: [this.x1, this.y1, this.r1, this.x2, this.y2, this.r2],
      Function: fn,
      Extend: [true, true],
    });
  }

  opacityGradient() {
    return new PDFRadialGradient(
      this.doc,
      this.x1,
      this.y1,
      this.r1,
      this.x2,
      this.y2,
      this.r2
    );
  }
}
