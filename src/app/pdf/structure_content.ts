/*
 * Original PDFKit - structure_content.js
 * By Ben Schmidt
 * Translated to ts by Florian Plesker
 */

import { PDFReference } from './reference';

export class PDFStructureContent {
  constructor(pageRef: PDFReference, mcid) {
    this.refs = [{ pageRef, mcid }];
  }

  push(structContent) {
    structContent.refs.forEach((ref) => this.refs.push(ref));
  }
}
