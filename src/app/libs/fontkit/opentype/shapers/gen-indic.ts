import codepoints from 'codepoints';
import UnicodeTrieBuilder from 'unicode-trie/builder';
import compile from 'dfa/compile';
import { CATEGORIES, CONSONANT_FLAGS, POSITIONS } from './indic-data';
import { fs } from '../../../fs';

const CATEGORY_MAP = {
  Avagraha: 'Symbol',
  Bindu: 'SM',
  Brahmi_Joining_Number: 'Placeholder',
  Cantillation_Mark: 'A',
  Consonant: 'C',
  Consonant_Dead: 'C',
  Consonant_Final: 'CM',
  Consonant_Head_Letter: 'C',
  Consonant_Killer: 'M',
  Consonant_Medial: 'CM',
  Consonant_Placeholder: 'Placeholder',
  Consonant_Preceding_Repha: 'Repha',
  Consonant_Prefixed: 'X',
  Consonant_Subjoined: 'CM',
  Consonant_Succeeding_Repha: 'N',
  Consonant_With_Stacker: 'Repha',
  Gemination_Mark: 'SM',
  Invisible_Stacker: 'Coeng',
  Joiner: 'ZWJ',
  Modifying_Letter: 'X',
  Non_Joiner: 'ZWNJ',
  Nukta: 'N',
  Number: 'Placeholder',
  Number_Joiner: 'Placeholder',
  Pure_Killer: 'M',
  Register_Shifter: 'RS',
  Syllable_Modifier: 'M',
  Tone_Letter: 'X',
  Tone_Mark: 'N',
  Virama: 'H',
  Visarga: 'SM',
  Vowel: 'V',
  Vowel_Dependent: 'M',
  Vowel_Independent: 'V',
};

const OVERRIDES = {
  0x0953: 'SM',
  0x0954: 'SM',
  0x0a72: 'C',
  0x0a73: 'C',
  0x1cf5: 'C',
  0x1cf6: 'C',
  0x1ce2: 'A',
  0x1ce3: 'A',
  0x1ce4: 'A',
  0x1ce5: 'A',
  0x1ce6: 'A',
  0x1ce7: 'A',
  0x1ce8: 'A',
  0x1ced: 'A',
  0xa8f2: 'Symbol',
  0xa8f3: 'Symbol',
  0xa8f4: 'Symbol',
  0xa8f5: 'Symbol',
  0xa8f6: 'Symbol',
  0xa8f7: 'Symbol',
  0x1ce9: 'Symbol',
  0x1cea: 'Symbol',
  0x1ceb: 'Symbol',
  0x1cec: 'Symbol',
  0x1cee: 'Symbol',
  0x1cef: 'Symbol',
  0x1cf0: 'Symbol',
  0x1cf1: 'Symbol',
  0x17c6: 'N',
  0x2010: 'Placeholder',
  0x2011: 'Placeholder',
  0x25cc: 'Dotted_Circle',

  // Ra
  0x0930: 'Ra', // Devanagari
  0x09b0: 'Ra', // Bengali
  0x09f0: 'Ra', // Bengali
  0x0a30: 'Ra', // Gurmukhi - No Reph
  0x0ab0: 'Ra', // Gujarati
  0x0b30: 'Ra', // Oriya
  0x0bb0: 'Ra', // Tamil - No Reph
  0x0c30: 'Ra', // Telugu - Reph formed only with ZWJ
  0x0cb0: 'Ra', // Kannada
  0x0d30: 'Ra', // Malayalam - No Reph, Logical Repha
  0x0dbb: 'Ra', // Sinhala - Reph formed only with ZWJ
  0x179a: 'Ra', // Khmer - No Reph, Visual Repha
};

const POSITION_MAP = {
  Left: 'Pre_C',
  Top: 'Above_C',
  Bottom: 'Below_C',
  Right: 'Post_C',

  // These should resolve to the position of the last part of the split sequence.
  Bottom_And_Right: 'Post_C',
  Left_And_Right: 'Post_C',
  Top_And_Bottom: 'Below_C',
  Top_And_Bottom_And_Right: 'Post_C',
  Top_And_Left: 'Above_C',
  Top_And_Left_And_Right: 'Post_C',
  Top_And_Right: 'Post_C',

  Overstruck: 'After_Main',
  Visual_Order_Left: 'Pre_M',
};

function matraPosition(c, pos) {
  switch (pos) {
    case 'Pre_C':
      return 'Pre_M';

    case 'Post_C':
      switch (c.block) {
        case 'Devanagari':
          return 'After_Sub';
        case 'Bengali':
          return 'After_Post';
        case 'Gurmukhi':
          return 'After_Post';
        case 'Gujarati':
          return 'After_Post';
        case 'Oriya':
          return 'After_Post';
        case 'Tamil':
          return 'After_Post';
        case 'Telugu':
          return c.code <= 0x0c42 ? 'Before_Sub' : 'After_Sub';
        case 'Kannada':
          return c.code < 0x0cc3 || c.code > 0xcd6 ? 'Before_Sub' : 'After_Sub';
        case 'Malayalam':
          return 'After_Post';
        case 'Sinhala':
          return 'After_Sub';
        case 'Khmer':
          return 'After_Post';
        default:
          return 'After_Sub';
      }

    case 'Above_C':
      switch (c.block) {
        case 'Devanagari':
          return 'After_Sub';
        case 'Gurmukhi':
          return 'After_Post'; // Deviate from spec
        case 'Gujarati':
          return 'After_Sub';
        case 'Oriya':
          return 'After_Main';
        case 'Tamil':
          return 'After_Sub';
        case 'Telugu':
          return 'Before_Sub';
        case 'Kannada':
          return 'Before_Sub';
        case 'Sinhala':
          return 'After_Sub';
        case 'Khmer':
          return 'After_Post';
        default:
          return 'After_Sub';
      }

    case 'Below_C':
      switch (c.block) {
        case 'Devanagari':
          return 'After_Sub';
        case 'Bengali':
          return 'After_Sub';
        case 'Gurmukhi':
          return 'After_Post';
        case 'Gujarati':
          return 'After_Post';
        case 'Oriya':
          return 'After_Sub';
        case 'Tamil':
          return 'After_Post';
        case 'Telugu':
          return 'Before_Sub';
        case 'Kannada':
          return 'Before_Sub';
        case 'Malayalam':
          return 'After_Post';
        case 'Sinhala':
          return 'After_Sub';
        case 'Khmer':
          return 'After_Post';
        default:
          return 'After_Sub';
      }

    default:
      return pos;
  }
}

function getPosition(codepoint, category) {
  let position = POSITION_MAP[codepoint.indicPositionalCategory] || 'End';

  if (CATEGORIES[category] & CONSONANT_FLAGS) {
    position = 'Base_C';
  } else if (category === 'M') {
    position = matraPosition(codepoint, position);
  } else if (
    category === 'SM' ||
    category === 'VD' ||
    category === 'A' ||
    category === 'Symbol'
  ) {
    position = 'SMVD';
  }

  // Oriya Bindu is Before_Sub in the spec.
  if (codepoint.code === 0x0b01) {
    position = 'Before_Sub';
  }

  return Math.log2(POSITIONS[position]);
}

const symbols = {};
for (const c in CATEGORIES) {
  symbols[c] = Math.log2(CATEGORIES[c]);
}

const trie = new UnicodeTrieBuilder();
for (let i = 0; i < codepoints.length; i++) {
  const codepoint = codepoints[i];
  if (codepoint) {
    const category =
      OVERRIDES[codepoint.code] ||
      CATEGORY_MAP[codepoint.indicSyllabicCategory] ||
      'X';
    const position = getPosition(codepoint, category);

    trie.set(codepoint.code, (symbols[category] << 8) | position);
  }
}

fs.writeFileSync(__dirname + '/indic.trie', trie.toBuffer());

const stateMachine = compile(
  fs.readFileSync(__dirname + '/indic.machine', 'utf8'),
  symbols
);
fs.writeFileSync(__dirname + '/indic.json', JSON.stringify(stateMachine));
