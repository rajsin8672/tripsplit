import {
  createInvitation,
  getUserInvitations,
  getTripInvitations,
  acceptInvitation,
  rejectInvitation,
  cancelInvitation
} from '../services/invitationService.js';
import { getUserProfile } from '../services/userService.js';

export async function handleCreateInvitation(req, res, next) {
  try {
    const { tripId } = req.params;
    const { email, userCode } = req.body || {};
    const invitation = await createInvitation(tripId, req.user.uid, { email, userCode });
    return res.status(201).json({
      success: true,
      data: invitation
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetUserInvitations(req, res, next) {
  try {
    // Look up profile to get userCode
    const profile = await getUserProfile(req.user.uid);
    const invitations = await getUserInvitations(req.user.uid, req.user.email, profile?.userCode);
    return res.status(200).json({
      success: true,
      data: invitations
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetTripInvitations(req, res, next) {
  try {
    const { tripId } = req.params;
    const invitations = await getTripInvitations(tripId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: invitations
    });
  } catch (err) {
    next(err);
  }
}

export async function handleAcceptInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;
    const profile = await getUserProfile(req.user.uid);
    const result = await acceptInvitation(invitationId, req.user.uid, req.user.email, profile?.userCode);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleRejectInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;
    const profile = await getUserProfile(req.user.uid);
    const result = await rejectInvitation(invitationId, req.user.uid, req.user.email, profile?.userCode);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function handleCancelInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;
    const result = await cancelInvitation(invitationId, req.user.uid);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}
