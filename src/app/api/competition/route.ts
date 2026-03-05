/**
 * Helper to resolve Google Feature IDs (/g/...) to standard Place IDs (ChIJ...)
 * Google Details API crashes if you pass it a /g/ ID directly.
 */
async function resolvePlaceId(id, apiKey) {
  // If it's already a standard Place ID, return it
  if (!id.startsWith('/g/')) {
    return id;
  }

  console.log(`Attempting to resolve Feature ID: ${id}`);

  try {
    // We use findplacefromtext because it accepts the /g/ ID as an input string
    // and returns the canonical ChIJ... Place ID in the candidates.
    const fallbackUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(
      id
    )}&inputtype=textquery&fields=place_id,name,geometry&key=${apiKey}`;

    const response = await fetch(fallbackUrl);
    
    if (!response.ok) {
      throw new Error(`Google API responded with status: ${response.status}`);
    }

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0].place_id;
    }

    throw new Error(`No Place ID mapping found for Feature ID: ${id}`);
  } catch (err) {
    console.error('Failed to resolve Place ID:', err);
    throw err;
  }
}

/**
 * Main Handler
 * Note: Switched to standard Response object for compatibility
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { placeId } = body;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Missing API Key' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!placeId) {
      return new Response(
        JSON.stringify({ error: 'Missing placeId in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Resolve the ID (Handling the /g/ IDs that caused the 500 error)
    let finalPlaceId;
    try {
      finalPlaceId = await resolvePlaceId(placeId, apiKey);
    } catch (resolveError) {
      return new Response(
        JSON.stringify({ 
          error: 'Could not resolve location format.', 
          details: resolveError.message 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Proceed with your competition logic using finalPlaceId
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${finalPlaceId}&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    if (detailsData.status !== 'OK') {
      return new Response(
        JSON.stringify({ error: `Google Details API error: ${detailsData.status}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        placeId: finalPlaceId,
        name: detailsData.result.name,
        message: 'Competition location verified successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('CRITICAL_API_ERROR:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
