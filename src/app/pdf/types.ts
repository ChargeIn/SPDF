/*
 * Copyright (c) by Florian Plesker
 */
import { ReadableOptions } from 'stream';
import { PDFReference } from './reference';
import { PDFNameTree, PDFNumberTree } from './trees';
import { PDFStructureElement } from './structure_element';

export interface PDFOptions extends ReadableOptions {
  fontLayoutCache?: boolean;
  pdfVersion?: string;
  compress?: boolean;
  displayTitle?: string;
  lang?: number;
  info?: { [key: string]: any };
  font?: any;
  ownerPassword?: string;
  userPassword?: string;
  permissions?: PDFPermissions;
  autoFirstPage?: boolean;
  size?: string;
  layout?: string;
  margin?: number;
  margins?: PDFMargins;
  bufferPages?: boolean;
}

export interface PDFInfo {
  [key: string]: any;
  Producer?: string;
  Creator?: string;
  CreationDate: Date;
}

export interface PDFPermissions {
  printing?: string;
  modifying?: boolean;
  copying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  contentAccessibility?: boolean;
  documentAssembly?: boolean;
}

export interface UtilEncDict {
  Filter?: string;
  V?: any;
  Length?: any;
  CF?: any;
  StmF?: any;
  StrF?: any;
  R?: any;
  O?: any;
  OE?: any;
  U?: any;
  UE?: any;
  P?: any;
  Perms?: any;
}

export interface PDFMargins {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface AnnotateOptions {
  Type?: string;
  Rect?: [number, number, number, number];
  Border?: [number, number, number];
  Subtype?: string;
  F?: number;
  C?: number[];
  color?: string | number[];
  Dest?: string;
  Contents?: string;
  Name?: string;
  A?: PDFReference;
  FS?: PDFReference;
  DA?: string;
}

export interface FileSrcOptions {
  name?: string;
  type?: string;
  description?: string;
  creationDate?: Date;
  modifiedDate?: Date;
  hidden?: boolean;
}

export interface ImageOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  fit?: [number, number];
  cover?: [number, number];
  align?: string;
  valign?: string;
  link?: string;
  goTo?: string;
  destination?: string;
}

export interface MarkingOptions {
  mcid?: number;
  tagged?: boolean;
  type?: string;
  bbox?: [number, number, number, number];
  attached?: boolean;
  lang?: string;
  alt?: string;
  expanded?: string;
  actual?: string;
}

export interface TextOptions {
  wordSpacing?: boolean;
  structParent?: PDFStructureElement;
  structType?: string;
  width?: number;
  continued?: boolean;
  lineBreak?: boolean;
  lineGap?: number;
  columns?: number;
  columnGap?: number;
}

export type RefData =
  | ViewerPreferencesRefData
  | FileSpecRefData
  | RefBodyRefData
  | RootRefData
  | AcroformRefData
  | NamesRefData
  | PagesRefData
  | MarkingsRefData
  | FontRefData
  | DescFontRefData
  | AnnotationRefData;

export interface FileSpecRefData {
  Type: string;
  F: string;
  EF: { F: PDFReference };
  UF: string;
  Desc?: string;
}

export interface AcroformRefData {
  Fields: number[];
  NeedAppearances: boolean;
  DA: string;
  DR: {
    Font: any;
  };
}

export interface ViewerPreferencesRefData {
  DisplayDocTitle: boolean;
}

export interface RefBodyRefData {
  Type: string;
  Params: any;
  Subtype?: string;
}
export interface RootRefData {
  Type: string;
  Pages: PDFReference;
  Names: PDFReference;
}

export interface NamesRefData {
  Dests: PDFNameTree;
}

export interface PagesRefData {
  Types: string;
  Count: number;
  Kids: PDFReference[];
}

export interface MarkingsRefData {
  Type?: string;
  ParentTree?: PDFNumberTree;
  ParentTreeNextKey?: number;
}

export interface AnnotationRefData {
  S: string;
  D?: string | any[];
  URI?: string;
}

export interface FontRefData {
  Type: string;
  FontName: string;
  Flags: number;
  FontBBox: number[];
  ItalicAngle: number;
  Ascent: number;
  Descent: number;
  CapHeight: number;
  XHeight: number;
  StemV: number;
}

export interface DescFontRefData {
  Type: string;
  Subtype: string;
  BaseFont: string;
  CIDToGIDMap?: string;
  CIDSystemInfo: {
    Registry: string;
    Ordering: string;
    Supplement: number;
  };
  FontDescriptor: PDFReference;
  W: [0, number[]];
}
