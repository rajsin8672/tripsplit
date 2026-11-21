import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  rupeesToPaise,
  formatPaiseToRupees,
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit
} from '../server/utils/money.js';

describe('Money, Currency & Split Calculations', () => {
  describe('rupeesToPaise', () => {
    it('should convert numeric rupees to integer paise without floating point error', () => {
      assert.strictEqual(rupeesToPaise(5000), 500000);
      assert.strictEqual(rupeesToPaise(1666.67), 166667);
      assert.strictEqual(rupeesToPaise(1666.66), 166666);
      assert.strictEqual(rupeesToPaise(0.01), 1);
    });

    it('should convert string rupees to integer paise', () => {
      assert.strictEqual(rupeesToPaise('5000'), 500000);
      assert.strictEqual(rupeesToPaise('123.45'), 12345);
    });

    it('should reject negative amounts or non-numeric inputs', () => {
      assert.throws(() => rupeesToPaise(-100), /cannot be negative/i);
      assert.throws(() => rupeesToPaise('abc'), /invalid numeric amount/i);
      assert.throws(() => rupeesToPaise(null), /amount in rupees is required/i);
    });
  });

  describe('formatPaiseToRupees', () => {
    it('should format integer paise into standard 2-decimal rupee string', () => {
      assert.strictEqual(formatPaiseToRupees(500000), '5000.00');
      assert.strictEqual(formatPaiseToRupees(166667), '1666.67');
      assert.strictEqual(formatPaiseToRupees(-166667), '-1666.67');
      assert.strictEqual(formatPaiseToRupees(0), '0.00');
    });

    it('should format with Indian comma grouping and rupee symbol when requested', () => {
      assert.strictEqual(formatPaiseToRupees(500000, true), '₹5,000.00');
      assert.strictEqual(formatPaiseToRupees(10000000, true), '₹1,00,000.00');
      assert.strictEqual(formatPaiseToRupees(-50000, true), '-₹500.00');
    });
  });

  describe('calculateEqualSplit', () => {
    it('should divide ₹5000 (500000 paise) equally among Karan, Rahul, Aman with deterministic remainder', () => {
      const participants = ['user-karan', 'user-rahul', 'user-aman'];
      const totalPaise = 500000;
      const splits = calculateEqualSplit(totalPaise, participants);

      assert.strictEqual(splits.length, 3);

      // Verify invariant: SUM(splits) === totalPaise
      const totalAllocated = splits.reduce((acc, s) => acc + s.allocatedAmount, 0);
      assert.strictEqual(totalAllocated, 500000);

      // Deterministic sort: aman, karan, rahul
      // 500000 / 3 = 166666 with remainder 2
      // First 2 participants get +1 paisa: 166667 each, third gets 166666
      assert.strictEqual(splits[0].userId, 'user-aman');
      assert.strictEqual(splits[0].allocatedAmount, 166667);

      assert.strictEqual(splits[1].userId, 'user-karan');
      assert.strictEqual(splits[1].allocatedAmount, 166667);

      assert.strictEqual(splits[2].userId, 'user-rahul');
      assert.strictEqual(splits[2].allocatedAmount, 166666);
    });

    it('should handle perfectly divisible amounts', () => {
      const participants = ['u1', 'u2'];
      const splits = calculateEqualSplit(10000, participants);
      assert.strictEqual(splits[0].allocatedAmount, 5000);
      assert.strictEqual(splits[1].allocatedAmount, 5000);
    });

    it('should reject empty participant array or invalid total', () => {
      assert.throws(() => calculateEqualSplit(1000, []), /at least one participant is required/i);
      assert.throws(() => calculateEqualSplit(-100, ['u1']), /positive integer/i);
    });
  });

  describe('calculateExactSplit', () => {
    it('should validate exact split when sum matches total amount', () => {
      const totalPaise = 100000;
      const rawSplits = [
        { userId: 'u1', allocatedAmount: 60000 },
        { userId: 'u2', allocatedAmount: 40000 }
      ];

      const splits = calculateExactSplit(totalPaise, rawSplits);
      assert.strictEqual(splits.length, 2);
      assert.strictEqual(splits[0].allocatedAmount, 60000);
      assert.strictEqual(splits[1].allocatedAmount, 40000);
    });

    it('should reject exact split when sum does not equal total amount', () => {
      const totalPaise = 100000;
      const rawSplits = [
        { userId: 'u1', allocatedAmount: 50000 },
        { userId: 'u2', allocatedAmount: 40000 } // Total 90000 !== 100000
      ];

      assert.throws(() => calculateExactSplit(totalPaise, rawSplits), /Exact split mismatch/i);
    });

    it('should reject duplicate participants in exact split', () => {
      const totalPaise = 10000;
      const rawSplits = [
        { userId: 'u1', allocatedAmount: 5000 },
        { userId: 'u1', allocatedAmount: 5000 }
      ];
      assert.throws(() => calculateExactSplit(totalPaise, rawSplits), /duplicate participant/i);
    });
  });

  describe('calculatePercentageSplit', () => {
    it('should calculate integer paise from percentages summing to 100%', () => {
      const totalPaise = 100000; // ₹1000
      const rawSplits = [
        { userId: 'u1', percentage: 50 },
        { userId: 'u2', percentage: 30 },
        { userId: 'u3', percentage: 20 }
      ];

      const splits = calculatePercentageSplit(totalPaise, rawSplits);
      assert.strictEqual(splits[0].allocatedAmount, 50000);
      assert.strictEqual(splits[1].allocatedAmount, 30000);
      assert.strictEqual(splits[2].allocatedAmount, 20000);
      assert.strictEqual(splits.reduce((sum, s) => sum + s.allocatedAmount, 0), totalPaise);
    });

    it('should adjust rounding residue into largest participant to guarantee invariant', () => {
      const totalPaise = 10000; // ₹100
      const rawSplits = [
        { userId: 'u1', percentage: 33.33 },
        { userId: 'u2', percentage: 33.33 },
        { userId: 'u3', percentage: 33.34 }
      ];

      const splits = calculatePercentageSplit(totalPaise, rawSplits);
      const sum = splits.reduce((acc, s) => acc + s.allocatedAmount, 0);
      assert.strictEqual(sum, totalPaise);
    });

    it('should reject percentages that do not sum to 100%', () => {
      const totalPaise = 10000;
      const rawSplits = [
        { userId: 'u1', percentage: 40 },
        { userId: 'u2', percentage: 40 }
      ];
      assert.throws(() => calculatePercentageSplit(totalPaise, rawSplits), /must sum to exactly 100%/i);
    });
  });
});
