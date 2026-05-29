const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwYi9Rz4_wDm2182wbW5QKrslQ4GqurZvLPkFMJx0dtiPd1hJcZTAm1I23xByiZ9JKR/exec';
const SYNC_INTERVAL_MS = 5000; // 5 seconds

class SyncManager {
    constructor(db) {
        this.db = db;
        this.isSyncing = false;
    }

    start() {
        setInterval(() => this.syncNow(), SYNC_INTERVAL_MS);
        window.addEventListener('online', () => this.syncNow());
    }

    async syncNow() {
        if (this.isSyncing || !navigator.onLine) {
            return;
        }

        this.isSyncing = true;
        try {
            const pendingLogs = await this.db.getPendingLogs();

            if (pendingLogs.length === 0) {
                this.isSyncing = false;
                return;
            }

            console.log(`[Sync] Attempting to sync ${pendingLogs.length} logs...`);

            for (const log of pendingLogs) {
                const success = await this.sendToServer(log);
                if (success) {
                    await this.db.removeLog(log.eventId);
                    console.log(`[Sync] Successfully synced and removed: ${log.eventId}`);
                } else {
                    console.error(`[Sync] Failed to sync: ${log.eventId}. Will retry later.`);
                    break;
                }
            }
        } catch (error) {
            console.error('[Sync] Error during sync process:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    async sendToServer(logData) {
        try {
            const payload = encodeURIComponent(JSON.stringify(logData));
            const url = `${APPS_SCRIPT_URL}?action=logFlavor&payload=${payload}&t=${Date.now()}`;
            
            const response = await fetch(url, { redirect: 'follow' });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.success) {
                    console.log('[Sync] Log accepted by server:', data.result);
                    
                    // Update total units from the authoritative server count
                    const units = data.totalLoggedUnits !== undefined ? data.totalLoggedUnits : data.totalUnits;
                    if (units !== undefined && window.updateTotalUnits) {
                        window.updateTotalUnits(units);
                    }
                    return true;
                }
            }
            console.error('[Sync] Server rejected log or returned non-ok status');
            return false;
        } catch (error) {
            console.error('[Sync] Fetch error:', error);
            return false;
        }
    }

    async refreshTotalUnits() {
        try {
            const res = await fetch(`${APPS_SCRIPT_URL}?action=getProducts&t=${Date.now()}`);
            const data = await res.json();
            if (data) {
                const units = data.totalLoggedUnits !== undefined ? data.totalLoggedUnits : data.totalUnits;
                if (units !== undefined && window.updateTotalUnits) {
                    window.updateTotalUnits(units);
                }
            }
        } catch (e) {
            // Non-critical — counter will update on next app load
            console.log('[Sync] refreshTotalUnits failed (non-critical):', e);
        }
    }
}

// Initialize sync manager once db is ready
window.addEventListener('DOMContentLoaded', () => {
    window.syncManager = new SyncManager(window.pixlDB);
    window.syncManager.start();
});
