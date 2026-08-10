// Shared by every processor that shells out to a system binary (ffmpeg,
// pdftoppm) — 3 call sites is where this codebase's own "extract after
// the 3rd repeat" threshold kicks in (CLAUDE.md).
export async function run(cmd: string, args: string[]): Promise<void> {
	const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
	const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	if (exitCode !== 0) throw new Error(`${cmd} failed (exit ${exitCode}): ${stderr}`);
}

// Same shape as run(), but for the metadata-probing binaries (ffprobe,
// pdfinfo) whose whole point is their stdout, not a file they wrote to
// disk. Kept distinct from run() rather than adding an options flag there —
// every run() call site truly discards stdout, every runCapture() call site
// truly needs it.
export async function runCapture(cmd: string, args: string[]): Promise<string> {
	const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) throw new Error(`${cmd} failed (exit ${exitCode}): ${stderr}`);
	return stdout;
}
