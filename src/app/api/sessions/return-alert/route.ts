import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, sessionId, agentEmail } = body;

    // Use account owner email as fallback for sandbox testing
    const recipient = 'darnelljamesoniii@gmail.com';

    try {
      const { error } = await resend.emails.send({
        from: 'AgenticLife <onboarding@resend.dev>',
        to: recipient,
        subject: `🔥 RETURN VISIT: ${businessName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4f46e5;">Prospect is Back Online</h2>
            <p><strong>${businessName}</strong> just reopened their Unlock page.</p>
            <p>Session ID: <code>${sessionId}</code></p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <a href="https://orderchatpower.vercel.app/battle-station" 
               style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
               Jump to Battle Station
            </a>
          </div>
        `,
      });

      if (error) {
        // Log the restriction but don't fail the request
        console.warn('[Return Alert] Email skipped (Sandbox/Domain not verified):', error.message);
      }
    } catch (sendError) {
      // Catch any network or internal Resend errors so they don't kill the main process
      console.error('[Return Alert] Resend execution failed:', sendError);
    }

    // Always return success so the frontend/unlock link continues to function
    return NextResponse.json({ 
      success: true, 
      message: 'Process completed (Email may have been skipped due to sandbox limits)' 
    });

  } catch (err: any) {
    console.error('[/api/sessions/return-alert] Critical Route Error:', err.message);
    // Even on a hard crash, we return a 200 to keep the lead's UI from breaking
    return NextResponse.json({ success: true, warning: 'Internal payload error' });
  }
}
