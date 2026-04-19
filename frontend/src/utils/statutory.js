// Indian statutory ID validation — format, checksum, decode

const INDIAN_STATE_CODES = {
  "01":"Jammu & Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh",
  "05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"Uttar Pradesh",
  "10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh","13":"Nagaland","14":"Manipur",
  "15":"Mizoram","16":"Tripura","17":"Meghalaya","18":"Assam","19":"West Bengal",
  "20":"Jharkhand","21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh",
  "24":"Gujarat","26":"Dadra & Nagar Haveli and Daman & Diu","27":"Maharashtra",
  "28":"Andhra Pradesh","29":"Karnataka","30":"Goa","31":"Lakshadweep","32":"Kerala",
  "33":"Tamil Nadu","34":"Puducherry","35":"Andaman & Nicobar Islands","36":"Telangana",
  "37":"Andhra Pradesh (New)","38":"Ladakh","97":"Other Territory","99":"Centre Jurisdiction",
};

// Verhoeff tables for Aadhaar
const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
];

function verhoeffCheck(num) {
  const digits = num.split("").map(Number).reverse();
  let c = 0;
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}

// GSTIN checksum (Luhn mod 36)
const CHAR_MAP = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function gstinChecksum(gstin14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = CHAR_MAP.indexOf(gstin14[i].toUpperCase());
    const mult = i % 2 === 0 ? 1 : 2;
    const prod = code * mult;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  return CHAR_MAP[(36 - (sum % 36)) % 36];
}

// Patterns
const PATTERNS = {
  Aadhaar:          { re: /^[2-9]\d{11}$/, len: "12 digits", hint: "12-digit number, starts with 2–9" },
  PAN:              { re: /^[A-Z]{5}[0-9]{4}[A-Z]$/, len: "10 chars", hint: "AAAAA9999A — 5 letters, 4 digits, 1 letter" },
  Passport:         { re: /^[A-Z][1-9]\d{6}$/, len: "8 chars", hint: "A1234567 — letter + 7 digits" },
  "Driving License":{ re: /^[A-Z]{2}\d{2}[ -]?\d{4}\d{7}$/, len: "13-16 chars", hint: "MH01 2018 1234567 — state code + year + serial" },
  "Voter ID":       { re: /^[A-Z]{3}\d{7}$/, len: "10 chars", hint: "ABC1234567 — 3 letters + 7 digits" },
  GST:              { re: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, len: "15 chars", hint: "22AAAAA0000A1Z5 — 2-digit state + PAN + entity + checksum" },
};

/**
 * Validate a statutory ID. Returns { valid, checksumValid, message, info }
 * info = extra decoded details (state, embedded PAN, etc.)
 */
export function validateStatutory(type, rawValue) {
  if (!rawValue) return { valid: null, message: "" };
  if (type === "Others") return { valid: true, message: "" };

  const value = rawValue.trim().replace(/\s+/g, "").toUpperCase();
  const spec = PATTERNS[type];
  if (!spec) return { valid: null, message: "" };

  if (!spec.re.test(value)) {
    return {
      valid: false,
      message: `Invalid format — expected ${spec.len}. ${spec.hint}`,
    };
  }

  // Checksum checks
  if (type === "Aadhaar") {
    const ok = verhoeffCheck(value);
    return {
      valid: ok,
      checksumValid: ok,
      message: ok ? "Aadhaar checksum valid" : "Aadhaar checksum invalid — number may be incorrect",
    };
  }

  if (type === "GST") {
    const expectedCheck = gstinChecksum(value.slice(0, 14));
    const ok = expectedCheck === value[14];
    const stateCode = value.slice(0, 2);
    const embeddedPAN = value.slice(2, 12);
    const state = INDIAN_STATE_CODES[stateCode] || `State ${stateCode}`;
    return {
      valid: ok,
      checksumValid: ok,
      message: ok
        ? `GSTIN checksum valid · ${state} · PAN: ${embeddedPAN}`
        : `GSTIN checksum invalid (expected ${expectedCheck} at position 15) — number may be incorrect`,
      info: ok ? { state, embeddedPAN, stateCode } : null,
    };
  }

  return { valid: true, message: `${type} format valid` };
}

/** Quick single-field inline result for rendering */
export function StatutoryBadge({ type, value }) {
  if (!value || type === "Others") return null;
  const { valid, message } = validateStatutory(type, value);
  if (valid === null) return null;
  const color = valid ? "#4ade80" : "#f87171";
  const bg = valid ? "#052e16" : "#450a0a";
  return (
    <span style={{ display:"block", marginTop:3, fontSize:11, color, background:bg, borderRadius:4, padding:"2px 6px" }}>
      {valid ? "✓" : "✗"} {message}
    </span>
  );
}

export { INDIAN_STATE_CODES };
