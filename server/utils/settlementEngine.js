/**
 * Min-Cash-Flow Settlement Engine
 * Optimizes group debt by minimizing the total number of cash transactions.
 * All computations operate strictly on integer paise.
 */

import crypto from 'crypto';

/**
 * Calculate net balances for each member from expenses and expense splits.
 * 
 * Formula:
 * For each member:
 *   Total Paid = sum of totalAmount for all expenses paid by member
 *   Total Share = sum of allocatedAmount for all expense splits assigned to member
 *   Net Balance = Total Paid - Total Share
 * 
 * Invariant:
 *   SUM(all member net balances) === 0
 * 
 * @param {Array<Object>} members Array of member objects containing userId
 * @param {Array<Object>} expenses Array of expense objects
 * @param {Array<Object>} splits Array of expense split objects
 * @returns {Array<{ userId: string, totalPaid: number, totalShare: number, netBalance: number }>}
 */
export function calculateMemberBalances(members, expenses = [], splits = []) {
  const memberMap = new Map();

  // Initialize all known members with 0
  for (const m of members) {
    const uid = m.userId || m.uid;
    if (uid) {
      memberMap.set(uid, {
        userId: uid,
        totalPaid: 0,
        totalShare: 0,
        netBalance: 0
      });
    }
  }

  // Tally Total Paid from expenses
  for (const exp of expenses) {
    if (!exp.paidBy) continue;
    if (!memberMap.has(exp.paidBy)) {
      memberMap.set(exp.paidBy, {
        userId: exp.paidBy,
        totalPaid: 0,
        totalShare: 0,
        netBalance: 0
      });
    }
    const record = memberMap.get(exp.paidBy);
    record.totalPaid += exp.totalAmount || 0;
  }

  // Tally Total Share from splits
  for (const split of splits) {
    if (!split.userId) continue;
    if (!memberMap.has(split.userId)) {
      memberMap.set(split.userId, {
        userId: split.userId,
        totalPaid: 0,
        totalShare: 0,
        netBalance: 0
      });
    }
    const record = memberMap.get(split.userId);
    record.totalShare += split.allocatedAmount || 0;
  }

  // Calculate Net Balances and verify sum = 0
  let totalNetSum = 0;
  const balances = [];

  for (const record of memberMap.values()) {
    record.netBalance = record.totalPaid - record.totalShare;
    totalNetSum += record.netBalance;
    balances.push(record);
  }

  if (totalNetSum !== 0) {
    throw new Error(
      `Financial reconciliation failure: Sum of all member net balances is ${totalNetSum} paise (expected 0). Cannot compute safe settlements.`
    );
  }

  return balances;
}

/**
 * Generate optimized settlements using Min-Cash-Flow algorithm.
 * 
 * @param {string} tripId
 * @param {Array<{ userId: string, netBalance: number }>} memberBalances
 * @returns {Array<Object>} Optimized settlement transactions
 */
export function generateMinCashFlowSettlements(tripId, memberBalances) {
  // Reconcile check before algorithm runs
  let sumCheck = 0;
  for (const b of memberBalances) {
    sumCheck += b.netBalance;
  }
  if (sumCheck !== 0) {
    throw new Error(
      `Balance reconciliation failed: net balance sum is ${sumCheck} paise. Settlements cannot be generated from unreconciled balances.`
    );
  }

  // Separate debtors (< 0) and creditors (> 0)
  // Deep clone to prevent mutating input objects
  const debtors = [];
  const creditors = [];

  for (const b of memberBalances) {
    if (b.netBalance < 0) {
      debtors.push({ userId: b.userId, amountOwed: Math.abs(b.netBalance) });
    } else if (b.netBalance > 0) {
      creditors.push({ userId: b.userId, amountDue: b.netBalance });
    }
  }

  const settlements = [];
  const nowIso = new Date().toISOString();

  // Greedily match maximum debtor with maximum creditor
  while (debtors.length > 0 && creditors.length > 0) {
    // Sort descending by remaining amount
    debtors.sort((a, b) => b.amountOwed - a.amountOwed);
    creditors.sort((a, b) => b.amountDue - a.amountDue);

    const debtor = debtors[0];
    const creditor = creditors[0];

    // Prevent self-payment
    if (debtor.userId === creditor.userId) {
      throw new Error(`Self-settlement detected for user ${debtor.userId}.`);
    }

    const settleAmount = Math.min(debtor.amountOwed, creditor.amountDue);

    if (settleAmount <= 0) {
      throw new Error(`Invalid zero or negative settlement computed: ${settleAmount} paise.`);
    }

    const settlementId = `SETTLE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    settlements.push({
      settlementId,
      tripId,
      fromUser: debtor.userId,
      toUser: creditor.userId,
      amount: settleAmount,
      currency: 'INR',
      status: 'PENDING',
      paymentId: null,
      createdAt: nowIso,
      settledAt: null
    });

    debtor.amountOwed -= settleAmount;
    creditor.amountDue -= settleAmount;

    if (debtor.amountOwed === 0) {
      debtors.shift();
    }
    if (creditor.amountDue === 0) {
      creditors.shift();
    }
  }

  if (debtors.length > 0 || creditors.length > 0) {
    throw new Error('Settlement algorithm ended with unreconciled balances remaining.');
  }

  return settlements;
}
