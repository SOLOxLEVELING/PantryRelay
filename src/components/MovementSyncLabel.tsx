import type { OutboxEntry } from '../lib/storage';

export function MovementSyncLabel({ entry }: { entry: OutboxEntry | undefined }) {
  switch (entry?.syncState) {
    case 'APPROVED_PENDING_SYNC': return <span className="movement-sync">Locally saved · Pending sync</span>;
    case 'SYNCED': return <span className="movement-sync synced-text">Synced</span>;
    case 'SYNC_ERROR': return <span className="movement-sync error-text">Sync error</span>;
    default: return <span className="movement-sync">Awaiting local save</span>;
  }
}
