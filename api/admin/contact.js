// /api/admin/contact.js
//
// One contact, plus the notes that carry the trip details GHL has no custom
// field for — children count, quoted estimate, nights — written there by
// ghl-webhook.js.
//
// Two GHL calls, run concurrently rather than in sequence: each is budgeted at
// 7s and Vercel Hobby caps the whole function at 10s, so chaining them would
// blow the budget. Same reasoning as the parallel tag/note writes in
// ghl-webhook.js.

import { withAdmin } from '../_lib/auth.js';
import { sessionNotRevoked } from '../_lib/store.js';
import { ghlFetch, isGhlId, projectContactDetail, projectNotes, GhlError } from '../_lib/ghl.js';

export default withAdmin(async function handler(req, res) {
  const id = String(req.query?.id ?? '');
  if (!isGhlId(id)) {
    // Rejected before the id can reach a URL. Without this, an id of
    // "../../conversations" would walk an API-keyed request to another endpoint.
    return res.status(400).json({ error: 'Invalid contact id' });
  }

  const path = `/contacts/${encodeURIComponent(id)}`;

  try {
    const [detail, notes] = await Promise.all([
      ghlFetch(path),
      // Notes are supporting detail. A contact whose notes fail to load is
      // still worth showing, so this leg degrades to an empty list rather than
      // failing the whole request.
      ghlFetch(`${path}/notes`).catch((err) => {
        console.error('[admin] notes fetch failed', err?.ref || err?.message);
        return null;
      }),
    ]);

    const contact = detail?.contact ?? detail;
    if (!contact?.id) return res.status(404).json({ error: 'Not found' });

    return res.status(200).json({
      contact: projectContactDetail(contact),
      notes: notes ? projectNotes(notes) : [],
      notesUnavailable: notes === null,
    });
  } catch (err) {
    if (err instanceof GhlError) {
      return res.status(err.status).json({ error: err.message, ref: err.ref });
    }
    throw err;
  }
}, { methods: ['GET'], verifyRevocation: sessionNotRevoked });
