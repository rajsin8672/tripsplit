import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateUpiUri, validateUtr } from '../server/utils/upi.js';

describe('UPI Payment Utilities', () => {
  describe('generateUpiUri', () => {
    it('should generate properly encoded standard UPI URI', () => {
      const uri = generateUpiUri({
        payeeVpa: 'rahul@okaxis',
        payeeName: 'Rahul Sharma',
        amountPaise: 166667,
        transactionNote: 'TripSplit Goa Trip',
        referenceId: 'SETTLE-12345'
      });

      assert.ok(uri.startsWith('upi://pay?'));
      const parsed = new URL(uri);
      assert.strictEqual(parsed.searchParams.get('pa'), 'rahul@okaxis');
      assert.strictEqual(parsed.searchParams.get('pn'), 'Rahul Sharma');
      assert.strictEqual(parsed.searchParams.get('am'), '1666.67');
      assert.strictEqual(parsed.searchParams.get('cu'), 'INR');
      assert.strictEqual(parsed.searchParams.get('tn'), 'TripSplit Goa Trip');
      assert.strictEqual(parsed.searchParams.get('tr'), 'SETTLE-12345');
    });

    it('should reject invalid or missing payee UPI ID', () => {
      assert.throws(() => {
        generateUpiUri({
          payeeVpa: 'invalid-vpa',
          amountPaise: 50000
        });
      }, /Valid payee UPI ID/i);
    });

    it('should reject non-positive amounts', () => {
      assert.throws(() => {
        generateUpiUri({
          payeeVpa: 'user@bank',
          amountPaise: 0
        });
      }, /positive amount in paise/i);
    });
  });

  describe('validateUtr', () => {
    it('should accept valid standard 12-digit numeric bank UTR / RRN', () => {
      assert.strictEqual(validateUtr('412345678901'), true);
      assert.strictEqual(validateUtr('098765432123'), true);
    });

    it('should accept valid alphanumeric bank reference strings', () => {
      assert.strictEqual(validateUtr('HDFC12345678'), true);
      assert.strictEqual(validateUtr('SBIN-20261120-001'), true);
    });

    it('should reject too short or invalid character strings', () => {
      assert.strictEqual(validateUtr('123'), false);
      assert.strictEqual(validateUtr(''), false);
      assert.strictEqual(validateUtr('abc$#@123'), false);
      assert.strictEqual(validateUtr(null), false);
    });
  });
});
