import React, { useState } from 'react';
import * as Flex from '@twilio/flex-ui';

export const DialerDashboard = () => {
  const [cities, setCities] = useState('Brunswick GA, Savannah GA, Hilton Head SC, Charleston SC');
  const [cuisines, setCuisines] = useState('BBQ, Italian, Seafood, Mexican');
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(20);
  const [campaignName, setCampaignName] = useState(`Campaign_${Date.now()}`);
  const [status, setStatus] = useState('');

  const generateAndCreate = async () => {
    setStatus('Scraping 5,000+ indie leads...');
    try {
      const res = await fetch('/api/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cities: cities.split(',').map(c => c.trim()),
          cuisines: cuisines.split(',').map(c => c.trim()),
          minRating: 3.5,
          maxRating: 5.0,
          minReviews: 20,
          maxReviews: 150,
          campaignName,
          startHour,
          endHour
        })
      });
      const data = await res.json();
      setStatus(`${data.leads} GOLD leads → Campaign "${campaignName}" READY! Click DIAL.`);
    } catch (err: any) {
      setStatus('Error: ' + err.message);
    }
  };

  const dialLikeHell = () => {
    window.open(`https://flex.twilio.com/agent-desktop?campaign=${campaignName}`, 'dialer', 'width=1200,height=800');
    fetch('/api/start-dialing', {
      method: 'POST',
      body: JSON.stringify({ campaign: campaignName })
    });
  };

  return (
    <Flex.Column style={{ padding: 24, background: '#111', color: '#0f0', fontFamily: 'monospace' }}>
      <h1 style={{ color: '#0f0' }}>3-CLICK DIALER</h1>

      <input
        placeholder="Cities (comma sep)"
        value={cities}
        onChange={e => setCities(e.target.value)}
        style={{ width: '100%', padding: 10, margin: '8px 0', background: '#222', color: '#0f0', border: '1px solid #0f0' }}
      />
      <input
        placeholder="Cuisines"
        value={cuisines}
        onChange={e => setCuisines(e.target.value)}
        style={{ width: '100%', padding: 10, margin: '8px 0', background: '#222', color: '#0f0', border: '1px solid #0f0' }}
      />

      <div style={{ margin: '12px 0' }}>
        <strong>Call Hours:</strong>
        <input type="number" value={startHour} onChange={e => setStartHour(+e.target.value)} style={{ width: 50, margin: '0 8px' }} />
        to
        <input type="number" value={endHour} onChange={e => setEndHour(+e.target.value)} style={{ width: 50, margin: '0 8px' }} />
      </div>

      <input
        placeholder="Campaign Name"
        value={campaignName}
        onChange={e => setCampaignName(e.target.value)}
        style={{ width: '100%', padding: 10, margin: '8px 0', background: '#222', color: '#0f0', border: '1px solid #0f0' }}
      />

      <button
        onClick={generateAndCreate}
        style={{ background: '#ff8c00', padding: 14, fontWeight: 'bold', width: '100%', margin: '12px 0' }}
      >
        1. GENERATE & CREATE CAMPAIGN
      </button>

      <p style={{ margin: '12px 0', fontWeight: 'bold', color: '#0f0' }}>{status}</p>

      <button
        onClick={dialLikeHell}
        disabled={!status.includes('READY')}
        style={{
          background: '#ff0000',
          color: 'white',
          padding: 20,
          fontSize: 20,
          fontWeight: 'bold',
          width: '100%',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        2. DIAL LIKE A MOTHERFUCKA
      </button>
    </Flex.Column>
  );
};