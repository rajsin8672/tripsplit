import {
  createExpense,
  getTripExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense
} from '../services/expenseService.js';

export async function handleCreateExpense(req, res, next) {
  try {
    const { tripId } = req.params;
    const expense = await createExpense(tripId, req.user.uid, req.body || {});
    return res.status(201).json({
      success: true,
      data: expense
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetTripExpenses(req, res, next) {
  try {
    const { tripId } = req.params;
    const expenses = await getTripExpenses(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: expenses
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetExpenseById(req, res, next) {
  try {
    const { tripId, expenseId } = req.params;
    const expense = await getExpenseById(tripId, expenseId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: expense
    });
  } catch (err) {
    next(err);
  }
}

export async function handleUpdateExpense(req, res, next) {
  try {
    const { tripId, expenseId } = req.params;
    const updated = await updateExpense(tripId, expenseId, req.user.uid, req.body || {});
    return res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function handleDeleteExpense(req, res, next) {
  try {
    const { tripId, expenseId } = req.params;
    const result = await deleteExpense(tripId, expenseId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
