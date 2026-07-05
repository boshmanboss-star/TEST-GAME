const crypto = require('crypto');

const SALT = process.env.PF_SALT || 'change_this_salt';

// Create server seed and its hash (store both on server; publish hash)
function createSeedHash(returnObj = false) {
  const server_seed = crypto.randomBytes(32).toString('hex');
  const server_seed_hash = crypto.createHash('sha256').update(server_seed + SALT).digest('hex');
  if (returnObj) return { server_seed, server_seed_hash };
  return server_seed_hash;
}

// Reveal seed: check hash
function revealSeed(server_seed) {
  const server_seed_hash = crypto.createHash('sha256').update(server_seed + SALT).digest('hex');
  return { server_seed, server_seed_hash };
}

// Deterministic outcome per palier using HMAC(server_seed, clientSeed + ":" + palier)
// Returns a float in [0,1) and a small proof object
function computeOutcome(server_seed, clientSeed, palier) {
  const message = `${clientSeed}:${palier}`;
  const hmac = crypto.createHmac('sha256', server_seed).update(message).digest('hex');
  // Map hmac hex to integer then to float
  const prefix = hmac.slice(0, 13); // take 52 bits ~ safe double precision
  const intVal = parseInt(prefix, 16);
  const randFloat = (intVal / Math.pow(2, 52));
  return { randFloat, proof: { hmac, prefix } };
}

module.exports = { createSeedHash, revealSeed, computeOutcome };
