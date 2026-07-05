import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export default function App() {
  const [config, setConfig] = useState([]);
  const [playerId, setPlayerId] = useState(localStorage.getItem('playerId') || '');
  const [player, setPlayer] = useState(null);
  const [log, setLog] = useState([]);
  const [adminKey, setAdminKey] = useState('');

  useEffect(() => {
    axios.get(`${API}/config`).then(r => setConfig(r.data.interface));
    if (playerId) loadPlayer();
  }, []);

  const signup = async () => {
    const name = prompt('Pseudo ? (enter for default)') || 'joueur';
    const r = await axios.post(`${API}/auth/signup`, { name });
    localStorage.setItem('playerId', r.data.id);
    setPlayerId(r.data.id);
    setPlayer(r.data);
  };

  const loadPlayer = async () => {
    if (!playerId) return alert('Connectez-vous (signup) d’abord');
    const r = await axios.get(`${API}/player/${playerId}`);
    setPlayer(r.data);
  };

  const createPf = async () => {
    if (!adminKey) return alert('Entrez la clé admin pour créer une session PF');
    try {
      const r = await axios.post(`${API}/pf/create`, {}, { headers: { 'x-admin-key': adminKey } });
      setLog(l => [`PF created: ${r.data.pf_session_id}`, ...l]);
      alert(`PF session created: ${r.data.pf_session_id}`);
    } catch (e) {
      alert('Erreur admin: ' + (e.response?.data?.error || e.message));
    }
  };

  const revealPf = async () => {
    if (!adminKey) return alert('Entrez la clé admin pour reveal');
    const pfId = prompt('pf_session_id à révéler ?');
    if (!pfId) return;
    try {
      const r = await axios.post(`${API}/pf/reveal`, { pf_session_id: pfId }, { headers: { 'x-admin-key': adminKey } });
      alert(`server_seed: ${r.data.server_seed}`);
    } catch (e) {
      alert('Erreur admin reveal: ' + (e.response?.data?.error || e.message));
    }
  };

  const play = async () => {
    if (!playerId) return alert('Connectez-vous');
    const clientSeed = prompt('Client seed (laisser vide pour aléa)') || '';
    try {
      const r = await axios.post(`${API}/play`, { playerId, clientSeed });
      setLog(l => [`Play result: payout ${r.data.total_payout_cents} cents`, ...l]);
      alert(`Résultat: payout = ${r.data.total_payout_cents} cents. Nouvelle balance: ${(r.data.new_credits_cents/100).toFixed(2)}€`);
      loadPlayer();
    } catch (e) {
      alert('Erreur play: ' + (e.response?.data?.error || e.message));
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Portes du Destin (MVP - faux argent)</h1>
      <div style={{ marginBottom: 10 }}>
        {!player && <button onClick={signup}>Créer un joueur (signup)</button>}
        {player && <span style={{ marginRight: 10 }}>Joueur: {player.name} — Crédits: {player.credits}€</span>}
        <button onClick={loadPlayer}>Rafraîchir joueur</button>
      </div>

      <hr/>
      <h2>Interface (ce que voit le joueur)</h2>
      <table border="1" cellPadding="6">
        <thead><tr><th>Palier</th><th>Portes</th><th>Chance affichée</th><th>Multi affiché</th></tr></thead>
        <tbody>
          {config.map(c => (
            <tr key={c.palier}><td>{c.palier}</td><td>{c.portes}</td><td>{c.chance_affiche}</td><td>{c.multi_affiche}</td></tr>
          ))}
        </tbody>
      </table>

      <hr/>
      <div>
        <h3>Admin (FR/EN) — portail admin</h3>
        <div>
          <input placeholder="Admin key" value={adminKey} onChange={e => setAdminKey(e.target.value)} />
          <button onClick={createPf} style={{ marginLeft: 8 }}>Créer session PF</button>
          <button onClick={revealPf} style={{ marginLeft: 8 }}>Révéler session PF</button>
        </div>
      </div>

      <hr/>
      <button onClick={play}>Jouer (10 paliers)</button>

      <hr/>
      <h3>Journal</h3>
      <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #ddd', padding: 8 }}>
        {log.map((l,i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
