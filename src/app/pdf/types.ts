/*
 * Copyright (c) by Florian Plesker
 */
import { ReadableOptions } from 'stream';

export interface PDFOptions extends ReadableOptions {
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
