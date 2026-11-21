/**
 * TripSplit — Expense Management Service
 * Strict integer paise accounting with equal, exact, and percentage splits.
 */

import crypto from 'crypto';
import { db } from '../config/firebaseAdmin.js';
import {
  calculateEqualSplit,
  calculateExactSplit,
  calculatePercentageSplit,
  rupeesToPaise
} from '../utils/money.js';

const EXPENSES_COLLECTION = 'expenses';
const SPLITS_COLLECTION = 'expense_splits';
const TRIPS_COLLECTION = 'trips';
const TRIP_MEMBERS_COLLECTION = 'trip_members';
const USERS_COLLECTION = 'users';

const ALLOWED_CATEGORIES = [
  'Accommodation',
  'Food',
  'Transport',
  'Shopping',
  'Activities',
  'Fuel',
  'Tickets',
  'Other'
];

function generateExpenseId() {
  return `EXP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Validate trip is ACTIVE and user is an ACTIVE member
 */
async function validateActiveTripMember(tripId, userId) {
  const tripDoc = await db.collection(TRIPS_COLLECTION).doc(tripId).get();
  if (!tripDoc.exists) {
    const error = new Error('Trip not found.');
    error.status = 404;
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  const trip = tripDoc.data();
  if (trip.status === 'ENDED') {
    const error = new Error('This trip has ended. Financial modifications are strictly prohibited.');
    error.status = 400;
    error.code = 'TRIP_ENDED';
    throw error;
  }

  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!memberDoc.exists || memberDoc.data().status !== 'ACTIVE') {
    const error = new Error('Only active trip members can perform financial actions on this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  return { trip, member: memberDoc.data() };
}

/**
 * Add a new expense with deterministic splits
 */
export async function createExpense(tripId, creatorId, expenseInput) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const { trip } = await validateActiveTripMember(tripId, creatorId);

  const {
    title,
    amount, // could be in rupees from frontend or paise if specified
    amountPaise,
    category,
    paidBy,
    date,
    description,
    participantIds,
    splitType = 'EQUAL',
    customSplits // for EXACT or PERCENTAGE
  } = expenseInput;

  // Title validation
  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    const error = new Error('Expense title is required and must be at least 2 characters.');
    error.status = 400;
    error.code = 'INVALID_EXPENSE_TITLE';
    throw error;
  }

  // Amount validation
  let totalAmountPaise;
  if (amountPaise !== undefined) {
    totalAmountPaise = Number(amountPaise);
  } else if (amount !== undefined) {
    totalAmountPaise = rupeesToPaise(amount);
  } else {
    const error = new Error('Expense amount is required.');
    error.status = 400;
    error.code = 'MISSING_AMOUNT';
    throw error;
  }

  if (!Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0) {
    const error = new Error('Expense amount must be a positive number greater than zero.');
    error.status = 400;
    error.code = 'INVALID_AMOUNT';
    throw error;
  }

  // Category validation
  const cleanCategory = category && ALLOWED_CATEGORIES.includes(category.trim())
    ? category.trim()
    : 'Other';

  // Payer validation
  const payerId = paidBy || creatorId;
  const payerMemberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${payerId}`).get();
  if (!payerMemberDoc.exists || payerMemberDoc.data().status !== 'ACTIVE') {
    const error = new Error('The member designated as "Paid By" must be an active member of this trip.');
    error.status = 400;
    error.code = 'INVALID_PAYER';
    throw error;
  }

  // Participants validation
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    const error = new Error('At least one participant must be explicitly selected for this expense.');
    error.status = 400;
    error.code = 'MISSING_PARTICIPANTS';
    throw error;
  }

  // Verify all participants are ACTIVE members of this trip
  for (const pid of participantIds) {
    const pDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${pid}`).get();
    if (!pDoc.exists || pDoc.data().status !== 'ACTIVE') {
      const error = new Error(`Participant ${pid} is not an active member of this trip.`);
      error.status = 400;
      error.code = 'INVALID_PARTICIPANT';
      throw error;
    }
  }

  // Split calculation
  let calculatedSplits = [];
  const cleanSplitType = splitType.toUpperCase();

  if (cleanSplitType === 'EQUAL') {
    calculatedSplits = calculateEqualSplit(totalAmountPaise, participantIds);
  } else if (cleanSplitType === 'EXACT') {
    if (!Array.isArray(customSplits) || customSplits.length === 0) {
      const error = new Error('Exact split definitions are required for EXACT split type.');
      error.status = 400;
      error.code = 'MISSING_EXACT_SPLITS';
      throw error;
    }
    // Convert any rupee values to paise if needed
    const normalizedSplits = customSplits.map(s => ({
      userId: s.userId,
      allocatedAmount: s.allocatedAmount !== undefined ? Number(s.allocatedAmount) : rupeesToPaise(s.amount)
    }));
    calculatedSplits = calculateExactSplit(totalAmountPaise, normalizedSplits);
  } else if (cleanSplitType === 'PERCENTAGE') {
    if (!Array.isArray(customSplits) || customSplits.length === 0) {
      const error = new Error('Percentage split definitions are required for PERCENTAGE split type.');
      error.status = 400;
      error.code = 'MISSING_PERCENTAGE_SPLITS';
      throw error;
    }
    calculatedSplits = calculatePercentageSplit(totalAmountPaise, customSplits);
  } else {
    const error = new Error(`Unsupported split type: ${splitType}. Must be EQUAL, EXACT, or PERCENTAGE.`);
    error.status = 400;
    error.code = 'INVALID_SPLIT_TYPE';
    throw error;
  }

  // Verify mandatory invariant: SUM(allocatedAmount) === totalAmountPaise
  const sumOfSplits = calculatedSplits.reduce((acc, curr) => acc + curr.allocatedAmount, 0);
  if (sumOfSplits !== totalAmountPaise) {
    const error = new Error(`Integrity invariant violated: sum of splits (${sumOfSplits}) does not match expense total (${totalAmountPaise}).`);
    error.status = 500;
    error.code = 'SPLIT_INTEGRITY_ERROR';
    throw error;
  }

  const expenseId = generateExpenseId();
  const nowIso = new Date().toISOString();
  const expenseDate = date || nowIso.split('T')[0];

  const expenseDoc = {
    expenseId,
    tripId,
    title: title.trim(),
    category: cleanCategory,
    totalAmount: totalAmountPaise,
    currency: trip.currency || 'INR',
    paidBy: payerId,
    splitType: cleanSplitType,
    participantIds: calculatedSplits.map(s => s.userId),
    description: description ? description.trim() : '',
    date: expenseDate,
    createdBy: creatorId,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const batch = db.batch();
  batch.set(db.collection(EXPENSES_COLLECTION).doc(expenseId), expenseDoc);

  for (const split of calculatedSplits) {
    const splitId = `${expenseId}_${split.userId}`;
    batch.set(db.collection(SPLITS_COLLECTION).doc(splitId), {
      splitId,
      expenseId,
      tripId,
      userId: split.userId,
      allocatedAmount: split.allocatedAmount,
      percentage: split.percentage || null,
      createdAt: nowIso
    });
  }

  await batch.commit();

  return {
    ...expenseDoc,
    splits: calculatedSplits
  };
}

/**
 * Get all expenses for a trip with their splits and user profile details
 */
export async function getTripExpenses(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  // Verify membership
  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!memberDoc.exists) {
    const error = new Error('You are not a member of this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const expensesSnap = await db.collection(EXPENSES_COLLECTION)
    .where('tripId', '==', tripId)
    .get();

  const splitsSnap = await db.collection(SPLITS_COLLECTION)
    .where('tripId', '==', tripId)
    .get();

  // Group splits by expenseId
  const splitsByExpense = new Map();
  for (const sDoc of splitsSnap.docs) {
    const s = sDoc.data();
    if (!splitsByExpense.has(s.expenseId)) {
      splitsByExpense.set(s.expenseId, []);
    }
    splitsByExpense.get(s.expenseId).push(s);
  }

  // Pre-load user profiles for member names
  const membersSnap = await db.collection(TRIP_MEMBERS_COLLECTION).where('tripId', '==', tripId).get();
  const userProfiles = new Map();
  for (const m of membersSnap.docs) {
    const uid = m.data().userId;
    const uDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (uDoc.exists) {
      userProfiles.set(uid, uDoc.data().displayName || uDoc.data().email || 'TripSplit Member');
    } else {
      userProfiles.set(uid, 'TripSplit Member');
    }
  }

  const expenses = [];
  for (const eDoc of expensesSnap.docs) {
    const exp = eDoc.data();
    const rawSplits = splitsByExpense.get(exp.expenseId) || [];

    const enrichedSplits = rawSplits.map(s => ({
      ...s,
      userName: userProfiles.get(s.userId) || 'TripSplit Member'
    }));

    expenses.push({
      ...exp,
      paidByName: userProfiles.get(exp.paidBy) || 'TripSplit Member',
      createdByName: userProfiles.get(exp.createdBy) || 'TripSplit Member',
      splits: enrichedSplits
    });
  }

  // Sort descending by date, then by createdAt
  expenses.sort((a, b) => {
    const dDiff = new Date(b.date) - new Date(a.date);
    if (dDiff !== 0) return dDiff;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return expenses;
}

/**
 * Get single expense by ID
 */
export async function getExpenseById(tripId, expenseId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!memberDoc.exists) {
    const error = new Error('You are not a member of this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const expDoc = await db.collection(EXPENSES_COLLECTION).doc(expenseId).get();
  if (!expDoc.exists || expDoc.data().tripId !== tripId) {
    const error = new Error('Expense not found.');
    error.status = 404;
    error.code = 'EXPENSE_NOT_FOUND';
    throw error;
  }

  const splitsSnap = await db.collection(SPLITS_COLLECTION)
    .where('expenseId', '==', expenseId)
    .get();

  const splits = splitsSnap.docs.map(d => d.data());

  return {
    ...expDoc.data(),
    splits
  };
}

/**
 * Update an existing expense
 */
export async function updateExpense(tripId, expenseId, userId, updateData) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  await validateActiveTripMember(tripId, userId);

  const expRef = db.collection(EXPENSES_COLLECTION).doc(expenseId);
  const expDoc = await expRef.get();

  if (!expDoc.exists || expDoc.data().tripId !== tripId) {
    const error = new Error('Expense not found.');
    error.status = 404;
    error.code = 'EXPENSE_NOT_FOUND';
    throw error;
  }

  const existingExp = expDoc.data();

  // Verify authorization: only creator or trip owner can edit
  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  const isOwner = memberDoc.exists && memberDoc.data().role === 'OWNER';
  const isCreator = existingExp.createdBy === userId;

  if (!isCreator && !isOwner) {
    const error = new Error('Only the expense creator or trip owner can edit this expense.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  // If amount, splitType, or participants are changing, re-calculate splits
  const hasSplitChanges = updateData.amount !== undefined ||
    updateData.amountPaise !== undefined ||
    updateData.participantIds !== undefined ||
    updateData.splitType !== undefined ||
    updateData.customSplits !== undefined;

  const nowIso = new Date().toISOString();
  const updatedExpense = {
    ...existingExp,
    updatedAt: nowIso
  };

  if (updateData.title !== undefined) {
    if (!updateData.title || typeof updateData.title !== 'string' || updateData.title.trim().length < 2) {
      const error = new Error('Expense title must be at least 2 characters.');
      error.status = 400;
      error.code = 'INVALID_EXPENSE_TITLE';
      throw error;
    }
    updatedExpense.title = updateData.title.trim();
  }

  if (updateData.category !== undefined) {
    updatedExpense.category = ALLOWED_CATEGORIES.includes(updateData.category.trim())
      ? updateData.category.trim()
      : 'Other';
  }

  if (updateData.date !== undefined) {
    updatedExpense.date = updateData.date;
  }

  if (updateData.description !== undefined) {
    updatedExpense.description = updateData.description ? updateData.description.trim() : '';
  }

  if (updateData.paidBy !== undefined) {
    const pMember = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${updateData.paidBy}`).get();
    if (!pMember.exists || pMember.data().status !== 'ACTIVE') {
      const error = new Error('The designated payer must be an active member of this trip.');
      error.status = 400;
      error.code = 'INVALID_PAYER';
      throw error;
    }
    updatedExpense.paidBy = updateData.paidBy;
  }

  const batch = db.batch();

  if (hasSplitChanges) {
    let totalAmountPaise = existingExp.totalAmount;
    if (updateData.amountPaise !== undefined) {
      totalAmountPaise = Number(updateData.amountPaise);
    } else if (updateData.amount !== undefined) {
      totalAmountPaise = rupeesToPaise(updateData.amount);
    }

    const participantIds = updateData.participantIds || existingExp.participantIds;
    const splitType = (updateData.splitType || existingExp.splitType).toUpperCase();

    // Verify participants are active members
    for (const pid of participantIds) {
      const pDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${pid}`).get();
      if (!pDoc.exists || pDoc.data().status !== 'ACTIVE') {
        const error = new Error(`Participant ${pid} is not an active member of this trip.`);
        error.status = 400;
        error.code = 'INVALID_PARTICIPANT';
        throw error;
      }
    }

    let calculatedSplits = [];
    if (splitType === 'EQUAL') {
      calculatedSplits = calculateEqualSplit(totalAmountPaise, participantIds);
    } else if (splitType === 'EXACT') {
      const splitsToCalc = updateData.customSplits || [];
      const normalizedSplits = splitsToCalc.map(s => ({
        userId: s.userId,
        allocatedAmount: s.allocatedAmount !== undefined ? Number(s.allocatedAmount) : rupeesToPaise(s.amount)
      }));
      calculatedSplits = calculateExactSplit(totalAmountPaise, normalizedSplits);
    } else if (splitType === 'PERCENTAGE') {
      calculatedSplits = calculatePercentageSplit(totalAmountPaise, updateData.customSplits || []);
    }

    // Delete old splits
    const oldSplitsSnap = await db.collection(SPLITS_COLLECTION).where('expenseId', '==', expenseId).get();
    for (const oldDoc of oldSplitsSnap.docs) {
      batch.delete(db.collection(SPLITS_COLLECTION).doc(oldDoc.id));
    }

    // Insert new splits
    for (const split of calculatedSplits) {
      const splitId = `${expenseId}_${split.userId}`;
      batch.set(db.collection(SPLITS_COLLECTION).doc(splitId), {
        splitId,
        expenseId,
        tripId,
        userId: split.userId,
        allocatedAmount: split.allocatedAmount,
        percentage: split.percentage || null,
        createdAt: nowIso
      });
    }

    updatedExpense.totalAmount = totalAmountPaise;
    updatedExpense.participantIds = calculatedSplits.map(s => s.userId);
    updatedExpense.splitType = splitType;
  }

  batch.set(expRef, updatedExpense);
  await batch.commit();

  return updatedExpense;
}

/**
 * Delete an expense and its associated splits
 */
export async function deleteExpense(tripId, expenseId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  await validateActiveTripMember(tripId, userId);

  const expRef = db.collection(EXPENSES_COLLECTION).doc(expenseId);
  const expDoc = await expRef.get();

  if (!expDoc.exists || expDoc.data().tripId !== tripId) {
    const error = new Error('Expense not found.');
    error.status = 404;
    error.code = 'EXPENSE_NOT_FOUND';
    throw error;
  }

  const expData = expDoc.data();

  // Verify authorization: only creator or trip owner can delete
  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  const isOwner = memberDoc.exists && memberDoc.data().role === 'OWNER';
  const isCreator = expData.createdBy === userId;

  if (!isCreator && !isOwner) {
    const error = new Error('Only the expense creator or trip owner can delete this expense.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const splitsSnap = await db.collection(SPLITS_COLLECTION).where('expenseId', '==', expenseId).get();

  const batch = db.batch();
  batch.delete(expRef);
  for (const sDoc of splitsSnap.docs) {
    batch.delete(db.collection(SPLITS_COLLECTION).doc(sDoc.id));
  }

  await batch.commit();

  return {
    success: true,
    message: 'Expense and associated splits deleted successfully.'
  };
}
