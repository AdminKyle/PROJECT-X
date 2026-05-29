const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwYi9Rz4_wDm2182wbW5QKrslQ4GqurZvLPkFMJx0dtiPd1hJcZTAm1I23xByiZ9JKR/exec';
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
            // Use GET with encoded payload to avoid POST redirect/CORS issues
            // with Google Apps Script. The server-side deduplication via eventId
            // guarantees data integrity even if the same request is sent twice.
            const payload = encodeURIComponent(JSON.stringify(logData));
            const url = `${APPS_SCRIPT_URL}?action=logFlavor&payload=${payload}&t=${Date.now()}`;
            
            const response = await fetch(url, {
                method: 'GET',
                mode: 'no-cors' // Crucial for bypassing Safari ITP and strict CORS on mobile
            });
            
            // With no-cors, the response is opaque (status 0) and we cannot read the JSON body.
            // But if fetch didn't throw an error, the request reached the Google server.
            console.log('[Sync] GET request completed (opaque response)');
            
            // Trigger a separate background refresh to get the updated unit count
            this.refreshTotalUnits();
            
            return true;
        } catch (error) {
            console.error('[Sync] Fetch error:', error);
            return false;
        }
    }
}

// Initialize sync manager once db is ready
window.addEventListener('DOMContentLoaded', () => {
    window.syncManager = new SyncManager(window.pixlDB);
    window.syncManager.start();
});
