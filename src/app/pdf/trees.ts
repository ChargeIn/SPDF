/*
 * Copyright (c) by Florian Plesker
 */
import { PDFObject } from './object';
/* eslint-disable radix */
// eslint-disable-next-line @typescript-eslint/ban-types
export abstract class PDFTree<T> {
  private readonly _items: { [key: string]: T } = {};
  private readonly _limits;

  constructor(options: { limits?: any } = {}) {
    this._items = {};
    // disable /Limits output for this tree
    this._limits = typeof options.limits === 'boolean' ? options.limits : true;
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
    if (this._limits && sortedKeys.length > 1) {
      const first = sortedKeys[0];
      const last = sortedKeys[sortedKeys.length - 1];
      out.push(
        `  /Limits ${PDFObject.convert([
          this._dataForKey(first),
          this._dataForKey(last),
        ])}`
      );
    }
    out.push(`  /${this._keysName()} [`);
    for (const key of sortedKeys) {
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

export class PDFNameTree extends PDFTree<String> {
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

export class PDFNumberTree extends PDFTree<number> {
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
