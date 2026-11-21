import {
  submitPayment,
  confirmPayment,
  rejectPayment,
  getUserPayments
} from '../services/paymentService.js';

export async function handleSubmitPayment(req, res, next) {
  try {
    const { settlementId } = req.params;
    const { upiTransactionRef, notes } = req.body || {};
    const payment = await submitPayment(settlementId, req.user.uid, { upiTransactionRef, notes });
    return res.status(201).json({
      success: true,
      data: payment
    });
  } catch (err) {
    next(err);
  }
}

export async function handleConfirmPayment(req, res, next) {
  try {
    const { paymentId } = req.params;
    const result = await confirmPayment(paymentId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleRejectPayment(req, res, next) {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body || {};
    const result = await rejectPayment(paymentId, req.user.uid, { reason });
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetUserPayments(req, res, next) {
  try {
    const { type, status } = req.query;
    const payments = await getUserPayments(req.user.uid, { type, status });
    return res.status(200).json({
      success: true,
      data: payments
    });
  } catch (err) {
    next(err);
  }
}
