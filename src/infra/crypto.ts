import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = 'openmeta-cli-encryption-key-v1';

export class CryptoService {
  static encrypt(plainText: string): string {
    return CryptoJS.AES.encrypt(plainText, ENCRYPTION_KEY).toString();
  }

  static decrypt(cipherText: string): string {
    const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  static isEncrypted(value: string): boolean {
    try {
      const decrypted = this.decrypt(value);
      return decrypted.length > 0;
    } catch {
      return false;
    }
  }
}
