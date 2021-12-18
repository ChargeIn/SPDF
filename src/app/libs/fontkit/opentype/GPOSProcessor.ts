import OTProcessor from './OTProcessor';

export default class GPOSProcessor extends OTProcessor {
  applyPositionValue(sequenceIndex, value) {
    const position =
      this.positions[this.glyphIterator.peekIndex(sequenceIndex)];
    if (value.xAdvance != null) {
      position.xAdvance += value.xAdvance;
    }

    if (value.yAdvance != null) {
      position.yAdvance += value.yAdvance;
    }

    if (value.xPlacement != null) {
      position.xOffset += value.xPlacement;
    }

    if (value.yPlacement != null) {
      position.yOffset += value.yPlacement;
    }

    // Adjustments for font variations
    const variationProcessor = this.font._variationProcessor;
    const variationStore = this.font.GDEF && this.font.GDEF.itemVariationStore;
    if (variationProcessor && variationStore) {
      if (value.xPlaDevice) {
        position.xOffset += variationProcessor.getDelta(
          variationStore,
          value.xPlaDevice.a,
          value.xPlaDevice.b
        );
      }

      if (value.yPlaDevice) {
        position.yOffset += variationProcessor.getDelta(
          variationStore,
          value.yPlaDevice.a,
          value.yPlaDevice.b
        );
      }

      if (value.xAdvDevice) {
        position.xAdvance += variationProcessor.getDelta(
          variationStore,
          value.xAdvDevice.a,
          value.xAdvDevice.b
        );
      }

      if (value.yAdvDevice) {
        position.yAdvance += variationProcessor.getDelta(
          variationStore,
          value.yAdvDevice.a,
          value.yAdvDevice.b
        );
      }
    }

    // TODO: device tables
  }

  applyLookup(lookupType, table) {
    switch (lookupType) {
      case 1: {
        // Single positioning value
        const index = this.coverageIndex(table.coverage);
        if (index === -1) {
          return false;
        }

        switch (table.version) {
          case 1:
            this.applyPositionValue(0, table.value);
            break;

          case 2:
            this.applyPositionValue(0, table.values.get(index));
            break;
        }

        return true;
      }

      case 2: {
        // Pair Adjustment Positioning
        const nextGlyph = this.glyphIterator.peek();
        if (!nextGlyph) {
          return false;
        }

        const index = this.coverageIndex(table.coverage);
        if (index === -1) {
          return false;
        }

        switch (table.version) {
          case 1: // Adjustments for glyph pairs
            const set = table.pairSets.get(index);

            for (const pair of set) {
              if (pair.secondGlyph === nextGlyph.id) {
                this.applyPositionValue(0, pair.value1);
                this.applyPositionValue(1, pair.value2);
                return true;
              }
            }

            return false;

          case 2: // Class pair adjustment
            const class1 = this.getClassID(
              this.glyphIterator.cur.id,
              table.classDef1
            );
            const class2 = this.getClassID(nextGlyph.id, table.classDef2);
            if (class1 === -1 || class2 === -1) {
              return false;
            }

            const pair = table.classRecords.get(class1).get(class2);
            this.applyPositionValue(0, pair.value1);
            this.applyPositionValue(1, pair.value2);
            return true;
        }
      }

      case 3: {
        // Cursive Attachment Positioning
        const nextIndex = this.glyphIterator.peekIndex();
        const nextGlyph = this.glyphs[nextIndex];
        if (!nextGlyph) {
          return false;
        }

        const curRecord =
          table.entryExitRecords[this.coverageIndex(table.coverage)];
        if (!curRecord || !curRecord.exitAnchor) {
          return false;
        }

        const nextRecord =
          table.entryExitRecords[
            this.coverageIndex(table.coverage, nextGlyph.id)
          ];
        if (!nextRecord || !nextRecord.entryAnchor) {
          return false;
        }

        const entry = this.getAnchor(nextRecord.entryAnchor);
        const exit = this.getAnchor(curRecord.exitAnchor);

        const cur = this.positions[this.glyphIterator.index];
        const next = this.positions[nextIndex];

        switch (this.direction) {
          case 'ltr':
            cur.xAdvance = exit.x + cur.xOffset;

            let d = entry.x + next.xOffset;
            next.xAdvance -= d;
            next.xOffset -= d;
            break;

          case 'rtl':
            d = exit.x + cur.xOffset;
            cur.xAdvance -= d;
            cur.xOffset -= d;
            next.xAdvance = entry.x + next.xOffset;
            break;
        }

        if (this.glyphIterator.flags.rightToLeft) {
          this.glyphIterator.cur.cursiveAttachment = nextIndex;
          cur.yOffset = entry.y - exit.y;
        } else {
          nextGlyph.cursiveAttachment = this.glyphIterator.index;
          cur.yOffset = exit.y - entry.y;
        }

        return true;
      }

      case 4: {
        // Mark to base positioning
        const markIndex = this.coverageIndex(table.markCoverage);
        if (markIndex === -1) {
          return false;
        }

        // search backward for a base glyph
        let baseGlyphIndex = this.glyphIterator.index;
        while (
          --baseGlyphIndex >= 0 &&
          (this.glyphs[baseGlyphIndex].isMark ||
            this.glyphs[baseGlyphIndex].ligatureComponent > 0)
        ) {}

        if (baseGlyphIndex < 0) {
          return false;
        }

        const baseIndex = this.coverageIndex(
          table.baseCoverage,
          this.glyphs[baseGlyphIndex].id
        );
        if (baseIndex === -1) {
          return false;
        }

        const markRecord = table.markArray[markIndex];
        const baseAnchor = table.baseArray[baseIndex][markRecord.class];
        this.applyAnchor(markRecord, baseAnchor, baseGlyphIndex);
        return true;
      }

      case 5: {
        // Mark to ligature positioning
        const markIndex = this.coverageIndex(table.markCoverage);
        if (markIndex === -1) {
          return false;
        }

        // search backward for a base glyph
        let baseGlyphIndex = this.glyphIterator.index;
        while (--baseGlyphIndex >= 0 && this.glyphs[baseGlyphIndex].isMark) {}

        if (baseGlyphIndex < 0) {
          return false;
        }

        const ligIndex = this.coverageIndex(
          table.ligatureCoverage,
          this.glyphs[baseGlyphIndex].id
        );
        if (ligIndex === -1) {
          return false;
        }

        const ligAttach = table.ligatureArray[ligIndex];
        const markGlyph = this.glyphIterator.cur;
        const ligGlyph = this.glyphs[baseGlyphIndex];
        const compIndex =
          ligGlyph.ligatureID &&
          ligGlyph.ligatureID === markGlyph.ligatureID &&
          markGlyph.ligatureComponent > 0
            ? Math.min(
                markGlyph.ligatureComponent,
                ligGlyph.codePoints.length
              ) - 1
            : ligGlyph.codePoints.length - 1;

        const markRecord = table.markArray[markIndex];
        const baseAnchor = ligAttach[compIndex][markRecord.class];
        this.applyAnchor(markRecord, baseAnchor, baseGlyphIndex);
        return true;
      }

      case 6: {
        // Mark to mark positioning
        const mark1Index = this.coverageIndex(table.mark1Coverage);
        if (mark1Index === -1) {
          return false;
        }

        // get the previous mark to attach to
        const prevIndex = this.glyphIterator.peekIndex(-1);
        const prev = this.glyphs[prevIndex];
        if (!prev || !prev.isMark) {
          return false;
        }

        const cur = this.glyphIterator.cur;

        // The following logic was borrowed from Harfbuzz
        let good = false;
        if (cur.ligatureID === prev.ligatureID) {
          if (!cur.ligatureID) {
            // Marks belonging to the same base
            good = true;
          } else if (cur.ligatureComponent === prev.ligatureComponent) {
            // Marks belonging to the same ligature component
            good = true;
          }
        } else {
          // If ligature ids don't match, it may be the case that one of the marks
          // itself is a ligature, in which case match.
          if (
            (cur.ligatureID && !cur.ligatureComponent) ||
            (prev.ligatureID && !prev.ligatureComponent)
          ) {
            good = true;
          }
        }

        if (!good) {
          return false;
        }

        const mark2Index = this.coverageIndex(table.mark2Coverage, prev.id);
        if (mark2Index === -1) {
          return false;
        }

        const markRecord = table.mark1Array[mark1Index];
        const baseAnchor = table.mark2Array[mark2Index][markRecord.class];
        this.applyAnchor(markRecord, baseAnchor, prevIndex);
        return true;
      }

      case 7: // Contextual positioning
        return this.applyContext(table);

      case 8: // Chaining contextual positioning
        return this.applyChainingContext(table);

      case 9: // Extension positioning
        return this.applyLookup(table.lookupType, table.extension);

      default:
        throw new Error(`Unsupported GPOS table: ${lookupType}`);
    }
  }

  applyAnchor(markRecord, baseAnchor, baseGlyphIndex) {
    const baseCoords = this.getAnchor(baseAnchor);
    const markCoords = this.getAnchor(markRecord.markAnchor);

    const basePos = this.positions[baseGlyphIndex];
    const markPos = this.positions[this.glyphIterator.index];

    markPos.xOffset = baseCoords.x - markCoords.x;
    markPos.yOffset = baseCoords.y - markCoords.y;
    this.glyphIterator.cur.markAttachment = baseGlyphIndex;
  }

  getAnchor(anchor) {
    // TODO: contour point, device tables
    let x = anchor.xCoordinate;
    let y = anchor.yCoordinate;

    // Adjustments for font variations
    const variationProcessor = this.font._variationProcessor;
    const variationStore = this.font.GDEF && this.font.GDEF.itemVariationStore;
    if (variationProcessor && variationStore) {
      if (anchor.xDeviceTable) {
        x += variationProcessor.getDelta(
          variationStore,
          anchor.xDeviceTable.a,
          anchor.xDeviceTable.b
        );
      }

      if (anchor.yDeviceTable) {
        y += variationProcessor.getDelta(
          variationStore,
          anchor.yDeviceTable.a,
          anchor.yDeviceTable.b
        );
      }
    }

    return { x, y };
  }

  applyFeatures(userFeatures, glyphs, advances) {
    super.applyFeatures(userFeatures, glyphs, advances);

    for (let i = 0; i < this.glyphs.length; i++) {
      this.fixCursiveAttachment(i);
    }

    this.fixMarkAttachment();
  }

  fixCursiveAttachment(i) {
    const glyph = this.glyphs[i];
    if (glyph.cursiveAttachment != null) {
      const j = glyph.cursiveAttachment;

      glyph.cursiveAttachment = null;
      this.fixCursiveAttachment(j);

      this.positions[i].yOffset += this.positions[j].yOffset;
    }
  }

  fixMarkAttachment() {
    for (let i = 0; i < this.glyphs.length; i++) {
      const glyph = this.glyphs[i];
      if (glyph.markAttachment != null) {
        const j = glyph.markAttachment;

        this.positions[i].xOffset += this.positions[j].xOffset;
        this.positions[i].yOffset += this.positions[j].yOffset;

        if (this.direction === 'ltr') {
          for (let k = j; k < i; k++) {
            this.positions[i].xOffset -= this.positions[k].xAdvance;
            this.positions[i].yOffset -= this.positions[k].yAdvance;
          }
        } else {
          for (let k = j + 1; k < i + 1; k++) {
            this.positions[i].xOffset += this.positions[k].xAdvance;
            this.positions[i].yOffset += this.positions[k].yAdvance;
          }
        }
      }
    }
  }
}
