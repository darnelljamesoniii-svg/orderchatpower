import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    // 1. Parse payload with extreme safety
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error('[Return Alert] Failed to parse JSON body');
      return NextResponse.json({ success: true, message: 'Invalid payload ignored' });
    }

    const { businessName, sessionId, agentEmail } = body;

    // 2. Sandbox Handling
    // Resend sandbox only allows sending to the account owner.
    // We hardcode this to ensure the API never returns a 403 during your testing.
    const recipient = 'darnelljamesoniii@gmail.com';

    // 3. Email Execution (Isolated to prevent route crashes)
    try {
      if (process.env.RESEND_API_KEY) {
        const { error } = await resend.emails.send({
          from: 'AgenticLife <onboarding@resend.dev>',
          to: recipient,
          subject: `🔥 RETURN VISIT: ${businessName || 'Unknown Lead'}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #4f46e5;">Prospect is Back Online</h2>
              <p><strong>${businessName || 'A prospect'}</strong> just reopened their Unlock page.</p>
              <p>Session ID: <code>${sessionId || 'N/A'}</code></p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <a href="https://orderchatpower.vercel.app/battle-station" 
                 style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                 Jump to Battle Station
              </a>
            </div>
          `,
        });

        if (error) {
          console.warn('[Return Alert] Resend warning (likely sandbox limit):', error.message);
        }
      } else {
        console.warn('[Return Alert] Skipping email: RESEND_API_KEY is missing.');
      }
    } catch (sendError: any) {
      console.error('[Return Alert] Resend service failure:', sendError.message);
    }

    // 4. Always return success
    // This ensures the "Unlock" page continues to load even if the notification fails.
    return NextResponse.json({ 
      success: true, 
      message: 'Notification processed' 
    });

  } catch (err: any) {
    console.error('[/api/sessions/return-alert] Uncaught Critical Failure:', err.message);
    // Final safety net: keep the lead's UI green.
    return NextResponse.json({ success: true, warning: 'Internal bypass triggered' });
  }
}
