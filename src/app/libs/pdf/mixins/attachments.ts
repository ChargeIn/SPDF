/*
 * Original PDFKit - attachments.js
 * Translated to ts by Florian Plesker
 */

// Moved the content directly to the PDFDocument class since mixins are badly supported in ts.
// TODO: Rework content to mixins

/** check two embedded file metadata objects for equality */
export function isEqual(a, b) {
  return (
    a.Subtype === b.Subtype &&
    a.Params.CheckSum.toString() === b.Params.CheckSum.toString() &&
    a.Params.Size === b.Params.Size &&
    a.Params.CreationDate === b.Params.CreationDate &&
    a.Params.ModDate === b.Params.ModDate
  );
}
