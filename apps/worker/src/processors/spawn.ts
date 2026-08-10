// Shared by every processor that shells out to a system binary (ffmpeg,
// pdftoppm) — 3 call sites is where this codebase's own "extract after
// the 3rd repeat" threshold kicks in (CLAUDE.md).
export async function run(cmd: string, args: string[]): Promise<void> {
	const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
	const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	if (exitCode !== 0) throw new Error(`${cmd} failed (exit ${exitCode}): ${stderr}`);
}
