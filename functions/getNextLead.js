exports.handler = async function(context, event, callback) {
  const client = context.getTwilioClient();
  const sync = client.sync.v1.services(context.SYNC_SERVICE_SID);
  const moment = require('moment-timezone');
  const { workerSid, campaignId } = event;

  if (!workerSid || !campaignId) {
    return callback(null, { success: false, message: 'Missing workerSid or campaignId' });
  }

  try {
    const config = await sync.documents(`config_${campaignId}`).fetch().catch(() => ({ data: { startHour: 9, endHour: 21 } }));
    const { startHour, endHour } = config.data;
    const now = moment().tz('America/New_York');
    if (now.hour() < startHour || now.hour() >= endHour) {
      return callback(null, { success: false, message: 'Outside calling hours' });
    }

    const list = sync.lists(`leads_${campaignId}`);
    const pages = list.listPages({ pageSize: 50 });

    let nextLead = null;
    let item = null;

    for await (const page of pages) {
      for (const i of page.items) {
        const d = i.data;
        if (d.status === 'pending' && (!d.lastAttempt || moment(d.lastAttempt).isBefore(moment().subtract(15, 'minutes')))) {
          nextLead = d;
          item = i;
          break;
        }
      }
      if (nextLead) break;
    }

    if (!nextLead) {
      return callback(null, { success: false, message: 'No leads available' });
    }

    const updated = {
      ...nextLead,
      assignedTo: workerSid,
      assignedAt: new Date().toISOString(),
      attemptCount: (nextLead.attemptCount || 0) + 1,
      lastAttempt: new Date().toISOString(),
      status: 'in-progress'
    };

    await item.update({ data: updated });

    callback(null, {
      success: true,
      lead: {
        phone: nextLead.phone,
        name: nextLead.name,
        leadId: nextLead.leadId,
        rating: nextLead.rating,
        reviews: nextLead.reviews
      }
    });
  } catch (err) {
    console.error('getNextLead error:', err);
    callback(null, { success: false, message: err.message });
  }
};