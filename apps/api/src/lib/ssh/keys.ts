import { createHash } from "node:crypto";
import { utils as sshUtils } from "ssh2";

export interface SshKeyMaterial {
	privateKeyPem: string;
	publicKeyLine: string; // authorized_keys format: "ssh-ed25519 AAAA..."
	fingerprint: string; // "SHA256:...", matching `ssh-keygen -lf`'s output
	keyType: string;
}

// Both generate and paste modes end up going through this — a generated
// key is itself just a private key PEM run through the same parser, so
// there's one code path for "derive the public key + fingerprint from a
// private key" rather than two.
function deriveKeyMaterial(privateKeyPem: string): SshKeyMaterial {
	const parsed = sshUtils.parseKey(privateKeyPem);
	if (parsed instanceof Error) {
		throw new Error(`Could not read this private key: ${parsed.message}`);
	}
	if (Array.isArray(parsed)) {
		throw new Error("Expected a single private key, not a key collection");
	}
	if (!parsed.isPrivateKey()) {
		throw new Error("Expected a private key, not a public key");
	}

	const publicSsh = parsed.getPublicSSH();
	const publicKeyLine = `${parsed.type} ${publicSsh.toString("base64")} ossplay`;
	// OpenSSH's own fingerprint format: base64 of the SHA-256 digest of the
	// SSH wire-format public key, with trailing `=` padding stripped.
	const digest = createHash("sha256").update(publicSsh).digest("base64").replace(/=+$/, "");

	return {
		privateKeyPem,
		publicKeyLine,
		fingerprint: `SHA256:${digest}`,
		keyType: parsed.type,
	};
}

export function generateEd25519KeyPair(): SshKeyMaterial {
	const { private: privateKeyPem } = sshUtils.generateKeyPairSync("ed25519");
	return deriveKeyMaterial(privateKeyPem);
}

export function generateRSAKeyPair(): SshKeyMaterial {
	const { private: privateKeyPem } = sshUtils.generateKeyPairSync("rsa", {
		bits: 4096,
	});
	return deriveKeyMaterial(privateKeyPem);
}

// Throws (with a message safe to show the user) if the pasted text isn't a
// readable, unencrypted private key — passphrase-protected keys aren't
// supported since there's nowhere in this flow to collect the passphrase.
export function parsePrivateKey(pem: string): SshKeyMaterial {
	return deriveKeyMaterial(pem);
}
