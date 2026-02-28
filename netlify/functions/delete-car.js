// netlify/functions/delete-car.js
// ─────────────────────────────────────────────────────────────────────────────
// DELETE /netlify/functions/delete-car
// Body: { "id": "car-1234567890" }
//
// CdC v4 §4.1: "Cloudinary delete + Sheets + trigger"
// CdC v4 §12 criterion 8: "Suppression retire la voiture ET supprime l'image Cloudinary"
// ─────────────────────────────────────────────────────────────────────────────

const { getAuthUser, unauthorized, badRequest, serverError, ok, handleOptions } = require('./_utils/auth');
const { deleteImage }   = require('./_utils/cloudinary');
const sheets            = require('./_utils/sheets');
const { triggerAction } = require('./_utils/github');

exports.handler = async (event, context) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  const { user } = getAuthUser(context);
  if (!user) return unauthorized();

  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { id } = body;
    if (!id) return badRequest('Missing required field: id');

    // 1. Remove from Sheets and get car data (to retrieve imagePublicId)
    const deletedCar = await sheets.deleteCar(id);

    // 2. Delete image from Cloudinary (criterion 8)
    //    Non-fatal: if Cloudinary fails, car is still removed from Sheets/site
    if (deletedCar.imagePublicId) {
      await deleteImage(deletedCar.imagePublicId).catch(err =>
        console.warn('[delete-car] Cloudinary image delete failed:', err.message)
      );
    }

    // 3. Trigger GitHub Action to regenerate cars.json without this car
    try {
      await triggerAction();
    } catch (triggerErr) {
      console.warn('[delete-car] GitHub Action trigger failed (non-fatal):', triggerErr.message);
    }

    return ok({ success: true, deletedId: id });

  } catch (err) {
    return serverError('Failed to delete car', err);
  }
};
