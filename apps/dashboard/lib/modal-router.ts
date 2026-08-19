import { openUpdateDialog } from "./update-dialog-store";

// Keyed openers for ?modal=<key> deep links (see
// components/providers/modal-router.tsx) — e.g. a link from an email
// notification can open a specific dialog on load without the linker
// needing to know that dialog's internal open/close mechanism. Add a new
// entry here for any other dialog that should be deep-linkable.
export const MODAL_REGISTRY: Record<string, () => void> = {
	"update-instance": openUpdateDialog,
};
