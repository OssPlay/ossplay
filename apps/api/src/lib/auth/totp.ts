import { createHmac, randomBytes } from "node:crypto";

// Hand-rolled RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30s step) and RFC 4648
// base32. Unlike SMTP (see lib/mail/), this is a small, well-specified,
// easily-auditable algorithm — a fine hand-roll, same reasoning as the
// session-token scheme.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20; // 160 bits, the RFC-recommended length for SHA-1

function base32Encode(bytes: Buffer): string {
	let bits = 0;
	let value = 0;
	let output = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) {
		output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
	}
	return output;
}

function base32Decode(encoded: string): Buffer {
	const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
	let bits = 0;
	let value = 0;
	const bytes: number[] = [];
	for (const char of clean) {
		const index = BASE32_ALPHABET.indexOf(char);
		if (index === -1) continue;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bytes.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
	return base32Encode(randomBytes(SECRET_BYTES));
}

export function buildOtpauthUri(params: {
	secret: string;
	accountName: string;
	issuer: string;
}): string {
	const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
	const query = new URLSearchParams({
		secret: params.secret,
		issuer: params.issuer,
		algorithm: "SHA1",
		digits: String(DIGITS),
		period: String(STEP_SECONDS),
	});
	return `otpauth://totp/${label}?${query.toString()}`;
}

function hotp(secretBase32: string, counter: number): string {
	const key = base32Decode(secretBase32);
	const counterBuffer = Buffer.alloc(8);
	counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
	counterBuffer.writeUInt32BE(counter % 2 ** 32, 4);

	const digest = createHmac("sha1", key).update(counterBuffer).digest();
	const offset = digest.readUInt8(digest.length - 1) & 0xf;
	const binary = digest.readUInt32BE(offset) & 0x7fffffff;
	const code = binary % 10 ** DIGITS;
	return code.toString().padStart(DIGITS, "0");
}

export function generateTotpCode(secretBase32: string, at: number = Date.now()): string {
	return hotp(secretBase32, Math.floor(at / 1000 / STEP_SECONDS));
}

// Tolerates ±1 step (30s) of clock drift between server and authenticator app.
export function verifyTotpCode(
	secretBase32: string,
	code: string,
	at: number = Date.now(),
): boolean {
	const counter = Math.floor(at / 1000 / STEP_SECONDS);
	for (const offset of [0, -1, 1]) {
		if (hotp(secretBase32, counter + offset) === code) {
			return true;
		}
	}
	return false;
}
