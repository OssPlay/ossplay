import { Client } from "ssh2";

export interface TestConnectionResult {
	ok: boolean;
	output?: string;
	error?: string;
}

const CONNECT_TIMEOUT_MS = 8000;
const OVERALL_TIMEOUT_MS = 12000;

// The whole "test connection" primitive: connect, run `whoami`, report
// what came back. Deliberately this minimal — no Docker/container
// involvement, no multi-step provisioning — see PRD.md §4 and MEMORY.md on
// why real worker provisioning is a placeholder until a dedicated worker
// image exists. Never throws; every failure mode (bad host, auth
// rejected, timeout) resolves as { ok: false, error }.
export function testSshConnection(params: {
	host: string;
	port: number;
	username: string;
	privateKeyPem: string;
}): Promise<TestConnectionResult> {
	return new Promise((resolve) => {
		const conn = new Client();
		let settled = false;

		const overallTimeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			conn.end();
			resolve({ ok: false, error: "Connection timed out" });
		}, OVERALL_TIMEOUT_MS);

		function finish(result: TestConnectionResult) {
			if (settled) return;
			settled = true;
			clearTimeout(overallTimeout);
			conn.end();
			resolve(result);
		}

		conn
			.on("ready", () => {
				conn.exec("whoami", (err, stream) => {
					if (err) {
						finish({ ok: false, error: err.message });
						return;
					}
					let output = "";
					let stderr = "";
					stream
						.on("close", (code: number) => {
							if (code !== 0) {
								finish({ ok: false, error: stderr.trim() || `Command exited with code ${code}` });
								return;
							}
							finish({ ok: true, output: output.trim() });
						})
						.on("data", (data: Buffer) => {
							output += data.toString();
						})
						.stderr.on("data", (data: Buffer) => {
							stderr += data.toString();
						});
				});
			})
			.on("error", (err) => {
				finish({ ok: false, error: err.message });
			})
			.connect({
				host: params.host,
				port: params.port,
				username: params.username,
				privateKey: params.privateKeyPem,
				readyTimeout: CONNECT_TIMEOUT_MS,
			});
	});
}
