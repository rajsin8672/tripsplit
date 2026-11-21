/**
 * TripSplit Money & Precision Utilities
 * All financial amounts in TripSplit are stored strictly in integer paise.
 * Invariant: ₹1.00 = 100 paise.
 * No floating-point amounts are ever persisted to the database.
 */

/**
 * Convert rupee amount (number or string) to integer paise.
 * Handles string inputs like "5000", "5000.50", "1666.67".
 * @param {number|string} rupees
 * @returns {number} Integer paise
 */
export function rupeesToPaise(rupees) {
  if (rupees === undefined || rupees === null || rupees === '') {
    throw new Error('Amount in rupees is required.');
  }

  const num = typeof rupees === 'string' ? parseFloat(rupees.trim()) : Number(rupees);

  if (isNaN(num) || !isFinite(num)) {
    throw new Error('Invalid numeric amount provided.');
  }

  if (num < 0) {
    throw new Error('Amount cannot be negative.');
  }

  // Round to nearest integer paise to eliminate floating point precision artifacts
  return Math.round(num * 100);
}

/**
 * Format integer paise into standard Indian Rupee string (e.g. 500000 -> "5000.00" or "₹5,000.00")
 * @param {number} paise
 * @param {boolean} includeSymbol
 * @returns {string}
 */
export function formatPaiseToRupees(paise, includeSymbol = false) {
  if (typeof paise !== 'number' || isNaN(paise)) {
    return includeSymbol ? '₹0.00' : '0.00';
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const rupees = (absPaise / 100).toFixed(2);

  if (includeSymbol) {
    const parts = rupees.split('.');
    // Format integer part with Indian comma numbering system (e.g., 1,00,000)
    let lastThree = parts[0].substring(parts[0].length - 3);
    const otherNumbers = parts[0].substring(0, parts[0].length - 3);
    if (otherNumbers !== '') {
      lastThree = ',' + lastThree;
    }
    const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    const formatted = `${formattedInt}.${parts[1]}`;
    return `${isNegative ? '-' : ''}₹${formatted}`;
  }

  return `${isNegative ? '-' : ''}${rupees}`;
}

/**
 * Deterministically calculate equal shares in integer paise.
 * 
 * Rule for remainder distribution:
 * The total amount in paise is divided integer-wise: baseShare = Math.floor(totalAmount / N).
 * The remainder (totalAmount % N) is distributed 1 paisa each to the first `remainder` participants
 * in the sorted participant array (sorted alphabetically by userId).
 * 
 * Invariant: SUM(allocatedAmount) === totalAmount strictly.
 * 
 * @param {number} totalAmountPaise Total expense amount in integer paise
 * @param {string[]} participantIds Array of participant user IDs
 * @returns {Array<{ userId: string, allocatedAmount: number }>}
 */
export function calculateEqualSplit(totalAmountPaise, participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new Error('At least one participant is required for equal split.');
  }

  if (!Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0) {
    throw new Error('Total amount must be a positive integer in paise.');
  }

  // Deduplicate and sort deterministically by userId
  const uniqueParticipants = Array.from(new Set(participantIds)).sort();
  const n = uniqueParticipants.length;

  const baseShare = Math.floor(totalAmountPaise / n);
  const remainder = totalAmountPaise % n;

  let runningSum = 0;
  const splits = uniqueParticipants.map((userId, index) => {
    // First 'remainder' participants receive baseShare + 1 paisa
    const allocatedAmount = index < remainder ? baseShare + 1 : baseShare;
    runningSum += allocatedAmount;
    return {
      userId,
      allocatedAmount
    };
  });

  if (runningSum !== totalAmountPaise) {
    throw new Error(`Equal split integrity failed: sum of splits (${runningSum}) !== total (${totalAmountPaise}).`);
  }

  return splits;
}

/**
 * Calculate and validate exact split shares in integer paise.
 * 
 * Invariant: SUM(allocatedAmount) === totalAmount strictly.
 * 
 * @param {number} totalAmountPaise
 * @param {Array<{ userId: string, allocatedAmount: number }>} rawSplits
 * @returns {Array<{ userId: string, allocatedAmount: number }>}
 */
export function calculateExactSplit(totalAmountPaise, rawSplits) {
  if (!Array.isArray(rawSplits) || rawSplits.length === 0) {
    throw new Error('Exact splits array is required.');
  }

  if (!Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0) {
    throw new Error('Total amount must be a positive integer in paise.');
  }

  let totalAllocated = 0;
  const seenUsers = new Set();
  const splits = [];

  for (const item of rawSplits) {
    if (!item.userId || typeof item.userId !== 'string') {
      throw new Error('Each split must specify a valid userId.');
    }
    if (seenUsers.has(item.userId)) {
      throw new Error(`Duplicate participant ${item.userId} in split definition.`);
    }
    seenUsers.add(item.userId);

    const amount = Number(item.allocatedAmount);
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error(`Allocated share for user ${item.userId} must be a non-negative integer in paise.`);
    }

    totalAllocated += amount;
    splits.push({
      userId: item.userId,
      allocatedAmount: amount
    });
  }

  if (totalAllocated !== totalAmountPaise) {
    const diffPaise = totalAmountPaise - totalAllocated;
    const diffStr = formatPaiseToRupees(Math.abs(diffPaise));
    throw new Error(
      `Exact split mismatch: sum of individual shares (${formatPaiseToRupees(totalAllocated)}) does not equal total expense (${formatPaiseToRupees(totalAmountPaise)}). Difference: ${diffPaise > 0 ? 'under by' : 'over by'} ₹${diffStr}.`
    );
  }

  return splits;
}

/**
 * Calculate percentage split shares in integer paise.
 * 
 * Invariant: SUM(percentages) === 100.
 * Invariant: SUM(allocatedAmount) === totalAmount strictly.
 * Any rounding discrepancies are adjusted into the participant with the largest percentage.
 * 
 * @param {number} totalAmountPaise
 * @param {Array<{ userId: string, percentage: number }>} rawSplits
 * @returns {Array<{ userId: string, allocatedAmount: number, percentage: number }>}
 */
export function calculatePercentageSplit(totalAmountPaise, rawSplits) {
  if (!Array.isArray(rawSplits) || rawSplits.length === 0) {
    throw new Error('Percentage splits array is required.');
  }

  if (!Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0) {
    throw new Error('Total amount must be a positive integer in paise.');
  }

  let totalPercentage = 0;
  const seenUsers = new Set();

  for (const item of rawSplits) {
    if (!item.userId || typeof item.userId !== 'string') {
      throw new Error('Each split must specify a valid userId.');
    }
    if (seenUsers.has(item.userId)) {
      throw new Error(`Duplicate participant ${item.userId} in percentage split.`);
    }
    seenUsers.add(item.userId);

    const pct = parseFloat(item.percentage);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      throw new Error(`Percentage for user ${item.userId} must be between 0 and 100.`);
    }
    totalPercentage += pct;
  }

  // Allow floating point comparison with small epsilon for 100%
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(`Percentages must sum to exactly 100%. Current sum: ${totalPercentage.toFixed(2)}%.`);
  }

  // Calculate integer shares
  let runningTotal = 0;
  let maxPctIndex = 0;
  let maxPct = -1;

  const splits = rawSplits.map((item, idx) => {
    const pct = parseFloat(item.percentage);
    if (pct > maxPct) {
      maxPct = pct;
      maxPctIndex = idx;
    }

    const share = Math.round((pct * totalAmountPaise) / 100);
    runningTotal += share;

    return {
      userId: item.userId,
      allocatedAmount: share,
      percentage: pct
    };
  });

  // Adjust rounding residue into participant with largest percentage
  const residue = totalAmountPaise - runningTotal;
  if (residue !== 0) {
    splits[maxPctIndex].allocatedAmount += residue;
  }

  // Verify final invariant
  const finalSum = splits.reduce((acc, curr) => acc + curr.allocatedAmount, 0);
  if (finalSum !== totalAmountPaise) {
    throw new Error(`Percentage split integrity error: final sum (${finalSum}) !== total (${totalAmountPaise}).`);
  }

  return splits;
}
