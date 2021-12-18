//
// This script generates a UnicodeTrie containing shaping data derived
// from Unicode properties (currently just for the Arabic shaper).
//
import codepoints from 'codepoints';
import UnicodeTrieBuilder from 'unicode-trie/builder';
import { fs } from '../../../fs';

const ShapingClasses = {
  Non_Joining: 0,
  Left_Joining: 1,
  Right_Joining: 2,
  Dual_Joining: 3,
  Join_Causing: 3,
  ALAPH: 4,
  'DALATH RISH': 5,
  Transparent: 6,
};

const trie = new UnicodeTrieBuilder();
for (let i = 0; i < codepoints.length; i++) {
  const codepoint = codepoints[i];
  if (codepoint) {
    if (
      codepoint.joiningGroup === 'ALAPH' ||
      codepoint.joiningGroup === 'DALATH RISH'
    ) {
      trie.set(codepoint.code, ShapingClasses[codepoint.joiningGroup] + 1);
    } else if (codepoint.joiningType) {
      trie.set(codepoint.code, ShapingClasses[codepoint.joiningType] + 1);
    }
  }
}

fs.writeFileSync(__dirname + '/data.trie', trie.toBuffer());
