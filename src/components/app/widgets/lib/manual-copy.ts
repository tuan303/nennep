/**
 * Request store of the manual-copy dialog (framework-free – unit-tested). When the clipboard is blocked (in-app
 * WebViews such as Zalo, plain-HTTP LAN access, denied permission), the text is shown in a read-only box the user can
 * select and copy by hand instead of only a "could not copy" toast. <ManualCopyHost/> renders it.
 */

export interface ManualCopyRequest {
  id: number;
  title: string;
  text: string;
}

type Listener = () => void;

let current: ManualCopyRequest | null = null;
let hosts = 0;
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const manualCopyStore = {
  get(): ManualCopyRequest | null {
    return current;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Called by <ManualCopyHost/> while mounted; returns the unregister function. */
  registerHost(): () => void {
    hosts++;
    return () => {
      hosts = Math.max(0, hosts - 1);
      if (hosts === 0 && current) {
        current = null;
        emit();
      }
    };
  },
  /** Show `text` for manual copying; false when no host is mounted (the caller falls back to a toast). */
  open(text: string, title: string): boolean {
    if (hosts === 0) return false;
    current = { id: ++seq, title, text };
    emit();
    return true;
  },
  close(): void {
    if (!current) return;
    current = null;
    emit();
  },
};
