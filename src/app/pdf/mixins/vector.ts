/*
 * Original PDFKit - vector.js
 * Translated to ts by Florian Plesker
 */

// Moved the content directly to the PDFDocument class since mixins are badly supported in ts.
// TODO: Rework content to mixins

export const _CAP_STYLES: { [key: string]: number } = {
  BUTT: 0,
  ROUND: 1,
  SQUARE: 2,
};

export const _JOIN_STYLES: { [key: string]: number } = {
  MITER: 0,
  ROUND: 1,
  BEVEL: 2,
};

// This constant is used to approximate a symmetrical arc using a cubic
// Bezier curve.
export const KAPPA = 4.0 * ((Math.sqrt(2) - 1.0) / 3.0);
