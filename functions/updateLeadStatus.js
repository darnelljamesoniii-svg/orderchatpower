exports.handler = async function(context, event, callback) {
  const sync = context.getTwilioClient().sync.v1.services(context.SYNC_SERVICE_SID);
  const { leadId, status, notes = '', campaignId } = event;

  try {
    const list = sync.lists(`leads_${campaignId}`);
    const pages = list.listPages();

    let found = false;
    for await (const page of pages) {
      for (const item of page.items) {
        if (item.data.leadId === leadId) {
          await item.update({
            data: {
              ...item.data,
              status,
              notes: item.data.notes + (notes ? `\n${notes}` : ''),
              completedAt: status === 'completed' ? new Date().toISOString() : item.data.completedAt
            }
          });
          found = true;
          break;
        }
      }
      if (found) break;
    }
    callback(null, { success: found });
  } catch (err) {
    callback(null, { success: false, message: err.message });
  }
};