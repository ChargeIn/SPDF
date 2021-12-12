/*
   PDFSecurity - represents PDF security settings
   By Yang Liu <hi@zesik.com>
   Translated to ts by Florian Plesker
 */
import { PDFDocument } from './document';
import { PDFReference } from './reference';
import * as CryptoJS from 'crypto-js';
import { PDFInfo, PDFOptions, PDFPermissions, UtilEncDict } from './types';
import { saslprep } from './slaprep';

export class PDFSecurity {
  private _document: PDFDocument;
  private _version!: number;
  private _dictionary!: PDFReference;
  private _encryptionKey!: CryptoJS.lib.WordArray;
  private _keyBits!: number;

  constructor(document: PDFDocument, options: PDFOptions = {}) {
    if (!options.ownerPassword && !options.userPassword) {
      throw new Error('None of owner password and user password is defined.');
    }

    this._document = document;
    this._setupEncryption(options);
  }

  static generateFileID(info: PDFInfo) {
    let infoStr = `${info.CreationDate.getTime()}\n`;

    for (const key in info) {
      // eslint-disable-next-line no-prototype-builtins
      if (!info.hasOwnProperty(key)) {
        continue;
      }
      infoStr += `${key}: ${info[key].valueOf()}\n`;
    }

    return wordArrayToBuffer(CryptoJS.MD5(infoStr));
  }

  static generateRandomWordArray(bytes: number) {
    return CryptoJS.lib.WordArray.random(bytes);
  }

  static create(document: PDFDocument, options: PDFOptions = {}) {
    if (!options.ownerPassword && !options.userPassword) {
      return null;
    }
    return new PDFSecurity(document, options);
  }

  _setupEncryption(options: {
    pdfVersion?: string;
    permissions?: PDFPermissions;
    userPassword?: string;
    ownerPassword?: string;
  }) {
    switch (options.pdfVersion) {
      case '1.4':
      case '1.5':
        this._version = 2;
        break;
      case '1.6':
      case '1.7':
        this._version = 4;
        break;
      case '1.7ext3':
        this._version = 5;
        break;
      default:
        this._version = 1;
        break;
    }

    const encDict = {
      Filter: 'Standard',
    };

    switch (this._version) {
      case 1:
      case 2:
      case 4:
        this._setupEncryptionV1V2V4(this._version, encDict, options);
        break;
      case 5:
        this._setupEncryptionV5(encDict, options);
        break;
    }

    this._dictionary = this._document.ref(encDict);
  }

  _setupEncryptionV1V2V4(
    v: 1 | 2 | 4,
    encDict: UtilEncDict,
    options: {
      permissions?: PDFPermissions;
      userPassword?: string;
      ownerPassword?: string;
    }
  ) {
    let r: 2 | 3 | 4;
    let permissions: number;
    switch (v) {
      case 1:
        r = 2;
        this._keyBits = 40;
        permissions = getPermissionsR2(options.permissions);
        break;
      case 2:
        r = 3;
        this._keyBits = 128;
        permissions = getPermissionsR3(options.permissions);
        break;
      case 4:
        r = 4;
        this._keyBits = 128;
        permissions = getPermissionsR3(options.permissions);
        break;
    }

    const paddedUserPassword = processPasswordR2R3R4(options.userPassword);
    const paddedOwnerPassword = options.ownerPassword
      ? processPasswordR2R3R4(options.ownerPassword)
      : paddedUserPassword;

    const ownerPasswordEntry = getOwnerPasswordR2R3R4(
      r,
      this._keyBits,
      paddedUserPassword,
      paddedOwnerPassword
    );
    this._encryptionKey = getEncryptionKeyR2R3R4(
      r,
      this._keyBits,
      this._document.id,
      paddedUserPassword,
      ownerPasswordEntry,
      permissions
    );
    let userPasswordEntry;
    if (r === 2) {
      userPasswordEntry = getUserPasswordR2(this._encryptionKey);
    } else {
      userPasswordEntry = getUserPasswordR3R4(
        this._document.id,
        this._encryptionKey
      );
    }

    encDict.V = v;
    if (v >= 2) {
      encDict.Length = this._keyBits;
    }
    if (v === 4) {
      encDict.CF = {
        StdCF: {
          AuthEvent: 'DocOpen',
          CFM: 'AESV2',
          Length: this._keyBits / 8,
        },
      };
      encDict.StmF = 'StdCF';
      encDict.StrF = 'StdCF';
    }
    encDict.R = r;
    encDict.O = wordArrayToBuffer(ownerPasswordEntry);
    encDict.U = wordArrayToBuffer(userPasswordEntry);
    encDict.P = permissions;
  }

  _setupEncryptionV5(
    encDict: UtilEncDict,
    options: {
      permissions?: PDFPermissions;
      userPassword?: string;
      ownerPassword?: string;
    }
  ) {
    this._keyBits = 256;
    const permissions = getPermissionsR3(options.permissions);

    const processedUserPassword = processPasswordR5(options.userPassword);
    const processedOwnerPassword = options.ownerPassword
      ? processPasswordR5(options.ownerPassword)
      : processedUserPassword;

    this._encryptionKey = getEncryptionKeyR5(
      PDFSecurity.generateRandomWordArray
    );
    const userPasswordEntry = getUserPasswordR5(
      processedUserPassword,
      PDFSecurity.generateRandomWordArray
    );
    const userKeySalt = CryptoJS.lib.WordArray.create(
      userPasswordEntry.words.slice(10, 12),
      8
    );
    const userEncryptionKeyEntry = getUserEncryptionKeyR5(
      processedUserPassword,
      userKeySalt,
      this._encryptionKey
    );
    const ownerPasswordEntry = getOwnerPasswordR5(
      processedOwnerPassword,
      userPasswordEntry,
      PDFSecurity.generateRandomWordArray
    );
    const ownerKeySalt = CryptoJS.lib.WordArray.create(
      ownerPasswordEntry.words.slice(10, 12),
      8
    );
    const ownerEncryptionKeyEntry = getOwnerEncryptionKeyR5(
      processedOwnerPassword,
      ownerKeySalt,
      userPasswordEntry,
      this._encryptionKey
    );
    const permsEntry = getEncryptedPermissionsR5(
      permissions,
      this._encryptionKey,
      PDFSecurity.generateRandomWordArray
    );

    encDict.V = 5;
    encDict.Length = this._keyBits;
    encDict.CF = {
      StdCF: {
        AuthEvent: 'DocOpen',
        CFM: 'AESV3',
        Length: this._keyBits / 8,
      },
    };
    encDict.StmF = 'StdCF';
    encDict.StrF = 'StdCF';
    encDict.R = 5;
    encDict.O = wordArrayToBuffer(ownerPasswordEntry);
    encDict.OE = wordArrayToBuffer(ownerEncryptionKeyEntry);
    encDict.U = wordArrayToBuffer(userPasswordEntry);
    encDict.UE = wordArrayToBuffer(userEncryptionKeyEntry);
    encDict.P = permissions;
    encDict.Perms = wordArrayToBuffer(permsEntry);
  }

  getEncryptFn(obj: number, gen: number) {
    let digest: CryptoJS.lib.WordArray;
    if (this._version < 5) {
      digest = this._encryptionKey
        .clone()
        .concat(
          CryptoJS.lib.WordArray.create(
            [
              ((obj & 0xff) << 24) |
                ((obj & 0xff00) << 8) |
                ((obj >> 8) & 0xff00) |
                (gen & 0xff),
              (gen & 0xff00) << 16,
            ],
            5
          )
        );
    }

    if (this._version === 1 || this._version === 2) {
      const newKey = CryptoJS.MD5(digest!);
      newKey.sigBytes = Math.min(16, this._keyBits / 8 + 5);
      return (buffer: number[]) =>
        wordArrayToBuffer(
          CryptoJS.RC4.encrypt(CryptoJS.lib.WordArray.create(buffer), newKey)
            .ciphertext
        );
    }

    let key: CryptoJS.lib.WordArray;
    if (this._version === 4) {
      key = CryptoJS.MD5(
        digest!.concat(CryptoJS.lib.WordArray.create([0x73416c54], 4))
      );
    } else {
      key = this._encryptionKey;
    }

    const iv = PDFSecurity.generateRandomWordArray(16);
    const options = {
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      iv,
    };

    return (buffer: number[]) =>
      wordArrayToBuffer(
        iv
          .clone()
          .concat(
            CryptoJS.AES.encrypt(
              CryptoJS.lib.WordArray.create(buffer),
              key,
              options
            ).ciphertext
          )
      );
  }

  end() {
    this._dictionary.end();
  }
}

function getPermissionsR2(permissionObject: PDFPermissions = {}) {
  let permissions = 0xffffffc0 >> 0;
  if (permissionObject.printing) {
    permissions |= 0b000000000100;
  }
  if (permissionObject.modifying) {
    permissions |= 0b000000001000;
  }
  if (permissionObject.copying) {
    permissions |= 0b000000010000;
  }
  if (permissionObject.annotating) {
    permissions |= 0b000000100000;
  }
  return permissions;
}

function getPermissionsR3(permissionObject: PDFPermissions = {}) {
  let permissions = 0xfffff0c0 >> 0;
  if (permissionObject.printing === 'lowResolution') {
    permissions |= 0b000000000100;
  }
  if (permissionObject.printing === 'highResolution') {
    permissions |= 0b100000000100;
  }
  if (permissionObject.modifying) {
    permissions |= 0b000000001000;
  }
  if (permissionObject.copying) {
    permissions |= 0b000000010000;
  }
  if (permissionObject.annotating) {
    permissions |= 0b000000100000;
  }
  if (permissionObject.fillingForms) {
    permissions |= 0b000100000000;
  }
  if (permissionObject.contentAccessibility) {
    permissions |= 0b001000000000;
  }
  if (permissionObject.documentAssembly) {
    permissions |= 0b010000000000;
  }
  return permissions;
}

function getUserPasswordR2(encryptionKey: CryptoJS.lib.WordArray) {
  return CryptoJS.RC4.encrypt(processPasswordR2R3R4(), encryptionKey)
    .ciphertext;
}

function getUserPasswordR3R4(
  documentId: Buffer,
  encryptionKey: CryptoJS.lib.WordArray
) {
  const key = encryptionKey.clone();
  let cipher = CryptoJS.MD5(
    processPasswordR2R3R4().concat(
      CryptoJS.lib.WordArray.create(documentId as any)
    )
  );
  for (let i = 0; i < 20; i++) {
    const xorRound = Math.ceil(key.sigBytes / 4);
    for (let j = 0; j < xorRound; j++) {
      key.words[j] =
        encryptionKey.words[j] ^ (i | (i << 8) | (i << 16) | (i << 24));
    }
    cipher = CryptoJS.RC4.encrypt(cipher, key).ciphertext;
  }
  return cipher.concat(CryptoJS.lib.WordArray.create(undefined, 16));
}

function getOwnerPasswordR2R3R4(
  r: 2 | 3 | 4,
  keyBits: number,
  paddedUserPassword: CryptoJS.lib.WordArray,
  paddedOwnerPassword: CryptoJS.lib.WordArray
) {
  let digest = paddedOwnerPassword;
  let round = r >= 3 ? 51 : 1;
  for (let i = 0; i < round; i++) {
    digest = CryptoJS.MD5(digest);
  }

  const key = digest.clone();
  key.sigBytes = keyBits / 8;
  let cipher = paddedUserPassword;
  round = r >= 3 ? 20 : 1;
  for (let i = 0; i < round; i++) {
    const xorRound = Math.ceil(key.sigBytes / 4);
    for (let j = 0; j < xorRound; j++) {
      key.words[j] = digest.words[j] ^ (i | (i << 8) | (i << 16) | (i << 24));
    }
    cipher = CryptoJS.RC4.encrypt(cipher, key).ciphertext;
  }
  return cipher;
}

function getEncryptionKeyR2R3R4(
  r: number,
  keyBits: number,
  documentId: Buffer,
  paddedUserPassword: CryptoJS.lib.WordArray,
  ownerPasswordEntry: CryptoJS.lib.WordArray,
  permissions: number
) {
  let key = paddedUserPassword
    .clone()
    .concat(ownerPasswordEntry)
    .concat(CryptoJS.lib.WordArray.create([lsbFirstWord(permissions)], 4))
    .concat(CryptoJS.lib.WordArray.create(documentId as any));
  const round = r >= 3 ? 51 : 1;
  for (let i = 0; i < round; i++) {
    key = CryptoJS.MD5(key);
    key.sigBytes = keyBits / 8;
  }
  return key;
}

function getUserPasswordR5(
  processedUserPassword: CryptoJS.lib.WordArray,
  generateRandomWordArray: (n: number) => CryptoJS.lib.WordArray
) {
  const validationSalt = generateRandomWordArray(8);
  const keySalt = generateRandomWordArray(8);
  return CryptoJS.SHA256(processedUserPassword.clone().concat(validationSalt))
    .concat(validationSalt)
    .concat(keySalt);
}

function getUserEncryptionKeyR5(
  processedUserPassword: CryptoJS.lib.WordArray,
  userKeySalt: CryptoJS.lib.WordArray,
  encryptionKey: CryptoJS.lib.WordArray
) {
  const key = CryptoJS.SHA256(
    processedUserPassword.clone().concat(userKeySalt)
  );
  const options = {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
    iv: CryptoJS.lib.WordArray.create(undefined, 16),
  };
  return CryptoJS.AES.encrypt(encryptionKey, key, options).ciphertext;
}

function getOwnerPasswordR5(
  processedOwnerPassword: CryptoJS.lib.WordArray,
  userPasswordEntry: CryptoJS.lib.WordArray,
  generateRandomWordArray: (n: number) => CryptoJS.lib.WordArray
) {
  const validationSalt = generateRandomWordArray(8);
  const keySalt = generateRandomWordArray(8);
  return CryptoJS.SHA256(
    processedOwnerPassword
      .clone()
      .concat(validationSalt)
      .concat(userPasswordEntry)
  )
    .concat(validationSalt)
    .concat(keySalt);
}

function getOwnerEncryptionKeyR5(
  processedOwnerPassword: CryptoJS.lib.WordArray,
  ownerKeySalt: CryptoJS.lib.WordArray,
  userPasswordEntry: CryptoJS.lib.WordArray,
  encryptionKey: CryptoJS.lib.WordArray
) {
  const key = CryptoJS.SHA256(
    processedOwnerPassword
      .clone()
      .concat(ownerKeySalt)
      .concat(userPasswordEntry)
  );
  const options = {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
    iv: CryptoJS.lib.WordArray.create(undefined, 16),
  };
  return CryptoJS.AES.encrypt(encryptionKey, key, options).ciphertext;
}

function getEncryptionKeyR5(
  generateRandomWordArray: (n: number) => CryptoJS.lib.WordArray
) {
  return generateRandomWordArray(32);
}

function getEncryptedPermissionsR5(
  permissions: number,
  encryptionKey: CryptoJS.lib.WordArray,
  generateRandomWordArray: (n: number) => CryptoJS.lib.WordArray
) {
  const cipher = CryptoJS.lib.WordArray.create(
    [lsbFirstWord(permissions), 0xffffffff, 0x54616462],
    12
  ).concat(generateRandomWordArray(4));
  const options = {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding,
  };
  return CryptoJS.AES.encrypt(cipher, encryptionKey, options).ciphertext;
}

function processPasswordR2R3R4(password = '') {
  const out = Buffer.alloc(32);
  const length = password.length;
  let index = 0;
  while (index < length && index < 32) {
    const code = password.charCodeAt(index);
    if (code > 0xff) {
      throw new Error('Password contains one or more invalid characters.');
    }
    out[index] = code;
    index++;
  }
  while (index < 32) {
    out[index] = PASSWORD_PADDING[index - length];
    index++;
  }
  return CryptoJS.lib.WordArray.create(out as any);
}

function processPasswordR5(password = '') {
  password = unescape(encodeURIComponent(saslprep(password)));
  const length = Math.min(127, password.length);
  const out = Buffer.alloc(length);

  for (let i = 0; i < length; i++) {
    out[i] = password.charCodeAt(i);
  }

  return CryptoJS.lib.WordArray.create(out as any);
}

function lsbFirstWord(data: number) {
  return (
    ((data & 0xff) << 24) |
    ((data & 0xff00) << 8) |
    ((data >> 8) & 0xff00) |
    ((data >> 24) & 0xff)
  );
}

function wordArrayToBuffer(wordArray: CryptoJS.lib.WordArray) {
  const byteArray: number[] = [];
  for (let i = 0; i < wordArray.sigBytes; i++) {
    byteArray.push(
      (wordArray.words[Math.floor(i / 4)] >> (8 * (3 - (i % 4)))) & 0xff
    );
  }
  return Buffer.from(byteArray);
}

const PASSWORD_PADDING = [
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff,
  0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
];
