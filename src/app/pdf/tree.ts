/*
 * Original PDFKit - tree.js/name_tree.js
 * Copyright (c) by Florian Plesker
 */
import { PDFObject } from './object';

export abstract class PDFTree<T> {
  private readonly _items: { [key: string]: T } = {};
  private readonly limits;

  constructor(options: { limits?: any } = {}) {
    this._items = {};
    // disable /Limits output for this tree
    this.limits = typeof options.limits === 'boolean' ? options.limits : true;
  }

  add(key: string, val: any) {
    return (this._items[key] = val);
  }

  get(key: string) {
    return this._items[key];
  }

  toString() {
    // Needs to be sorted by key
    const sortedKeys = Object.keys(this._items).sort((a, b) =>
      this._compareKeys(a, b)
    );

    const out = ['<<'];
    if (this.limits && sortedKeys.length > 1) {
      const first = sortedKeys[0],
        last = sortedKeys[sortedKeys.length - 1];
      out.push(
        `  /Limits ${PDFObject.convert([
          this._dataForKey(first),
          this._dataForKey(last),
        ])}`
      );
    }
    out.push(`  /${this._keysName()} [`);
    for (let key of sortedKeys) {
      out.push(
        `    ${PDFObject.convert(this._dataForKey(key))} ${PDFObject.convert(
          this._items[key]
        )}`
      );
    }
    out.push(']');
    out.push('>>');
    return out.join('\n');
  }

  abstract _compareKeys(a: string, b: string): number;

  abstract _keysName(): string;

  abstract _dataForKey(key: string): T;
}

export class PDFNameTree extends PDFTree<string> {
  _compareKeys(a: string, b: string) {
    return a.localeCompare(b);
  }

  _keysName() {
    return 'Names';
  }

  _dataForKey(k: string) {
    return String(k);
  }
}

class PDFNumberTree extends PDFTree<number> {
  _compareKeys(a: string, b: string) {
    return parseInt(a) - parseInt(b);
  }

  _keysName() {
    return 'Nums';
  }

  _dataForKey(k: string) {
    return parseInt(k);
  }
}
