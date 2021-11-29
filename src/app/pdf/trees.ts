/*
 * Copyright (c) by Florian Plesker
 */
import { PDFTree } from './tree';

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
