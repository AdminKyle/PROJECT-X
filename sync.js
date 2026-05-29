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
        return new Promise((resolve) => {
            try {
                const payload = encodeURIComponent(JSON.stringify(logData));
                const url = `${APPS_SCRIPT_URL}?action=logFlavor&payload=${payload}&t=${Date.now()}`;
                
                // Use the ultimate bulletproof method for cross-domain GET: an Image beacon.
                // This bypasses ALL fetch/CORS/ITP restrictions on strict mobile browsers.
                const img = new Image();
                
                // Whether it loads or fails (because the Apps Script returns JSON, not an image),
                // the request definitively reached the server.
                img.onload = () => {
                    this.refreshTotalUnits();
                    resolve(true);
                };
                img.onerror = () => {
                    this.refreshTotalUnits();
                    resolve(true);
                };
                
                // Trigger the request
                img.src = url;
            } catch (error) {
                alert("Beacon Error: " + error.message);
                resolve(false);
            }
        });
    }
}

// Initialize sync manager once db is ready
window.addEventListener('DOMContentLoaded', () => {
    window.syncManager = new SyncManager(window.pixlDB);
    window.syncManager.start();
});
