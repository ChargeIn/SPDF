/*
PDFDocument - represents an entire PDF document
By Devon Govett
Translated to ts by Florian Plesker
*/
import * as stream from 'stream';
import { PDFReference } from './reference';
import { PDFNameTree } from './trees';
import { PDFSecurity } from './security';
import { PDFInfo, PDFOptions } from './types';
import { PDFPage } from './page';
import { namedColors } from './mixins/color';
import { _CAP_STYLES, _JOIN_STYLES, KAPPA } from './mixins/vector';
import { PDFObject } from './object';
import { PDFGradient } from './gradient';
import { SVGPath } from './path';
import * as fs from 'fs';
import { FIELD_FLAGS, FIELD_JUSTIFY, VALUE_MAP } from './mixins/acroform';

const { number } = PDFObject;

export class PDFDocument extends stream.Readable {
  options: PDFOptions;
  compress: boolean;
  offset = 0;
  security: any;
  info: PDFInfo;
  id: Buffer;
  ctm: number[] = [];
  page: PDFPage | null = null;

  root: PDFReference;
  readonly version: number;
  private _pageBuffer: PDFPage[] = [];
  private _pageBufferStart = 0;
  private _offsets: (number | null)[] = [];
  private _waiting: number;
  private _ended: boolean;
  private x: number = 0;
  private y: number = 0;

  constructor(options: PDFOptions = {}) {
    super(options);

    this.options = options;

    // PDF version
    switch (options.pdfVersion) {
      case '1.4':
        this.version = 1.4;
        break;
      case '1.5':
        this.version = 1.5;
        break;
      case '1.6':
        this.version = 1.6;
        break;
      case '1.7':
      case '1.7ext3':
        this.version = 1.7;
        break;
      default:
        this.version = 1.3;
        break;
    }

    // Whether streams should be compressed
    this.compress = this.options.compress ?? true;

    this._pageBuffer = [];
    this._pageBufferStart = 0;

    // The PDF object store
    this._offsets = [];
    this._waiting = 0;
    this._ended = false;
    this.offset = 0;
    const Pages = this.ref({
      Type: 'Pages',
      Count: 0,
      Kids: [],
    });

    const Names = this.ref({
      Dests: new PDFNameTree(),
    });

    this.root = this.ref({
      Type: 'Catalog',
      Pages,
      Names,
    });

    if (this.options.lang) {
      this.root.data.Lang = String(this.options.lang);
    }

    // The current page
    this.page = null;

    // Initialize mixins
    this.initColor();
    this.initVector();
    this.initFonts(options.font);
    this.initText();
    this.initImages();
    this.initOutline();
    this.initMarkings(options);

    // Initialize the metadata
    this.info = {
      Producer: 'SimplePDF',
      Creator: 'SimplePDF',
      CreationDate: new Date(),
    };

    if (this.options.info) {
      for (let key in this.options.info) {
        this.info[key] = this.options.info[key];
      }
    }

    if (this.options.displayTitle) {
      this.root.data.ViewerPreferences = this.ref({
        DisplayDocTitle: true,
      });
    }

    // Generate file ID
    this.id = PDFSecurity.generateFileID(this.info);

    // Initialize security settings
    this.security = PDFSecurity.create(this, options);

    // Write the header
    // PDF version
    this._write(`%PDF-${this.version}`);

    // 4 binary chars, as recommended by the spec
    this._write('%\xFF\xFF\xFF\xFF');

    // Add the first page
    if (this.options.autoFirstPage !== false) {
      this.addPage();
    }
  }

  addPage(options: PDFOptions = {}) {
    if (options == null) {
      ({ options } = this);
    }

    // end the current page if needed
    if (!this.options.bufferPages) {
      this.flushPages();
    }

    // create a page object
    this.page = new PDFPage(this, options);
    this._pageBuffer.push(this.page);

    // add the page to the object store
    const pages = this.root.data.Pages.data;
    pages.Kids.push(this.page.dictionary);
    pages.Count++;

    // reset x and y coordinates
    this.x = this.page.margins.left;
    this.y = this.page.margins.top;

    // flip PDF coordinate system so that the origin is in
    // the top left rather than the bottom left
    this.ctm = [1, 0, 0, 1, 0, 0];
    this.transform(1, 0, 0, -1, 0, this.page.height);

    this.emit('pageAdded');

    return this;
  }

  continueOnNewPage(options) {
    const pageMarkings = this.endPageMarkings(this.page);

    this.addPage(options);

    this.initPageMarkings(pageMarkings);

    return this;
  }

  bufferedPageRange() {
    return { start: this._pageBufferStart, count: this._pageBuffer.length };
  }

  switchToPage(n) {
    let page;
    if (!(page = this._pageBuffer[n - this._pageBufferStart])) {
      throw new Error(
        `switchToPage(${n}) out of bounds, current buffer covers pages ${
          this._pageBufferStart
        } to ${this._pageBufferStart + this._pageBuffer.length - 1}`
      );
    }

    return (this.page = page);
  }

  flushPages() {
    // this local variable exists so we're future-proof against
    // reentrant calls to flushPages.
    const pages = this._pageBuffer;
    this._pageBuffer = [];
    this._pageBufferStart += pages.length;
    for (let page of pages) {
      this.endPageMarkings(page);
      page.end();
    }
  }

  addNamedDestination(name, ...args) {
    if (args.length === 0) {
      args = ['XYZ', null, null, null];
    }
    if (args[0] === 'XYZ' && args[2] !== null) {
      args[2] = this.page.height - args[2];
    }
    args.unshift(this.page.dictionary);
    this.root.data.Names.data.Dests.add(name, args);
  }

  addNamedEmbeddedFile(name, ref) {
    if (!this.root.data.Names.data.EmbeddedFiles) {
      // disabling /Limits for this tree fixes attachments not showing in Adobe Reader
      this.root.data.Names.data.EmbeddedFiles = new PDFNameTree({
        limits: false,
      });
    }

    // add filespec to EmbeddedFiles
    this.root.data.Names.data.EmbeddedFiles.add(name, ref);
  }

  addNamedJavaScript(name, js) {
    if (!this.root.data.Names.data.JavaScript) {
      this.root.data.Names.data.JavaScript = new PDFNameTree();
    }
    let data = {
      JS: String(js),
      S: 'JavaScript',
    };
    this.root.data.Names.data.JavaScript.add(name, data);
  }

  ref(data?: any) {
    const ref = new PDFReference(this, this._offsets.length + 1, data);
    this._offsets.push(null); // placeholder for this object's offset once it is finalized
    this._waiting++;
    return ref;
  }

  override _read() {}
  // do nothing, but this method is required by node

  _write(data: string | any[] | Buffer) {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data + '\n', 'binary');
    }

    this.push(data);
    return (this.offset += data.length);
  }

  addContent(data?: any) {
    this.page!.write(data);
    return this;
  }

  refEnd(ref) {
    this._offsets[ref.id - 1] = ref.offset;
    if (--this._waiting === 0 && this._ended) {
      this._finalize();
      return (this._ended = false);
    }
  }

  write(filename: string, fn: () => void = () => {}) {
    // print a deprecation warning with a stacktrace
    const err = new Error(`\
PDFDocument#write is deprecated, and will be removed in a future version of PDFKit. \
Please pipe the document into a Node stream.\
`);

    console.warn(err.stack);

    this.pipe(fs.createWriteStream(filename));
    this.end();
    return this.once('end', fn);
  }

  end() {
    this.flushPages();
    this.info = this.ref();
    for (let key in this.info) {
      let val = this.info[key];
      if (typeof val === 'string') {
        val = String(val);
      }

      let entry = this.ref(val);
      entry.end();

      this.info.data[key] = entry;
    }

    this.info.end();

    for (let name in this._fontFamilies) {
      const font = this._fontFamilies[name];
      font.finalize();
    }

    this.endOutline();
    this.endMarkings();

    this.root.end();
    this.root.data.Pages.end();
    this.root.data.Names.end();
    this.endAcroForm();

    if (this.root.data.ViewerPreferences) {
      this.root.data.ViewerPreferences.end();
    }

    if (this.security) {
      this.security.end();
    }

    if (this._waiting === 0) {
      return this._finalize();
    } else {
      return (this._ended = true);
    }
  }

  _finalize() {
    // generate xref
    const xRefOffset = this.offset;
    this._write('xref');
    this._write(`0 ${this._offsets.length + 1}`);
    this._write('0000000000 65535 f ');

    for (let offset of this._offsets) {
      offset = `0000000000${offset}`.slice(-10);
      this._write(offset + ' 00000 n ');
    }

    // trailer
    const trailer = {
      Size: this._offsets.length + 1,
      Root: this._root,
      Info: this._info,
      ID: [this._id, this._id],
    };
    if (this._security) {
      trailer.Encrypt = this._security.dictionary;
    }

    this._write('trailer');
    this._write(PDFObject.convert(trailer));

    this._write('startxref');
    this._write(`${xRefOffset}`);
    this._write('%%EOF');

    // end the stream
    return this.push(null);
  }

  override toString() {
    return '[object PDFDocument]';
  }

  // Color
  // ---------------------------------------------------------

  private _opacityRegistry = {};
  private _opacityCount = 0;
  patternCount = 0;
  private _gradCount = 0;
  private _fillColor!: [string, number];

  initColor() {
    // The opacity dictionaries
    this._opacityRegistry = {};
    this._opacityCount = 0;
    this.patternCount = 0;
    return (this._gradCount = 0);
  }

  normalizeColor(color: string | number[]): number[] | null {
    if (typeof color === 'string') {
      if (color.charAt(0) === '#') {
        if (color.length === 4) {
          color = color.replace(
            /#([0-9A-F])([0-9A-F])([0-9A-F])/i,
            '#$1$1$2$2$3$3'
          );
        }
        const hex = parseInt(color.slice(1), 16);
        color = [hex >> 16, (hex >> 8) & 0xff, hex & 0xff];
      } else if (namedColors[color]) {
        color = namedColors[color];
      }
    }

    if (Array.isArray(color)) {
      // RGB
      if (color.length === 3) {
        color = color.map((part) => part / 255);
        // CMYK
      } else if (color.length === 4) {
        color = color.map((part) => part / 100);
      }
      return color;
    }

    return null;
  }

  _setColor(color: PDFGradient | string | number[], stroke: boolean) {
    if (color instanceof PDFGradient) {
      color.apply(stroke);
      return true;
      // see if tiling pattern, decode & apply it it
    } else if (Array.isArray(color) && color[0] instanceof PDFTilingPattern) {
      color[0].apply(stroke, color[1]);
      return true;
    }
    // any other case should be a normal color and not a pattern
    return this._setColorCore(color, stroke);
  }

  _setColorCore(color, stroke) {
    color = this.normalizeColor(color);
    if (!color) {
      return false;
    }

    const op = stroke ? 'SCN' : 'scn';
    const space = this.getColorSpace(color);
    this.setColorSpace(space, stroke);

    color = color.join(' ');
    this.addContent(`${color} ${op}`);

    return true;
  }

  setColorSpace(space: string, stroke: boolean) {
    const op = stroke ? 'CS' : 'cs';
    return this.addContent(`/${space} ${op}`);
  }

  getColorSpace(color: number[]) {
    return color.length === 4 ? 'DeviceCMYK' : 'DeviceRGB';
  }

  fillColor(color: string, opacity?: number) {
    const set = this._setColor(color, false);
    if (set) {
      this.fillOpacity(opacity!);
    }

    // save this for text wrapper, which needs to reset
    // the fill color on new pages
    this._fillColor = [color, opacity!];
    return this;
  }

  strokeColor(color: string, opacity?: number) {
    const set = this._setColor(color, true);
    if (set) {
      this.strokeOpacity(opacity);
    }
    return this;
  }

  opacity(opacity: number) {
    this._doOpacity(opacity, opacity);
    return this;
  }

  fillOpacity(opacity: number) {
    this._doOpacity(opacity, null);
    return this;
  }

  strokeOpacity(opacity?: number) {
    this._doOpacity(null, opacity);
    return this;
  }

  _doOpacity(fillOpacity: number | null, strokeOpacity?: number | null) {
    let dictionary, name;
    if (fillOpacity == null && strokeOpacity == null) {
      return;
    }

    if (fillOpacity != null) {
      fillOpacity = Math.max(0, Math.min(1, fillOpacity));
    }
    if (strokeOpacity != null) {
      strokeOpacity = Math.max(0, Math.min(1, strokeOpacity));
    }
    const key = `${fillOpacity}_${strokeOpacity}`;

    if (this._opacityRegistry[key]) {
      [dictionary, name] = this._opacityRegistry[key];
    } else {
      dictionary = { Type: 'ExtGState' };

      if (fillOpacity != null) {
        dictionary.ca = fillOpacity;
      }
      if (strokeOpacity != null) {
        dictionary.CA = strokeOpacity;
      }

      dictionary = this.ref(dictionary);
      dictionary.end();
      const id = ++this._opacityCount;
      name = `Gs${id}`;
      this._opacityRegistry[key] = [dictionary, name];
    }

    this.page.ext_gstates[name] = dictionary;
    return this.addContent(`/${name} gs`);
  }

  linearGradient(x1, y1, x2, y2) {
    return new PDFLinearGradient(this, x1, y1, x2, y2);
  }

  radialGradient(x1, y1, r1, x2, y2, r2) {
    return new PDFRadialGradient(this, x1, y1, r1, x2, y2, r2);
  }

  pattern(bbox, xStep, yStep, stream) {
    return new PDFTilingPattern(this, bbox, xStep, yStep, stream);
  }

  // Vector
  // ---------------------------------------------------------

  private _ctm: number[] = [];
  private _ctmStack: number[][] = [];

  initVector() {
    this._ctm = [1, 0, 0, 1, 0, 0]; // current transformation matrix
    return (this._ctmStack = []);
  }

  save() {
    this._ctmStack.push(this._ctm.slice());
    // TODO: save/restore colorspace and styles so not setting it unnessesarily all the time?
    return this.addContent('q');
  }

  restore() {
    this._ctm = this._ctmStack.pop() || [1, 0, 0, 1, 0, 0];
    return this.addContent('Q');
  }

  closePath() {
    return this.addContent('h');
  }

  lineWidth(w: number) {
    return this.addContent(`${number(w)} w`);
  }

  lineCap(c: string | number) {
    if (typeof c === 'string') {
      c = _CAP_STYLES[c.toUpperCase()];
    }
    return this.addContent(`${c} J`);
  }

  lineJoin(j: string | number) {
    if (typeof j === 'string') {
      j = _JOIN_STYLES[j.toUpperCase()];
    }
    return this.addContent(`${j} j`);
  }

  miterLimit(m: number) {
    return this.addContent(`${number(m)} M`);
  }

  dash(length: number[], options: { space?: number; phase?: number } = {}) {
    const originalLength = length;
    if (!Array.isArray(length)) {
      length = [length, options.space || length];
    }

    const valid = length.every((x) => Number.isFinite(x) && x > 0);
    if (!valid) {
      throw new Error(
        `dash(${JSON.stringify(originalLength)}, ${JSON.stringify(
          options
        )}) invalid, lengths must be numeric and greater than zero`
      );
    }

    return this.addContent(
      `[${length.map(number).join(' ')}] ${number(options.phase || 0)} d`
    );
  }

  undash() {
    return this.addContent('[] 0 d');
  }

  moveTo(x?: number, y?: number) {
    return this.addContent(`${number(x ?? 0)} ${number(y ?? 0)} m`);
  }

  lineTo(x: number, y: number) {
    return this.addContent(`${number(x)} ${number(y)} l`);
  }

  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ) {
    return this.addContent(
      `${number(cp1x)} ${number(cp1y)} ${number(cp2x)} ${number(cp2y)} ${number(
        x
      )} ${number(y)} c`
    );
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    return this.addContent(
      `${number(cpx)} ${number(cpy)} ${number(x)} ${number(y)} v`
    );
  }

  rect(x: number, y: number, w: number, h: number) {
    return this.addContent(
      `${number(x)} ${number(y)} ${number(w)} ${number(h)} re`
    );
  }

  roundedRect(x: number, y: number, w: number, h: number, r: number) {
    if (r == null) {
      r = 0;
    }
    r = Math.min(r, 0.5 * w, 0.5 * h);

    // amount to inset control points from corners (see `ellipse`)
    const c = r * (1.0 - KAPPA);

    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.bezierCurveTo(x + w - c, y, x + w, y + c, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.bezierCurveTo(x + w, y + h - c, x + w - c, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.bezierCurveTo(x + c, y + h, x, y + h - c, x, y + h - r);
    this.lineTo(x, y + r);
    this.bezierCurveTo(x, y + c, x + c, y, x + r, y);
    return this.closePath();
  }

  ellipse(x: number, y: number, r1: number, r2?: number) {
    // based on http://stackoverflow.com/questions/2172798/how-to-draw-an-oval-in-html5-canvas/2173084#2173084
    if (!r2) {
      r2 = r1;
    }
    x -= r1;
    y -= r2;
    const ox = r1 * KAPPA;
    const oy = r2 * KAPPA;
    const xe = x + r1 * 2;
    const ye = y + r2 * 2;
    const xm = x + r1;
    const ym = y + r2;

    this.moveTo(x, ym);
    this.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    this.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    this.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    this.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
    return this.closePath();
  }

  circle(x: number, y: number, radius: number) {
    return this.ellipse(x, y, radius);
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    anticlockwise: boolean
  ) {
    if (anticlockwise == null) {
      anticlockwise = false;
    }
    const TWO_PI = 2.0 * Math.PI;
    const HALF_PI = 0.5 * Math.PI;

    let deltaAng = endAngle - startAngle;

    if (Math.abs(deltaAng) > TWO_PI) {
      // draw only full circle if more than that is specified
      deltaAng = TWO_PI;
    } else if (deltaAng !== 0 && anticlockwise !== deltaAng < 0) {
      // necessary to flip direction of rendering
      const dir = anticlockwise ? -1 : 1;
      deltaAng = dir * TWO_PI + deltaAng;
    }

    const numSegs = Math.ceil(Math.abs(deltaAng) / HALF_PI);
    const segAng = deltaAng / numSegs;
    const handleLen = (segAng / HALF_PI) * KAPPA * radius;
    let curAng = startAngle;

    // component distances between anchor point and control point
    let deltaCx = -Math.sin(curAng) * handleLen;
    let deltaCy = Math.cos(curAng) * handleLen;

    // anchor point
    let ax = x + Math.cos(curAng) * radius;
    let ay = y + Math.sin(curAng) * radius;

    // calculate and render segments
    this.moveTo(ax, ay);

    for (let segIdx = 0; segIdx < numSegs; segIdx++) {
      // starting control point
      const cp1x = ax + deltaCx;
      const cp1y = ay + deltaCy;

      // step angle
      curAng += segAng;

      // next anchor point
      ax = x + Math.cos(curAng) * radius;
      ay = y + Math.sin(curAng) * radius;

      // next control point delta
      deltaCx = -Math.sin(curAng) * handleLen;
      deltaCy = Math.cos(curAng) * handleLen;

      // ending control point
      const cp2x = ax - deltaCx;
      const cp2y = ay - deltaCy;

      // render segment
      this.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ax, ay);
    }

    return this;
  }

  polygon(...points: [number, number][]) {
    this.moveTo(...(points.shift() || []));
    for (let point of points) {
      this.lineTo(...(point || []));
    }
    return this.closePath();
  }

  path(path: string) {
    SVGPath.apply(this, path);
    return this;
  }

  _windingRule(rule: string) {
    if (/even-?odd/.test(rule)) {
      return '*';
    }

    return '';
  }

  fill(color: string, rule?: string) {
    let hasColor = true;
    if (/(even-?odd)|(non-?zero)/.test(color)) {
      rule = color;
      hasColor = false;
    }

    if (hasColor) {
      this.fillColor(color);
    }
    return this.addContent(`f${this._windingRule(rule!)}`);
  }

  stroke(color?: string) {
    if (color) {
      this.strokeColor(color);
    }
    return this.addContent('S');
  }

  fillAndStroke(fillColor: string, strokeColor: string | null, rule?: string) {
    if (strokeColor == null) {
      strokeColor = fillColor;
    }

    let hasFillColor = true;

    const isFillRule = /(even-?odd)|(non-?zero)/;
    if (isFillRule.test(fillColor)) {
      rule = fillColor;
      hasFillColor = false;
    }

    if (isFillRule.test(strokeColor)) {
      rule = strokeColor;
      strokeColor = fillColor;
    }

    if (hasFillColor) {
      this.fillColor(fillColor);
      this.strokeColor(strokeColor);
    }

    return this.addContent(`B${this._windingRule(rule!)}`);
  }

  clip(rule: string) {
    return this.addContent(`W${this._windingRule(rule)} n`);
  }

  transform(
    m11: number,
    m12: number,
    m21: number,
    m22: number,
    dx: number,
    dy: number
  ) {
    // keep track of the current transformation matrix
    const m = this._ctm;
    const [m0, m1, m2, m3, m4, m5] = m;
    m[0] = m0 * m11 + m2 * m12;
    m[1] = m1 * m11 + m3 * m12;
    m[2] = m0 * m21 + m2 * m22;
    m[3] = m1 * m21 + m3 * m22;
    m[4] = m0 * dx + m2 * dy + m4;
    m[5] = m1 * dx + m3 * dy + m5;

    const values = [m11, m12, m21, m22, dx, dy].map((v) => number(v)).join(' ');
    return this.addContent(`${values} cm`);
  }

  translate(x: number, y: number) {
    return this.transform(1, 0, 0, 1, x, y);
  }

  rotate(angle: number, options: { origin?: number[] } = {}) {
    let y;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let x = (y = 0);

    if (options.origin != null) {
      [x, y] = options.origin;
      const x1 = x * cos - y * sin;
      const y1 = x * sin + y * cos;
      x -= x1;
      y -= y1;
    }

    return this.transform(cos, sin, -sin, cos, x, y);
  }

  scale(xFactor: number, yFactor: number, options: { origin?: number[] } = {}) {
    let y;
    if (yFactor == null) {
      yFactor = xFactor;
    }
    if (typeof yFactor === 'object') {
      options = yFactor;
      yFactor = xFactor;
    }

    let x = (y = 0);
    if (options.origin != null) {
      [x, y] = options.origin;
      x -= xFactor * x;
      y -= yFactor * y;
    }

    return this.transform(xFactor, 0, 0, yFactor, x, y);
  }

  // Acroform
  // ---------------------------------------------------------

  /**
   * Must call if adding AcroForms to a document. Must also call font() before
   * this method to set the default font.
   */
  initForm() {
    if (!this._font) {
      throw new Error('Must set a font before calling initForm method');
    }
    this._acroform = {
      fonts: {},
      defaultFont: this._font.name
    };
    this._acroform.fonts[this._font.id] = this._font.ref();

    let data = {
      Fields: [],
      NeedAppearances: true,
      DA: String(`/${this._font.id} 0 Tf 0 g`),
      DR: {
        Font: {}
      }
    };
    data.DR.Font[this._font.id] = this._font.ref();
    const AcroForm = this.ref(data);
    this._root.data.AcroForm = AcroForm;
    return this;
  }

  /**
   * Called automatically by document.js
   */
  endAcroForm() {
    if (this._root.data.AcroForm) {
      if (
          !Object.keys(this._acroform.fonts).length &&
          !this._acroform.defaultFont
      ) {
        throw new Error('No fonts specified for PDF form');
      }
      let fontDict = this._root.data.AcroForm.data.DR.Font;
      Object.keys(this._acroform.fonts).forEach(name => {
        fontDict[name] = this._acroform.fonts[name];
      });
      this._root.data.AcroForm.data.Fields.forEach(fieldRef => {
        this._endChild(fieldRef);
      });
      this._root.data.AcroForm.end();
    }
    return this;
  }

  _endChild(ref) {
    if (Array.isArray(ref.data.Kids)) {
      ref.data.Kids.forEach(childRef => {
        this._endChild(childRef);
      });
      ref.end();
    }
    return this;
  }

  /**
   * Creates and adds a form field to the document. Form fields are intermediate
   * nodes in a PDF form that are used to specify form name heirarchy and form
   * value defaults.
   * @param {string} name - field name (T attribute in field dictionary)
   * @param {object} options  - other attributes to include in field dictionary
   */
  formField(name, options = {}) {
    let fieldDict = this._fieldDict(name, null, options);
    let fieldRef = this.ref(fieldDict);
    this._addToParent(fieldRef);
    return fieldRef;
  }

  /**
   * Creates and adds a Form Annotation to the document. Form annotations are
   * called Widget annotations internally within a PDF file.
   * @param {string} name - form field name (T attribute of widget annotation
   * dictionary)
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {object} options
   */
  formAnnotation(name, type, x, y, w, h, options = {}) {
    let fieldDict = this._fieldDict(name, type, options);
    fieldDict.Subtype = 'Widget';
    if (fieldDict.F === undefined) {
      fieldDict.F = 4; // print the annotation
    }

    // Add Field annot to page, and get it's ref
    this.annotate(x, y, w, h, fieldDict);
    let annotRef = this.page.annotations[this.page.annotations.length - 1];

    return this._addToParent(annotRef);
  }

  formText(name, x, y, w, h, options = {}) {
    return this.formAnnotation(name, 'text', x, y, w, h, options);
  }

  formPushButton(name, x, y, w, h, options = {}) {
    return this.formAnnotation(name, 'pushButton', x, y, w, h, options);
  }

  formCombo(name, x, y, w, h, options = {}) {
    return this.formAnnotation(name, 'combo', x, y, w, h, options);
  }

  formList(name, x, y, w, h, options = {}) {
    return this.formAnnotation(name, 'list', x, y, w, h, options);
  }

  formRadioButton(name, x, y, w, h, options = {}) {
    return this.formAnnotation(name, 'radioButton', x, y, w, h, options);
  }

  formCheckbox(name, x, y, w, h, options = {}) {
    return this.formAnnotation(name, 'checkbox', x, y, w, h, options);
  }

  _addToParent(fieldRef) {
    let parent = fieldRef.data.Parent;
    if (parent) {
      if (!parent.data.Kids) {
        parent.data.Kids = [];
      }
      parent.data.Kids.push(fieldRef);
    } else {
      this._root.data.AcroForm.data.Fields.push(fieldRef);
    }
    return this;
  }

  _fieldDict(name, type, options = {}) {
    if (!this._acroform) {
      throw new Error(
          'Call document.initForms() method before adding form elements to document'
      );
    }
    let opts = Object.assign({}, options);
    if (type !== null) {
      opts = this._resolveType(type, options);
    }
    opts = this._resolveFlags(opts);
    opts = this._resolveJustify(opts);
    opts = this._resolveFont(opts);
    opts = this._resolveStrings(opts);
    opts = this._resolveColors(opts);
    opts = this._resolveFormat(opts);
    opts.T = new String(name);
    if (opts.parent) {
      opts.Parent = opts.parent;
      delete opts.parent;
    }
    return opts;
  }

  _resolveType(type, opts) {
    if (type === 'text') {
      opts.FT = 'Tx';
    } else if (type === 'pushButton') {
      opts.FT = 'Btn';
      opts.pushButton = true;
    } else if (type === 'radioButton') {
      opts.FT = 'Btn';
      opts.radioButton = true;
    } else if (type === 'checkbox') {
      opts.FT = 'Btn';
    } else if (type === 'combo') {
      opts.FT = 'Ch';
      opts.combo = true;
    } else if (type === 'list') {
      opts.FT = 'Ch';
    } else {
      throw new Error(`Invalid form annotation type '${type}'`);
    }
    return opts;
  }

  _resolveFormat(opts) {
    const f = opts.format;
    if (f && f.type) {
      let fnKeystroke;
      let fnFormat;
      let params = '';
      if (FORMAT_SPECIAL[f.type] !== undefined) {
        fnKeystroke = `AFSpecial_Keystroke`;
        fnFormat = `AFSpecial_Format`;
        params = FORMAT_SPECIAL[f.type];
      } else {
        let format = f.type.charAt(0).toUpperCase() + f.type.slice(1);
        fnKeystroke = `AF${format}_Keystroke`;
        fnFormat = `AF${format}_Format`;

        if (f.type === 'date') {
          fnKeystroke += 'Ex';
          params = String(f.param);
        } else if (f.type === 'time') {
          params = String(f.param);
        } else if (f.type === 'number') {
          let p = Object.assign({}, FORMAT_DEFAULT.number, f);
          params = String(
              [
                String(p.nDec),
                p.sepComma ? '0' : '1',
                '"' + p.negStyle + '"',
                'null',
                '"' + p.currency + '"',
                String(p.currencyPrepend)
              ].join(',')
          );
        } else if (f.type === 'percent') {
          let p = Object.assign({}, FORMAT_DEFAULT.percent, f);
          params = String([String(p.nDec), p.sepComma ? '0' : '1'].join(','));
        }
      }
      opts.AA = opts.AA ? opts.AA : {};
      opts.AA.K = {
        S: 'JavaScript',
        JS: new String(`${fnKeystroke}(${params});`)
      };
      opts.AA.F = {
        S: 'JavaScript',
        JS: new String(`${fnFormat}(${params});`)
      };
    }
    delete opts.format;
    return opts;
  }

  _resolveColors(opts) {
    let color = this._normalizeColor(opts.backgroundColor);
    if (color) {
      if (!opts.MK) {
        opts.MK = {};
      }
      opts.MK.BG = color;
    }
    color = this._normalizeColor(opts.borderColor);
    if (color) {
      if (!opts.MK) {
        opts.MK = {};
      }
      opts.MK.BC = color;
    }
    delete opts.backgroundColor;
    delete opts.borderColor;
    return opts;
  }

  _resolveFlags(options) {
    let result = 0;
    Object.keys(options).forEach(key => {
      if (FIELD_FLAGS[key]) {
        result |= FIELD_FLAGS[key];
        delete options[key];
      }
    });
    if (result !== 0) {
      options.Ff = options.Ff ? options.Ff : 0;
      options.Ff |= result;
    }
    return options;
  },

  _resolveJustify(options) {
    let result = 0;
    if (options.align !== undefined) {
      if (typeof FIELD_JUSTIFY[options.align] === 'number') {
        result = FIELD_JUSTIFY[options.align];
      }
      delete options.align;
    }
    if (result !== 0) {
      options.Q = result; // default
    }
    return options;
  }

  _resolveFont(options) {
    // add current font to document-level AcroForm dict if necessary
    if (this._acroform.fonts[this._font.id] === null) {
      this._acroform.fonts[this._font.id] = this._font.ref();
    }

    // add current font to field's resource dict (RD) if not the default acroform font
    if (this._acroform.defaultFont !== this._font.name) {
      options.DR = { Font: {} };

      // Get the fontSize option. If not set use auto sizing
      const fontSize = options.fontSize || 0;

      options.DR.Font[this._font.id] = this._font.ref();
      options.DA = new String(`/${this._font.id} ${fontSize} Tf 0 g`);
    }
    return options;
  }

  _resolveStrings(options) {
    let select = [];
    function appendChoices(a) {
      if (Array.isArray(a)) {
        for (let idx = 0; idx < a.length; idx++) {
          if (typeof a[idx] === 'string') {
            select.push(new String(a[idx]));
          } else {
            select.push(a[idx]);
          }
        }
      }
    }
    appendChoices(options.Opt);
    if (options.select) {
      appendChoices(options.select);
      delete options.select;
    }
    if (select.length) {
      options.Opt = select;
    }

    Object.keys(VALUE_MAP).forEach(key => {
      if (options[key] !== undefined) {
        options[VALUE_MAP[key]] = options[key];
        delete options[key];
      }
    });
    ['V', 'DV'].forEach(key => {
      if (typeof options[key] === 'string') {
        options[key] = new String(options[key]);
      }
    });

    if (options.MK && options.MK.CA) {
      options.MK.CA = new String(options.MK.CA);
    }
    if (options.label) {
      options.MK = options.MK ? options.MK : {};
      options.MK.CA = new String(options.label);
      delete options.label;
    }
    return options;
  }

  // Annotations
  // ---------------------------------------------------------

  annotate(x, y, w, h, options) {
    options.Type = 'Annot';
    options.Rect = this._convertRect(x, y, w, h);
    options.Border = [0, 0, 0];

    if (options.Subtype === 'Link' && typeof options.F === 'undefined') {
      options.F = 1 << 2; // Print Annotation Flag
    }

    if (options.Subtype !== 'Link') {
      if (options.C == null) {
        options.C = this._normalizeColor(options.color || [0, 0, 0]);
      }
    } // convert colors
    delete options.color;

    if (typeof options.Dest === 'string') {
      options.Dest = new String(options.Dest);
    }

    // Capitalize keys
    for (let key in options) {
      const val = options[key];
      options[key[0].toUpperCase() + key.slice(1)] = val;
    }

    const ref = this.ref(options);
    this.page.annotations.push(ref);
    ref.end();
    return this;
  }

  note(x, y, w, h, contents, options = {}) {
    options.Subtype = 'Text';
    options.Contents = new String(contents);
    options.Name = 'Comment';
    if (options.color == null) {
      options.color = [243, 223, 92];
    }
    return this.annotate(x, y, w, h, options);
  }

  goTo(x, y, w, h, name, options = {}) {
    options.Subtype = 'Link';
    options.A = this.ref({
      S: 'GoTo',
      D: new String(name)
    });
    options.A.end();
    return this.annotate(x, y, w, h, options);
  }

  link(x, y, w, h, url, options = {}) {
    options.Subtype = 'Link';

    if (typeof url === 'number') {
      // Link to a page in the document (the page must already exist)
      const pages = this._root.data.Pages.data;
      if (url >= 0 && url < pages.Kids.length) {
        options.A = this.ref({
          S: 'GoTo',
          D: [pages.Kids[url], 'XYZ', null, null, null]
        });
        options.A.end();
      } else {
        throw new Error(`The document has no page ${url}`);
      }
    } else {
      // Link to an external url
      options.A = this.ref({
        S: 'URI',
        URI: new String(url)
      });
      options.A.end();
    }

    return this.annotate(x, y, w, h, options);
  }

  _markup(x, y, w, h, options = {}) {
    const [x1, y1, x2, y2] = this._convertRect(x, y, w, h);
    options.QuadPoints = [x1, y2, x2, y2, x1, y1, x2, y1];
    options.Contents = new String();
    return this.annotate(x, y, w, h, options);
  }

  highlight(x, y, w, h, options = {}) {
    options.Subtype = 'Highlight';
    if (options.color == null) {
      options.color = [241, 238, 148];
    }
    return this._markup(x, y, w, h, options);
  }

  underline(x, y, w, h, options = {}) {
    options.Subtype = 'Underline';
    return this._markup(x, y, w, h, options);
  }

  strike(x, y, w, h, options = {}) {
    options.Subtype = 'StrikeOut';
    return this._markup(x, y, w, h, options);
  }

  lineAnnotation(x1, y1, x2, y2, options = {}) {
    options.Subtype = 'Line';
    options.Contents = new String();
    options.L = [x1, this.page.height - y1, x2, this.page.height - y2];
    return this.annotate(x1, y1, x2, y2, options);
  }

  rectAnnotation(x, y, w, h, options = {}) {
    options.Subtype = 'Square';
    options.Contents = new String();
    return this.annotate(x, y, w, h, options);
  }

  ellipseAnnotation(x, y, w, h, options = {}) {
    options.Subtype = 'Circle';
    options.Contents = new String();
    return this.annotate(x, y, w, h, options);
  }

  textAnnotation(x, y, w, h, text, options = {}) {
    options.Subtype = 'FreeText';
    options.Contents = new String(text);
    options.DA = new String();
    return this.annotate(x, y, w, h, options);
  }

  fileAnnotation(x, y, w, h, file = {}, options = {}) {
    // create hidden file
    const filespec = this.file(
        file.src,
        Object.assign({ hidden: true }, file)
    );

    options.Subtype = 'FileAttachment';
    options.FS = filespec;

    // add description from filespec unless description (Contents) has already been set
    if (options.Contents) {
      options.Contents = new String(options.Contents);
    } else if (filespec.data.Desc) {
      options.Contents = filespec.data.Desc;
    }

    return this.annotate(x, y, w, h, options);
  }

  _convertRect(x1, y1, w, h) {
    // flip y1 and y2
    let y2 = y1;
    y1 += h;

    // make x2
    let x2 = x1 + w;

    // apply current transformation matrix to points
    const [m0, m1, m2, m3, m4, m5] = this._ctm;
    x1 = m0 * x1 + m2 * y1 + m4;
    y1 = m1 * x1 + m3 * y1 + m5;
    x2 = m0 * x2 + m2 * y2 + m4;
    y2 = m1 * x2 + m3 * y2 + m5;

    return [x1, y1, x2, y2];
  }

  // Attachments
  // ---------------------------------------------------------

  /**
   * Embed contents of `src` in PDF
   * @param {Buffer | ArrayBuffer | string} src input Buffer, ArrayBuffer, base64 encoded string or path to file
   * @param {object} options
   *  * options.name: filename to be shown in PDF, will use `src` if none set
   *  * options.type: filetype to be shown in PDF
   *  * options.description: description to be shown in PDF
   *  * options.hidden: if true, do not add attachment to EmbeddedFiles dictionary. Useful for file attachment annotations
   *  * options.creationDate: override creation date
   *  * options.modifiedDate: override modified date
   * @returns filespec reference
   */
  file(src, options = {}) {
    options.name = options.name || src;

    const refBody = {
      Type: 'EmbeddedFile',
      Params: {}
    };
    let data;

    if (!src) {
      throw new Error('No src specified');
    }
    if (Buffer.isBuffer(src)) {
      data = src;
    } else if (src instanceof ArrayBuffer) {
      data = Buffer.from(new Uint8Array(src));
    } else {
      let match;
      if ((match = /^data:(.*);base64,(.*)$/.exec(src))) {
        if (match[1]) {
          refBody.Subtype = match[1].replace('/', '#2F');
        }
        data = Buffer.from(match[2], 'base64');
      } else {
        data = fs.readFileSync(src);
        if (!data) {
          throw new Error(`Could not read contents of file at filepath ${src}`);
        }

        // update CreationDate and ModDate
        const { birthtime, ctime } = fs.statSync(src);
        refBody.Params.CreationDate = birthtime;
        refBody.Params.ModDate = ctime;
      }
    }

    // override creation date and modified date
    if (options.creationDate instanceof Date) {
      refBody.Params.CreationDate = options.creationDate;
    }
    if (options.modifiedDate instanceof Date) {
      refBody.Params.ModDate = options.modifiedDate;
    }
    // add optional subtype
    if (options.type) {
      refBody.Subtype = options.type.replace('/', '#2F');
    }

    // add checksum and size information
    const checksum = CryptoJS.MD5(
        CryptoJS.lib.WordArray.create(new Uint8Array(data))
    );
    refBody.Params.CheckSum = new String(checksum);
    refBody.Params.Size = data.byteLength;

    // save some space when embedding the same file again
    // if a file with the same name and metadata exists, reuse its reference
    let ref;
    if (!this._fileRegistry) this._fileRegistry = {};
    let file = this._fileRegistry[options.name];
    if (file && isEqual(refBody, file)) {
      ref = file.ref;
    } else {
      ref = this.ref(refBody);
      ref.end(data);

      this._fileRegistry[options.name] = { ...refBody, ref };
    }
    // add filespec for embedded file
    const fileSpecBody = {
      Type: 'Filespec',
      F: new String(options.name),
      EF: { F: ref },
      UF: new String(options.name)
    };
    if (options.description) {
      fileSpecBody.Desc = new String(options.description);
    }
    const filespec = this.ref(fileSpecBody);
    filespec.end();

    if (!options.hidden) {
      this.addNamedEmbeddedFile(options.name, filespec);
    }

    return filespec;
  }

  // Fonts
  // ---------------------------------------------------------

  initFonts(defaultFont = 'Helvetica') {
    // Lookup table for embedded fonts
    this._fontFamilies = {};
    this._fontCount = 0;

    // Font state
    this._fontSize = 12;
    this._font = null;

    this._registeredFonts = {};

    // Set the default font
    if (defaultFont) {
      this.font(defaultFont);
    }
  }

  font(src, family, size) {
    let cacheKey, font;
    if (typeof family === 'number') {
      size = family;
      family = null;
    }

    // check registered fonts if src is a string
    if (typeof src === 'string' && this._registeredFonts[src]) {
      cacheKey = src;
      ({ src, family } = this._registeredFonts[src]);
    } else {
      cacheKey = family || src;
      if (typeof cacheKey !== 'string') {
        cacheKey = null;
      }
    }

    if (size != null) {
      this.fontSize(size);
    }

    // fast path: check if the font is already in the PDF
    if ((font = this._fontFamilies[cacheKey])) {
      this._font = font;
      return this;
    }

    // load the font
    const id = `F${++this._fontCount}`;
    this._font = PDFFontFactory.open(this, src, family, id);

    // check for existing font familes with the same name already in the PDF
    // useful if the font was passed as a buffer
    if ((font = this._fontFamilies[this._font.name])) {
      this._font = font;
      return this;
    }

    // save the font for reuse later
    if (cacheKey) {
      this._fontFamilies[cacheKey] = this._font;
    }

    if (this._font.name) {
      this._fontFamilies[this._font.name] = this._font;
    }

    return this;
  }

  fontSize(_fontSize) {
    this._fontSize = _fontSize;
    return this;
  }

  currentLineHeight(includeGap) {
    if (includeGap == null) {
      includeGap = false;
    }
    return this._font.lineHeight(this._fontSize, includeGap);
  }

  registerFont(name, src, family) {
    this._registeredFonts[name] = {
      src,
      family
    };

    return this;
  }

  // Images
  // ---------------------------------------------------------

  initImages() {
    this._imageRegistry = {};
    return (this._imageCount = 0);
  }

  image(src, x, y, options = {}) {
    let bh, bp, bw, image, ip, left, left1;
    if (typeof x === 'object') {
      options = x;
      x = null;
    }

    x = (left = x != null ? x : options.x) != null ? left : this.x;
    y = (left1 = y != null ? y : options.y) != null ? left1 : this.y;

    if (typeof src === 'string') {
      image = this._imageRegistry[src];
    }

    if (!image) {
      if (src.width && src.height) {
        image = src;
      } else {
        image = this.openImage(src);
      }
    }

    if (!image.obj) {
      image.embed(this);
    }

    if (this.page.xobjects[image.label] == null) {
      this.page.xobjects[image.label] = image.obj;
    }

    let w = options.width || image.width;
    let h = options.height || image.height;

    if (options.width && !options.height) {
      const wp = w / image.width;
      w = image.width * wp;
      h = image.height * wp;
    } else if (options.height && !options.width) {
      const hp = h / image.height;
      w = image.width * hp;
      h = image.height * hp;
    } else if (options.scale) {
      w = image.width * options.scale;
      h = image.height * options.scale;
    } else if (options.fit) {
      [bw, bh] = options.fit;
      bp = bw / bh;
      ip = image.width / image.height;
      if (ip > bp) {
        w = bw;
        h = bw / ip;
      } else {
        h = bh;
        w = bh * ip;
      }
    } else if (options.cover) {
      [bw, bh] = options.cover;
      bp = bw / bh;
      ip = image.width / image.height;
      if (ip > bp) {
        h = bh;
        w = bh * ip;
      } else {
        w = bw;
        h = bw / ip;
      }
    }

    if (options.fit || options.cover) {
      if (options.align === 'center') {
        x = x + bw / 2 - w / 2;
      } else if (options.align === 'right') {
        x = x + bw - w;
      }

      if (options.valign === 'center') {
        y = y + bh / 2 - h / 2;
      } else if (options.valign === 'bottom') {
        y = y + bh - h;
      }
    }

    // create link annotations if the link option is given
    if (options.link != null) {
      this.link(x, y, w, h, options.link);
    }
    if (options.goTo != null) {
      this.goTo(x, y, w, h, options.goTo);
    }
    if (options.destination != null) {
      this.addNamedDestination(options.destination, 'XYZ', x, y, null);
    }

    // Set the current y position to below the image if it is in the document flow
    if (this.y === y) {
      this.y += h;
    }

    this.save();
    this.transform(w, 0, 0, -h, x, y + h);
    this.addContent(`/${image.label} Do`);
    this.restore();

    return this;
  }

  openImage(src) {
    let image;
    if (typeof src === 'string') {
      image = this._imageRegistry[src];
    }

    if (!image) {
      image = PDFImage.open(src, `I${++this._imageCount}`);
      if (typeof src === 'string') {
        this._imageRegistry[src] = image;
      }
    }

    return image;
  }

  // Markings
  // ---------------------------------------------------------

  initMarkings(options) {
    this.structChildren = [];

    if (options.tagged) {
      this.getMarkInfoDictionary().data.Marked = true;
      this.getStructTreeRoot();
    }
  }

  markContent(tag, options = null) {
    if (tag === 'Artifact' || (options && options.mcid)) {
      let toClose = 0;
      this.page.markings.forEach((marking) => {
        if (toClose || marking.structContent || marking.tag === 'Artifact') {
          toClose++;
        }
      });
      while (toClose--) {
        this.endMarkedContent();
      }
    }

    if (!options) {
      this.page.markings.push({ tag });
      this.addContent(`/${tag} BMC`);
      return this;
    }

    this.page.markings.push({ tag, options });

    const dictionary = {};

    if (typeof options.mcid !== 'undefined') {
      dictionary.MCID = options.mcid;
    }
    if (tag === 'Artifact') {
      if (typeof options.type === 'string') {
        dictionary.Type = options.type;
      }
      if (Array.isArray(options.bbox)) {
        dictionary.BBox = [options.bbox[0], this.page.height - options.bbox[3],
          options.bbox[2], this.page.height - options.bbox[1]];
      }
      if (Array.isArray(options.attached) &&
          options.attached.every(val => typeof val === 'string')) {
        dictionary.Attached = options.attached;
      }
    }
    if (tag === 'Span') {
      if (options.lang) {
        dictionary.Lang = new String(options.lang);
      }
      if (options.alt) {
        dictionary.Alt = new String(options.alt);
      }
      if (options.expanded) {
        dictionary.E = new String(options.expanded);
      }
      if (options.actual) {
        dictionary.ActualText = new String(options.actual);
      }
    }

    this.addContent(`/${tag} ${PDFObject.convert(dictionary)} BDC`);
    return this;
  }

  markStructureContent(tag, options = {}) {
    const pageStructParents = this.getStructParentTree().get(this.page.structParentTreeKey);
    const mcid = pageStructParents.length;
    pageStructParents.push(null);

    this.markContent(tag, { ...options, mcid });

    const structContent = new PDFStructureContent(this.page.dictionary, mcid);
    this.page.markings.slice(-1)[0].structContent = structContent;
    return structContent;
  }

  endMarkedContent() {
    this.page.markings.pop();
    this.addContent('EMC');
    return this;
  }

  struct(type, options = {}, children = null) {
    return new PDFStructureElement(this, type, options, children);
  }

  addStructure(structElem) {
    const structTreeRoot = this.getStructTreeRoot();
    structElem.setParent(structTreeRoot);
    structElem.setAttached();
    this.structChildren.push(structElem);
    if (!structTreeRoot.data.K) {
      structTreeRoot.data.K = [];
    }
    structTreeRoot.data.K.push(structElem.dictionary);
    return this;
  }

  initPageMarkings(pageMarkings) {
    pageMarkings.forEach((marking) => {
      if (marking.structContent) {
        const structContent = marking.structContent;
        const newStructContent = this.markStructureContent(marking.tag, marking.options);
        structContent.push(newStructContent);
        this.page.markings.slice(-1)[0].structContent = structContent;
      } else {
        this.markContent(marking.tag, marking.options);
      }
    });
  }

  endPageMarkings(page) {
    const pageMarkings = page.markings;
    pageMarkings.forEach(() => page.write('EMC'));
    page.markings = [];
    return pageMarkings;
  }

  getMarkInfoDictionary() {
    if (!this._root.data.MarkInfo) {
      this._root.data.MarkInfo = this.ref({});
    }
    return this._root.data.MarkInfo;
  }

  getStructTreeRoot() {
    if (!this._root.data.StructTreeRoot) {
      this._root.data.StructTreeRoot = this.ref({
        Type: 'StructTreeRoot',
        ParentTree: new PDFNumberTree(),
        ParentTreeNextKey: 0
      });
    }
    return this._root.data.StructTreeRoot;
  }

  getStructParentTree() {
    return this.getStructTreeRoot().data.ParentTree;
  }

  createStructParentTreeNextKey() {
    // initialise the MarkInfo dictionary
    this.getMarkInfoDictionary();

    const structTreeRoot = this.getStructTreeRoot();
    const key = structTreeRoot.data.ParentTreeNextKey++;
    structTreeRoot.data.ParentTree.add(key, []);
    return key;
  }

  endMarkings() {
    const structTreeRoot = this._root.data.StructTreeRoot;
    if (structTreeRoot) {
      structTreeRoot.end();
      this.structChildren.forEach((structElem) => structElem.end());
    }
    if (this._root.data.MarkInfo) {
      this._root.data.MarkInfo.end();
    }
  }

  // Outline
  // ---------------------------------------------------------

  initOutline() {
    return (this.outline = new PDFOutline(this, null, null, null));
  }

  endOutline() {
    this.outline.endOutline();
    if (this.outline.children.length > 0) {
      this._root.data.Outlines = this.outline.dictionary;
      return (this._root.data.PageMode = 'UseOutlines');
    }
  }

  // Text
  // ---------------------------------------------------------

  initText() {
    this._line = this._line.bind(this);
    // Current coordinates
    this.x = 0;
    this.y = 0;
    return (this._lineGap = 0);
  },

  lineGap(_lineGap) {
    this._lineGap = _lineGap;
    return this;
  },

  moveDown(lines) {
    if (lines == null) {
      lines = 1;
    }
    this.y += this.currentLineHeight(true) * lines + this._lineGap;
    return this;
  },

  moveUp(lines) {
    if (lines == null) {
      lines = 1;
    }
    this.y -= this.currentLineHeight(true) * lines + this._lineGap;
    return this;
  },

  _text(text, x, y, options, lineCallback) {
    options = this._initOptions(x, y, options);

    // Convert text to a string
    text = text == null ? '' : `${text}`;

    // if the wordSpacing option is specified, remove multiple consecutive spaces
    if (options.wordSpacing) {
      text = text.replace(/\s{2,}/g, ' ');
    }

    const addStructure = () => {
      if (options.structParent) {
        options.structParent.add(this.struct(options.structType || 'P',
            [ this.markStructureContent(options.structType || 'P') ]));
      }
    };

    // word wrapping
    if (options.width) {
      let wrapper = this._wrapper;
      if (!wrapper) {
        wrapper = new LineWrapper(this, options);
        wrapper.on('line', lineCallback);
        wrapper.on('firstLine', addStructure);
      }

      this._wrapper = options.continued ? wrapper : null;
      this._textOptions = options.continued ? options : null;
      wrapper.wrap(text, options);

      // render paragraphs as single lines
    } else {
      for (let line of text.split('\n')) {
        addStructure();
        lineCallback(line, options);
      }
    }

    return this;
  },

  text(text, x, y, options) {
    return this._text(text, x, y, options, this._line);
  },

  widthOfString(string, options = {}) {
    return (
        this._font.widthOfString(string, this._fontSize, options.features) +
        (options.characterSpacing || 0) * (string.length - 1)
    );
  },

  heightOfString(text, options) {
    const { x, y } = this;

    options = this._initOptions(options);
    options.height = Infinity; // don't break pages

    const lineGap = options.lineGap || this._lineGap || 0;
    this._text(text, this.x, this.y, options, () => {
      return (this.y += this.currentLineHeight(true) + lineGap);
    });

    const height = this.y - y;
    this.x = x;
    this.y = y;

    return height;
  },

  list(list, x, y, options, wrapper) {
    options = this._initOptions(x, y, options);

    const listType = options.listType || 'bullet';
    const unit = Math.round((this._font.ascender / 1000) * this._fontSize);
    const midLine = unit / 2;
    const r = options.bulletRadius || unit / 3;
    const indent =
        options.textIndent || (listType === 'bullet' ? r * 5 : unit * 2);
    const itemIndent =
        options.bulletIndent || (listType === 'bullet' ? r * 8 : unit * 2);

    let level = 1;
    const items = [];
    const levels = [];
    const numbers = [];

    var flatten = function(list) {
      let n = 1;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (Array.isArray(item)) {
          level++;
          flatten(item);
          level--;
        } else {
          items.push(item);
          levels.push(level);
          if (listType !== 'bullet') {
            numbers.push(n++);
          }
        }
      }
    };

    flatten(list);

    const label = function(n) {
      switch (listType) {
        case 'numbered':
          return `${n}.`;
        case 'lettered':
          var letter = String.fromCharCode(((n - 1) % 26) + 65);
          var times = Math.floor((n - 1) / 26 + 1);
          var text = Array(times + 1).join(letter);
          return `${text}.`;
      }
    };

    wrapper = new LineWrapper(this, options);
    wrapper.on('line', this._line);

    level = 1;
    let i = 0;
    wrapper.on('firstLine', () => {
      let item, itemType, labelType, bodyType;
      if (options.structParent) {
        if (options.structTypes) {
          [ itemType, labelType, bodyType ] = options.structTypes;
        } else {
          [ itemType, labelType, bodyType ] = [ 'LI', 'Lbl', 'LBody' ];
        }
      }

      if (itemType) {
        item = this.struct(itemType);
        options.structParent.add(item);
      } else if (options.structParent) {
        item = options.structParent;
      }

      let l;
      if ((l = levels[i++]) !== level) {
        const diff = itemIndent * (l - level);
        this.x += diff;
        wrapper.lineWidth -= diff;
        level = l;
      }

      if (item && (labelType || bodyType)) {
        item.add(this.struct(labelType || bodyType,
            [ this.markStructureContent(labelType || bodyType) ]));
      }
      switch (listType) {
        case 'bullet':
          this.circle(this.x - indent + r, this.y + midLine, r);
          this.fill();
          break;
        case 'numbered':
        case 'lettered':
          var text = label(numbers[i - 1]);
          this._fragment(text, this.x - indent, this.y, options);
          break;
      }

      if (item && labelType && bodyType) {
        item.add(this.struct(bodyType, [ this.markStructureContent(bodyType) ]));
      }
      if (item && item !== options.structParent) {
        item.end();
      }
    });

    wrapper.on('sectionStart', () => {
      const pos = indent + itemIndent * (level - 1);
      this.x += pos;
      return (wrapper.lineWidth -= pos);
    });

    wrapper.on('sectionEnd', () => {
      const pos = indent + itemIndent * (level - 1);
      this.x -= pos;
      return (wrapper.lineWidth += pos);
    });

    wrapper.wrap(items.join('\n'), options);

    return this;
  }

  _initOptions(x = {}, y, options = {}) {
    if (typeof x === 'object') {
      options = x;
      x = null;
    }

    // clone options object
    const result = Object.assign({}, options);

    // extend options with previous values for continued text
    if (this._textOptions) {
      for (let key in this._textOptions) {
        const val = this._textOptions[key];
        if (key !== 'continued') {
          if (result[key] === undefined) {
            result[key] = val;
          }
        }
      }
    }

    // Update the current position
    if (x != null) {
      this.x = x;
    }
    if (y != null) {
      this.y = y;
    }

    // wrap to margins if no x or y position passed
    if (result.lineBreak !== false) {
      if (result.width == null) {
        result.width = this.page.width - this.x - this.page.margins.right;
      }
      result.width = Math.max(result.width, 0);
    }

    if (!result.columns) {
      result.columns = 0;
    }
    if (result.columnGap == null) {
      result.columnGap = 18;
    } // 1/4 inch

    return result;
  },

  _line(text, options = {}, wrapper) {
    this._fragment(text, this.x, this.y, options);
    const lineGap = options.lineGap || this._lineGap || 0;

    if (!wrapper) {
      return (this.x += this.widthOfString(text));
    } else {
      return (this.y += this.currentLineHeight(true) + lineGap);
    }
  },

  _fragment(text, x, y, options) {
    let dy, encoded, i, positions, textWidth, words;
    text = `${text}`.replace(/\n/g, '');
    if (text.length === 0) {
      return;
    }

    // handle options
    const align = options.align || 'left';
    let wordSpacing = options.wordSpacing || 0;
    const characterSpacing = options.characterSpacing || 0;

    // text alignments
    if (options.width) {
      switch (align) {
        case 'right':
          textWidth = this.widthOfString(text.replace(/\s+$/, ''), options);
          x += options.lineWidth - textWidth;
          break;

        case 'center':
          x += options.lineWidth / 2 - options.textWidth / 2;
          break;

        case 'justify':
          // calculate the word spacing value
          words = text.trim().split(/\s+/);
          textWidth = this.widthOfString(text.replace(/\s+/g, ''), options);
          var spaceWidth = this.widthOfString(' ') + characterSpacing;
          wordSpacing = Math.max(
              0,
              (options.lineWidth - textWidth) / Math.max(1, words.length - 1) -
              spaceWidth
          );
          break;
      }
    }

    // text baseline alignments based on http://wiki.apache.org/xmlgraphics-fop/LineLayout/AlignmentHandling
    if (typeof options.baseline === 'number') {
      dy = -options.baseline;
    } else {
      switch (options.baseline) {
        case 'svg-middle':
          dy = 0.5 * this._font.xHeight;
          break;
        case 'middle':
        case 'svg-central':
          dy = 0.5 * (this._font.descender + this._font.ascender);
          break;
        case 'bottom':
        case 'ideographic':
          dy = this._font.descender;
          break;
        case 'alphabetic':
          dy = 0;
          break;
        case 'mathematical':
          dy = 0.5 * this._font.ascender;
          break;
        case 'hanging':
          dy = 0.8 * this._font.ascender;
          break;
        case 'top':
          dy = this._font.ascender;
          break;
        default:
          dy = this._font.ascender;
      }
      dy = (dy / 1000) * this._fontSize;
    }

    // calculate the actual rendered width of the string after word and character spacing
    const renderedWidth =
        options.textWidth +
        wordSpacing * (options.wordCount - 1) +
        characterSpacing * (text.length - 1);

    // create link annotations if the link option is given
    if (options.link != null) {
      this.link(x, y, renderedWidth, this.currentLineHeight(), options.link);
    }
    if (options.goTo != null) {
      this.goTo(x, y, renderedWidth, this.currentLineHeight(), options.goTo);
    }
    if (options.destination != null) {
      this.addNamedDestination(options.destination, 'XYZ', x, y, null);
    }

    // create underline
    if (options.underline) {
      this.save();
      if (!options.stroke) {
        this.strokeColor(...(this._fillColor || []));
      }

      const lineWidth =
          this._fontSize < 10 ? 0.5 : Math.floor(this._fontSize / 10);
      this.lineWidth(lineWidth);

      let lineY = (y + this.currentLineHeight())  - lineWidth
      this.moveTo(x, lineY);
      this.lineTo(x + renderedWidth, lineY);
      this.stroke();
      this.restore();
    }

    // create strikethrough line
    if (options.strike) {
      this.save();
      if (!options.stroke) {
        this.strokeColor(...(this._fillColor || []));
      }

      const lineWidth =
          this._fontSize < 10 ? 0.5 : Math.floor(this._fontSize / 10);
      this.lineWidth(lineWidth);

      let lineY = y + this.currentLineHeight() / 2;
      this.moveTo(x, lineY);
      this.lineTo(x + renderedWidth, lineY);
      this.stroke();
      this.restore();
    }

    this.save();

    // oblique (angle in degrees or boolean)
    if (options.oblique) {
      let skew;
      if (typeof options.oblique === 'number') {
        skew = -Math.tan((options.oblique * Math.PI) / 180);
      } else {
        skew = -0.25;
      }
      this.transform(1, 0, 0, 1, x, y);
      this.transform(1, 0, skew, 1, -skew * dy, 0);
      this.transform(1, 0, 0, 1, -x, -y);
    }

    // flip coordinate system
    this.transform(1, 0, 0, -1, 0, this.page.height);
    y = this.page.height - y - dy;

    // add current font to page if necessary
    if (this.page.fonts[this._font.id] == null) {
      this.page.fonts[this._font.id] = this._font.ref();
    }

    // begin the text object
    this.addContent('BT');

    // text position
    this.addContent(`1 0 0 1 ${number(x)} ${number(y)} Tm`);

    // font and font size
    this.addContent(`/${this._font.id} ${number(this._fontSize)} Tf`);

    // rendering mode
    const mode = options.fill && options.stroke ? 2 : options.stroke ? 1 : 0;
    if (mode) {
      this.addContent(`${mode} Tr`);
    }

    // Character spacing
    if (characterSpacing) {
      this.addContent(`${number(characterSpacing)} Tc`);
    }

    // Add the actual text
    // If we have a word spacing value, we need to encode each word separately
    // since the normal Tw operator only works on character code 32, which isn't
    // used for embedded fonts.
    if (wordSpacing) {
      words = text.trim().split(/\s+/);
      wordSpacing += this.widthOfString(' ') + characterSpacing;
      wordSpacing *= 1000 / this._fontSize;

      encoded = [];
      positions = [];
      for (let word of words) {
        const [encodedWord, positionsWord] = this._font.encode(
            word,
            options.features
        );
        encoded = encoded.concat(encodedWord);
        positions = positions.concat(positionsWord);

        // add the word spacing to the end of the word
        // clone object because of cache
        const space = {};
        const object = positions[positions.length - 1];
        for (let key in object) {
          const val = object[key];
          space[key] = val;
        }
        space.xAdvance += wordSpacing;
        positions[positions.length - 1] = space;
      }
    } else {
      [encoded, positions] = this._font.encode(text, options.features);
    }

    const scale = this._fontSize / 1000;
    const commands = [];
    let last = 0;
    let hadOffset = false;

    // Adds a segment of text to the TJ command buffer
    const addSegment = cur => {
      if (last < cur) {
        const hex = encoded.slice(last, cur).join('');
        const advance =
            positions[cur - 1].xAdvance - positions[cur - 1].advanceWidth;
        commands.push(`<${hex}> ${number(-advance)}`);
      }

      return (last = cur);
    };

    // Flushes the current TJ commands to the output stream
    const flush = i => {
      addSegment(i);

      if (commands.length > 0) {
        this.addContent(`[${commands.join(' ')}] TJ`);
        return (commands.length = 0);
      }
    };

    for (i = 0; i < positions.length; i++) {
      // If we have an x or y offset, we have to break out of the current TJ command
      // so we can move the text position.
      const pos = positions[i];
      if (pos.xOffset || pos.yOffset) {
        // Flush the current buffer
        flush(i);

        // Move the text position and flush just the current character
        this.addContent(
            `1 0 0 1 ${number(x + pos.xOffset * scale)} ${number(
                y + pos.yOffset * scale
            )} Tm`
        );
        flush(i + 1);

        hadOffset = true;
      } else {
        // If the last character had an offset, reset the text position
        if (hadOffset) {
          this.addContent(`1 0 0 1 ${number(x)} ${number(y)} Tm`);
          hadOffset = false;
        }

        // Group segments that don't have any advance adjustments
        if (pos.xAdvance - pos.advanceWidth !== 0) {
          addSegment(i + 1);
        }
      }

      x += pos.xAdvance * scale;
    }

    // Flush any remaining commands
    flush(i);

    // end the text object
    this.addContent('ET');

    // restore flipped coordinate system
    return this.restore();
  }
}


// TODO: Rework to actual Mixins
// const mixin = (methods: any) => {
//   Object.assign(PDFDocument.prototype, methods);
// };
//
// mixin(Color);
// mixin(Vector);
// mixin(FontsMixin);
// mixin(TextMixin);
// mixin(ImagesMixin);
// mixin(AnnotationsMixin);
// mixin(OutlineMixin);
// mixin(MarkingsMixin);
// mixin(AcroFormMixin);
// mixin(AttachmentsMixin);
