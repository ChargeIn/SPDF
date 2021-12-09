/*
 * Original PDFKit - acroform.js
 * Translated to ts by Florian Plesker
 */

// Moved the content directly to the PDFDocument class since mixins are badly supported in ts.
// TODO: Rework content to mixins

export const FIELD_FLAGS: { [key: string]: number } = {
  readOnly: 1,
  required: 2,
  noExport: 4,
  multiline: 0x1000,
  password: 0x2000,
  toggleToOffButton: 0x4000,
  radioButton: 0x8000,
  pushButton: 0x10000,
  combo: 0x20000,
  edit: 0x40000,
  sort: 0x80000,
  multiSelect: 0x200000,
  noSpell: 0x400000,
};

export const FIELD_JUSTIFY: { [key: string]: number } = {
  left: 0,
  center: 1,
  right: 2,
};

export const VALUE_MAP = { value: 'V', defaultValue: 'DV' };
export const FORMAT_SPECIAL = {
  zip: '0',
  zipPlus4: '1',
  zip4: '1',
  phone: '2',
  ssn: '3',
};

export const FORMAT_DEFAULT = {
  // eslint-disable-next-line id-blacklist
  number: {
    nDec: 0,
    sepComma: false,
    negStyle: 'MinusBlack',
    currency: '',
    currencyPrepend: true,
  },
  percent: {
    nDec: 0,
    sepComma: false,
  },
};
