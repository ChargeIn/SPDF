/*
 * Original PDFKit - outline.js
 * Translated to ts by Florian Plesker
 */
import { PDFDocument } from './document';
import { PDFReference } from './reference';

export class PDFOutline {
  dictionary: PDFReference;
  children: PDFOutline[];
  private readonly _document: PDFDocument;
  private _options: { expanded: boolean };
  private readonly _outlineData: {
    Dest?: any[];
    Parent?: PDFReference;
    Title?: string;
    First?: PDFReference;
    Last?: PDFReference;
    Count?: number;
    Prev?: PDFReference;
    Next?: PDFReference;
  };
  constructor(document, parent, title, dest, options = { expanded: false }) {
    this._document = document;
    this._options = options;
    this._outlineData = {};

    if (dest !== null) {
      this._outlineData.Dest = [dest._dictionary, 'Fit'];
    }

    if (parent !== null) {
      this._outlineData.Parent = parent;
    }

    if (title !== null) {
      this._outlineData.Title = String(title);
    }

    this.dictionary = this._document.ref(this._outlineData);
    this.children = [];
  }

  addItem(title, options = { expanded: false }) {
    const result = new PDFOutline(
      this._document,
      this.dictionary,
      title,
      this._document.page,
      options
    );
    this.children.push(result);

    return result;
  }

  endOutline() {
    if (this.children.length > 0) {
      if (this._options.expanded) {
        this._outlineData.Count = this.children.length;
      }

      const first = this.children[0];
      const last = this.children[this.children.length - 1];
      this._outlineData.First = first.dictionary;
      this._outlineData.Last = last.dictionary;

      for (let i = 0, len = this.children.length; i < len; i++) {
        const child = this.children[i];
        if (i > 0) {
          child._outlineData.Prev = this.children[i - 1].dictionary;
        }
        if (i < this.children.length - 1) {
          child._outlineData.Next = this.children[i + 1].dictionary;
        }
        child.endOutline();
      }
    }

    return this.dictionary.end();
  }
}
