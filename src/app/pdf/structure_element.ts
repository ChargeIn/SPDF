/*
 * Original PDFKit - structure_element.js
 * By Ben Schmidt
 * Translated to ts by Florian Plesker
 */

import { PDFDocument } from './document';
import { PDFReference } from './reference';
import { PDFStructureContent } from './structure_content';

export class PDFStructureElement {
  private _document: PDFDocument;
  private _attached: boolean;
  private _ended: boolean;
  private _flushed: boolean;
  private readonly _dictionary: PDFReference;
  private _children: any;
  constructor(
    document,
    type,
    options: {
      title?: string;
      lang?: any;
      alt?: any;
      expanded?: boolean;
      actual?: any;
    } = {},
    children = null
  ) {
    this._document = document;

    this._attached = false;
    this._ended = false;
    this._flushed = false;
    this._dictionary = document.ref({
      // Type: "StructElem",
      S: type,
    });

    const data = this._dictionary.data;

    if (Array.isArray(options) || this._isValidChild(options)) {
      children = options;
      options = {};
    }

    if (typeof options.title !== 'undefined') {
      data.T = String(options.title);
    }
    if (typeof options.lang !== 'undefined') {
      data.Lang = String(options.lang);
    }
    if (typeof options.alt !== 'undefined') {
      data.Alt = String(options.alt);
    }
    if (typeof options.expanded !== 'undefined') {
      data.E = String(options.expanded);
    }
    if (typeof options.actual !== 'undefined') {
      data.ActualText = String(options.actual);
    }

    this._children = [];

    if (children) {
      if (!Array.isArray(children)) {
        children = [children];
      }
      children.forEach((child) => this.add(child));
      this.end();
    }
  }

  add(child) {
    if (this._ended) {
      throw new Error(`Cannot add child to already-ended structure element`);
    }

    if (!this._isValidChild(child)) {
      throw new Error(`Invalid structure element child`);
    }

    if (child instanceof PDFStructureElement) {
      child.setParent(this._dictionary);
      if (this._attached) {
        child.setAttached();
      }
    }

    if (child instanceof PDFStructureContent) {
      this._addContentToParentTree(child);
    }

    if (typeof child === 'function' && this._attached) {
      // _contentForClosure() adds the content to the parent tree
      child = this._contentForClosure(child);
    }

    this._children.push(child);

    return this;
  }

  _addContentToParentTree(content) {
    content.refs.forEach(({ pageRef, mcid }) => {
      const pageStructParents = this._document
        .getStructParentTree()
        .get(pageRef.data.StructParents);
      pageStructParents[mcid] = this._dictionary;
    });
  }

  setParent(parentRef) {
    if (this._dictionary.data.P) {
      throw new Error(`Structure element added to more than one parent`);
    }

    this._dictionary.data.P = parentRef;

    this._flush();
  }

  setAttached() {
    if (this._attached) {
      return;
    }

    this._children.forEach((child, index) => {
      if (child instanceof PDFStructureElement) {
        child.setAttached();
      }
      if (typeof child === 'function') {
        this._children[index] = this._contentForClosure(child);
      }
    });

    this._attached = true;

    this._flush();
  }

  end() {
    if (this._ended) {
      return;
    }

    this._children
      .filter((child) => child instanceof PDFStructureElement)
      .forEach((child) => child.end());

    this._ended = true;

    this._flush();
  }

  _isValidChild(child) {
    return (
      child instanceof PDFStructureElement ||
      child instanceof PDFStructureContent ||
      typeof child === 'function'
    );
  }

  _contentForClosure(closure) {
    const content = this._document.markStructureContent(
      this._dictionary.data.S
    );
    closure();
    this._document.endMarkedContent();

    this._addContentToParentTree(content);

    return content;
  }

  _isFlushable() {
    if (!this._dictionary.data.P || !this._ended) {
      return false;
    }

    return this._children.every((child) => {
      if (typeof child === 'function') {
        return false;
      }
      if (child instanceof PDFStructureElement) {
        return child._isFlushable();
      }
      return true;
    });
  }

  _flush() {
    if (this._flushed || !this._isFlushable()) {
      return;
    }

    this._dictionary.data.K = [];

    this._children.forEach((child) => this._flushChild(child));

    this._dictionary.end();

    // free memory used by children; the dictionary itself may still be
    // referenced by a parent structure element or root, but we can
    // at least trim the tree here
    this._children = [];
    this._dictionary.data.K = null;

    this._flushed = true;
  }

  _flushChild(child) {
    if (child instanceof PDFStructureElement) {
      this._dictionary.data.K.push(child._dictionary);
    }

    if (child instanceof PDFStructureContent) {
      child.refs.forEach(({ pageRef, mcid }) => {
        if (!this._dictionary.data.Pg) {
          this._dictionary.data.Pg = pageRef;
        }

        if (this._dictionary.data.Pg === pageRef) {
          this._dictionary.data.K.push(mcid);
        } else {
          this._dictionary.data.K.push({
            Type: 'MCR',
            Pg: pageRef,
            MCID: mcid,
          });
        }
      });
    }
  }
}
