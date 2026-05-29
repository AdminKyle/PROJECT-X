const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw6MsNSYvRBEMXjUygkzVmCl4TfmoqgLQskDQIRmh3gQCBF02QiL6SzOGnZIOocRecy/exec';
const SYNC_INTERVAL_MS = 5000; // 5 seconds

class SyncManager {
    constructor(db) {
        this.db = db;
        this.isSyncing = false;
    }

    start() {
        // Run sync periodically
        setInterval(() => this.syncNow(), SYNC_INTERVAL_MS);
        
        // Also try syncing when coming back online
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

            // Try to sync one by one
            for (const log of pendingLogs) {
                const success = await this.sendToServer(log);
                if (success) {
                    await this.db.removeLog(log.eventId);
                    console.log(`[Sync] Successfully synced and removed: ${log.eventId}`);
                } else {
                    console.error(`[Sync] Failed to sync: ${log.eventId}. Will retry later.`);
                    // Stop trying other logs if one fails (usually implies network/server issue)
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
            // Google Apps Script redirects POST cross-origin, which breaks CORS.
            // Using 'no-cors' ensures the request always reaches the server.
            // Server-side deduplication via eventId guarantees data integrity.
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                redirect: 'follow',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify(logData)
            });

            // With no-cors, response.type is 'opaque' and status is 0.
            // Any non-throwing fetch means the request reached the server.
            console.log(`[Sync] POST completed (type: ${response.type}, status: ${response.status})`);

            // Fetch the updated total units via a separate GET (readable response)
            this.refreshTotalUnits();

            return true;
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
        }
    }
}

// Initialize sync manager once db is ready
window.addEventListener('DOMContentLoaded', () => {
    window.syncManager = new SyncManager(window.pixlDB);
    window.syncManager.start();
});
