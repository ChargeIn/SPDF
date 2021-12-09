/*
 * Original PDFKit - line_wrapper.js
 * Translated to ts by Florian Plesker
 */
import { EventEmitter } from 'events';
import LineBreaker from 'linebreak';
import { PDFDocument } from './document';

export class LineWrapper extends EventEmitter {
  private readonly _document: PDFDocument;
  private _indent: number;
  private _characterSpacing: number;
  private _wordSpacing: boolean;
  private readonly _columns: number;
  private readonly _columnGap: number;
  private _lineWidth: number;
  private _spaceLeft: number;
  private readonly _startX: number;
  private _startY: number;
  private _column: number;
  private _ellipsis: any;
  private _continuedX: number;
  private _features: any;
  private readonly _height: number;
  private _maxY: number;
  private _lastLine: boolean;
  constructor(document: PDFDocument, options) {
    super();
    this._document = document;
    this._indent = options._indent || 0;
    this._characterSpacing = options._characterSpacing || 0;
    this._wordSpacing = options._wordSpacing === 0;
    this._columns = options._columns || 1;
    this._columnGap = options._columnGap != null ? options._columnGap : 18; // 1/4 inch
    this._lineWidth =
      (options.width - this._columnGap * (this._columns - 1)) / this._columns;
    this._spaceLeft = this._lineWidth;
    this._startX = this._document.x;
    this._startY = this._document.y;
    this._column = 1;
    this._ellipsis = options._ellipsis;
    this._continuedX = 0;
    this._features = options._features;

    // calculate the maximum Y position the text can appear at
    if (options._height != null) {
      this._height = options._height;
      this._maxY = this._startY + options._height;
    } else {
      this._maxY = this._document.page.maxY();
    }

    // handle paragraph indents
    this.on('firstLine', (opt) => {
      // if this is the first line of the text segment, and
      // we're continuing where we left off, indent that much
      // otherwise use the user specified indent option
      const indent = this._continuedX || this._indent;
      this._document.x += indent;
      this._lineWidth -= indent;

      return this.once('line', () => {
        this._document.x -= indent;
        this._lineWidth += indent;
        if (opt.continued && !this._continuedX) {
          this._continuedX = this._indent;
        }
        if (!opt.continued) {
          return (this._continuedX = 0);
        }
      });
    });

    // handle left aligning last lines of paragraphs
    this.on('lastLine', (opt) => {
      const { align } = opt;
      if (align === 'justify') {
        opt.align = 'left';
      }
      this._lastLine = true;

      return this.once('line', () => {
        this._document.y += opt.paragraphGap || 0;
        opt.align = align;
        return (this._lastLine = false);
      });
    });
  }

  wordWidth(word) {
    return (
      this._document.widthOfString(word, this) +
      this._characterSpacing +
      this._wordSpacing
    );
  }

  eachWord(text, fn) {
    // setup a unicode line breaker
    let bk;
    const breaker = new LineBreaker(text);
    let last = null;
    const wordWidths = Object.create(null);

    while ((bk = breaker.nextBreak())) {
      let shouldContinue;
      let word = text.slice(
        (last != null ? last.position : undefined) || 0,
        bk.position
      );
      let w =
        wordWidths[word] != null
          ? wordWidths[word]
          : (wordWidths[word] = this.wordWidth(word));

      // if the word is longer than the whole line, chop it up
      // TODO: break by grapheme clusters, not JS string characters
      if (w > this._lineWidth + this._continuedX) {
        // make some fake break objects
        let lbk = last;
        const fbk: { required?: boolean } = {};

        while (word.length) {
          // fit as much of the word as possible into the space we have
          let l;
          let mightGrow;
          if (w > this._spaceLeft) {
            // start our check at the end of our available space - this method is faster than a loop of each character and it resolves
            // an issue with long loops when processing massive words, such as a huge number of spaces
            l = Math.ceil(this._spaceLeft / (w / word.length));
            w = this.wordWidth(word.slice(0, l));
            mightGrow = w <= this._spaceLeft && l < word.length;
          } else {
            l = word.length;
          }
          let mustShrink = w > this._spaceLeft && l > 0;
          // shrink or grow word as necessary after our near-guess above
          while (mustShrink || mightGrow) {
            if (mustShrink) {
              w = this.wordWidth(word.slice(0, --l));
              mustShrink = w > this._spaceLeft && l > 0;
            } else {
              w = this.wordWidth(word.slice(0, ++l));
              mustShrink = w > this._spaceLeft && l > 0;
              mightGrow = w <= this._spaceLeft && l < word.length;
            }
          }

          // check for the edge case where a single character cannot fit into a line.
          if (l === 0 && this._spaceLeft === this._lineWidth) {
            l = 1;
          }

          // send a required break unless this is the last piece and a linebreak is not specified
          fbk.required = bk.required || l < word.length;
          shouldContinue = fn(word.slice(0, l), w, fbk, lbk);
          lbk = { required: false };

          // get the remaining piece of the word
          word = word.slice(l);
          w = this.wordWidth(word);

          if (shouldContinue === false) {
            break;
          }
        }
      } else {
        // otherwise just emit the break as it was given to us
        shouldContinue = fn(word, w, bk, last);
      }

      if (shouldContinue === false) {
        break;
      }
      last = bk;
    }
  }

  wrap(text, options) {
    // override options from previous continued fragments
    if (options._indent != null) {
      this._indent = options._indent;
    }
    if (options._characterSpacing != null) {
      this._characterSpacing = options._characterSpacing;
    }
    if (options._wordSpacing != null) {
      this._wordSpacing = options._wordSpacing;
    }
    if (options._ellipsis != null) {
      this._ellipsis = options._ellipsis;
    }

    // make sure we're actually on the page
    // and that the first line of is never by
    // itself at the bottom of a page (orphans)
    const nextY = this._document.y + this._document.currentLineHeight(true);
    if (this._document.y > this._maxY || nextY > this._maxY) {
      this.nextSection();
    }

    let buffer = '';
    let textWidth = 0;
    let wc = 0;
    let lc = 0;

    let { y } = this._document; // used to reset Y pos if options.continued (below)
    const emitLine = () => {
      options.textWidth = textWidth + +this._wordSpacing * (wc - 1);
      options.wordCount = wc;
      options.lineWidth = this._lineWidth;
      ({ y } = this._document);
      this.emit('line', buffer, options, this);
      return lc++;
    };

    this.emit('sectionStart', options, this);

    this.eachWord(text, (word, w, bk, last) => {
      if (last == null || last.required) {
        this.emit('firstLine', options, this);
        this._spaceLeft = this._lineWidth;
      }

      if (w <= this._spaceLeft) {
        buffer += word;
        textWidth += w;
        wc++;
      }

      if (bk.required || w > this._spaceLeft) {
        // if the user specified a max height and an ellipsis, and is about to pass the
        // max height and max columns after the next line, append the ellipsis
        const lh = this._document.currentLineHeight(true);
        if (
          this._height != null &&
          this._ellipsis &&
          this._document.y + lh * 2 > this._maxY &&
          this._column >= this._columns
        ) {
          if (this._ellipsis === true) {
            this._ellipsis = '…';
          } // map default ellipsis character
          buffer = buffer.replace(/\s+$/, '');
          textWidth = this.wordWidth(buffer + this._ellipsis);

          // remove characters from the buffer until the ellipsis fits
          // to avoid infinite loop need to stop while-loop if buffer is empty string
          while (buffer && textWidth > this._lineWidth) {
            buffer = buffer.slice(0, -1).replace(/\s+$/, '');
            textWidth = this.wordWidth(buffer + this._ellipsis);
          }
          // need to add ellipsis only if there is enough space for it
          if (textWidth <= this._lineWidth) {
            buffer = buffer + this._ellipsis;
          }

          textWidth = this.wordWidth(buffer);
        }

        if (bk.required) {
          if (w > this._spaceLeft) {
            emitLine();
            buffer = word;
            textWidth = w;
            wc = 1;
          }

          this.emit('lastLine', options, this);
        }

        emitLine();

        // if we've reached the edge of the page,
        // continue on a new page or column
        if (this._document.y + lh > this._maxY) {
          const shouldContinue = this.nextSection();

          // stop if we reached the maximum height
          if (!shouldContinue) {
            wc = 0;
            buffer = '';
            return false;
          }
        }

        // reset the space left and buffer
        if (bk.required) {
          this._spaceLeft = this._lineWidth;
          buffer = '';
          textWidth = 0;
          return (wc = 0);
        } else {
          // reset the space left and buffer
          this._spaceLeft = this._lineWidth - w;
          buffer = word;
          textWidth = w;
          return (wc = 1);
        }
      } else {
        return (this._spaceLeft -= w);
      }
    });

    if (wc > 0) {
      this.emit('lastLine', options, this);
      emitLine();
    }

    this.emit('sectionEnd', options, this);

    // if the wrap is set to be continued, save the X position
    // to start the first line of the next segment at, and reset
    // the y position
    if (options.continued === true) {
      if (lc > 1) {
        this._continuedX = 0;
      }
      this._continuedX += options.textWidth || 0;
      return (this._document.y = y);
    } else {
      return (this._document.x = this._startX);
    }
  }

  nextSection(options?: any) {
    this.emit('sectionEnd', options, this);

    if (++this._column > this._columns) {
      // if a max height was specified by the user, we're done.
      // otherwise, the default is to make a new page at the bottom.
      if (this._height != null) {
        return false;
      }

      this._document.continueOnNewPage();
      this._column = 1;
      this._startY = this._document.page.margins.top;
      this._maxY = this._document.page.maxY();
      this._document.x = this._startX;
      if (this._document.filledColor) {
        this._document.fillColor(...this._document.filledColor);
      }
      this.emit('pageBreak', options, this);
    } else {
      this._document.x += this._lineWidth + this._columnGap;
      this._document.y = this._startY;
      this.emit('columnBreak', options, this);
    }

    this.emit('sectionStart', options, this);
    return true;
  }
}
