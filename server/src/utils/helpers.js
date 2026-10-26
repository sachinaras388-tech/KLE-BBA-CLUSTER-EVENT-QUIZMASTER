const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Unambiguous alphabet (no 0/O, 1/I/l)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function randomString(len, alphabet = ALPHABET) {
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

const generateParticipantId = () => `QM-${randomString(6)}`;

// 12 chars, guaranteed to contain upper, lower and a digit (passes the password policy)
function generateTempPassword() {
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [
    pick('ABCDEFGHJKLMNPQRSTUVWXYZ'),
    pick('abcdefghijkmnpqrstuvwxyz'),
    pick('23456789'),
    ...Array.from({ length: 9 }, () => pick(PW_ALPHABET)),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCSV = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

module.exports = {
  ApiError,
  asyncHandler,
  escapeRegex,
  generateParticipantId,
  generateTempPassword,
  shuffle,
  round2,
  toCSV,
};
