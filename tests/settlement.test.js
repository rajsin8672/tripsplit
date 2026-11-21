import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMemberBalances,
  generateMinCashFlowSettlements
} from '../server/utils/settlementEngine.js';

describe('Settlement Engine & Balance Calculations', () => {
  describe('calculateMemberBalances', () => {
    it('should calculate accurate Paid - Share net balances where SUM = 0', () => {
      const members = [
        { userId: 'karan' },
        { userId: 'rahul' },
        { userId: 'aman' }
      ];

      // Karan paid ₹5000 (500000 paise)
      const expenses = [
        { expenseId: 'e1', paidBy: 'karan', totalAmount: 500000 }
      ];

      // Split 3 ways: Karan (166667), Rahul (166667), Aman (166666)
      const splits = [
        { expenseId: 'e1', userId: 'karan', allocatedAmount: 166667 },
        { expenseId: 'e1', userId: 'rahul', allocatedAmount: 166667 },
        { expenseId: 'e1', userId: 'aman', allocatedAmount: 166666 }
      ];

      const balances = calculateMemberBalances(members, expenses, splits);

      const karanBal = balances.find(b => b.userId === 'karan');
      const rahulBal = balances.find(b => b.userId === 'rahul');
      const amanBal = balances.find(b => b.userId === 'aman');

      assert.strictEqual(karanBal.totalPaid, 500000);
      assert.strictEqual(karanBal.totalShare, 166667);
      assert.strictEqual(karanBal.netBalance, 333333); // +₹3333.33

      assert.strictEqual(rahulBal.totalPaid, 0);
      assert.strictEqual(rahulBal.totalShare, 166667);
      assert.strictEqual(rahulBal.netBalance, -166667); // -₹1666.67

      assert.strictEqual(amanBal.totalPaid, 0);
      assert.strictEqual(amanBal.totalShare, 166666);
      assert.strictEqual(amanBal.netBalance, -166666); // -₹1666.66

      // Net Sum verification
      const netSum = balances.reduce((sum, b) => sum + b.netBalance, 0);
      assert.strictEqual(netSum, 0);
    });

    it('should throw an error if ledger splits and expenses do not reconcile', () => {
      const members = [{ userId: 'u1' }, { userId: 'u2' }];
      const expenses = [{ paidBy: 'u1', totalAmount: 10000 }];
      const splits = [
        { userId: 'u1', allocatedAmount: 5000 },
        { userId: 'u2', allocatedAmount: 4000 } // Total 9000 !== 10000
      ];

      assert.throws(() => calculateMemberBalances(members, expenses, splits), /Financial reconciliation failure/i);
    });
  });

  describe('generateMinCashFlowSettlements', () => {
    it('should generate minimum number of cash transfers for 3-party group', () => {
      const tripId = 'TRIP-GOA';
      const balances = [
        { userId: 'karan', netBalance: 333333 },
        { userId: 'rahul', netBalance: -166667 },
        { userId: 'aman', netBalance: -166666 }
      ];

      const settlements = generateMinCashFlowSettlements(tripId, balances);

      // Exactly 2 transactions needed: Rahul -> Karan, Aman -> Karan
      assert.strictEqual(settlements.length, 2);

      const s1 = settlements.find(s => s.fromUser === 'rahul' && s.toUser === 'karan');
      const s2 = settlements.find(s => s.fromUser === 'aman' && s.toUser === 'karan');

      assert.ok(s1);
      assert.strictEqual(s1.amount, 166667);
      assert.strictEqual(s1.status, 'PENDING');

      assert.ok(s2);
      assert.strictEqual(s2.amount, 166666);
      assert.strictEqual(s2.status, 'PENDING');

      // Total debtor payments === total creditor receipts
      const totalSettled = settlements.reduce((sum, s) => sum + s.amount, 0);
      assert.strictEqual(totalSettled, 333333);
    });

    it('should prevent self-transactions and zero/negative settlements', () => {
      const tripId = 'TRIP-1';
      const balances = [
        { userId: 'u1', netBalance: 0 },
        { userId: 'u2', netBalance: 0 }
      ];

      const settlements = generateMinCashFlowSettlements(tripId, balances);
      assert.strictEqual(settlements.length, 0);
    });

    it('should reject unreconciled input balances', () => {
      const tripId = 'TRIP-ERR';
      const balances = [
        { userId: 'u1', netBalance: 5000 },
        { userId: 'u2', netBalance: -4000 }
      ];

      assert.throws(() => generateMinCashFlowSettlements(tripId, balances), /Balance reconciliation failed/i);
    });
  });
});
