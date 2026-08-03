// Placeholder for the zero-CLI auto-updater sidecar described in PRD.md §2.2.
// Not implemented yet: this only wires the container and its docker.sock
// mount into docker-compose.yml. The real flow (receive an authenticated
// request from the API, `bun docker pull`, run `drizzle-kit migrate` via a
// temporary container, zero-downtime rolling restart) is feature work for a
// later session, not part of this infra scaffold.
console.log("[updater] placeholder — auto-update flow not implemented yet (see PRD.md §2.2)");

setInterval(() => {}, 2 ** 31 - 1);
