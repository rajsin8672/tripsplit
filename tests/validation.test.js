import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  validateDisplayName,
  validatePassword,
  validateUpiId,
  generateUserCode
} from '../server/utils/validation.js';

describe('Validation Utilities', () => {
  describe('validateEmail', () => {
    it('should validate valid email addresses', () => {
      assert.strictEqual(validateEmail('test@example.com'), true);
      assert.strictEqual(validateEmail('user.name+tag@sub.domain.co'), true);
    });

    it('should reject invalid email addresses', () => {
      assert.strictEqual(validateEmail(''), false);
      assert.strictEqual(validateEmail(null), false);
      assert.strictEqual(validateEmail('plainaddress'), false);
      assert.strictEqual(validateEmail('@missingusername.com'), false);
      assert.strictEqual(validateEmail('username@.com'), false);
    });
  });

  describe('validateDisplayName', () => {
    it('should accept valid display names', () => {
      assert.strictEqual(validateDisplayName('Karan Kumar'), true);
      assert.strictEqual(validateDisplayName('Sarah O\'Connor'), true);
      assert.strictEqual(validateDisplayName('Jean-Luc'), true);
    });

    it('should reject invalid display names', () => {
      assert.strictEqual(validateDisplayName(''), false);
      assert.strictEqual(validateDisplayName('A'), false); // too short
      assert.strictEqual(validateDisplayName('<script>alert(1)</script>'), false);
      assert.strictEqual(validateDisplayName(null), false);
    });
  });

  describe('validatePassword', () => {
    it('should accept valid passwords >= 8 chars', () => {
      assert.strictEqual(validatePassword('SuperSecret123!'), true);
      assert.strictEqual(validatePassword('12345678'), true);
    });

    it('should reject passwords shorter than 8 chars', () => {
      assert.strictEqual(validatePassword('1234567'), false);
      assert.strictEqual(validatePassword(''), false);
      assert.strictEqual(validatePassword(null), false);
    });
  });

  describe('validateUpiId', () => {
    it('should accept empty or valid UPI IDs', () => {
      assert.strictEqual(validateUpiId(''), true);
      assert.strictEqual(validateUpiId(null), true);
      assert.strictEqual(validateUpiId(undefined), true);
      assert.strictEqual(validateUpiId('rahul@okhdfcbank'), true);
      assert.strictEqual(validateUpiId('9876543210@paytm'), true);
      assert.strictEqual(validateUpiId('user.name@axisbank'), true);
    });

    it('should reject invalid UPI IDs', () => {
      assert.strictEqual(validateUpiId('invalidupi'), false);
      assert.strictEqual(validateUpiId('@bank'), false);
      assert.strictEqual(validateUpiId('handle@'), false);
      assert.strictEqual(validateUpiId('handle@@bank'), false);
    });
  });

  describe('generateUserCode', () => {
    it('should generate codes starting with TS- and 6 uppercase alphanumeric chars', () => {
      const code1 = generateUserCode();
      const code2 = generateUserCode();

      assert.match(code1, /^TS-[2-9A-HJ-NP-Z]{6}$/);
      assert.match(code2, /^TS-[2-9A-HJ-NP-Z]{6}$/);
      assert.notStrictEqual(code1, code2);
    });
  });
});
