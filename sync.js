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
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify(logData)
            });

            if (response.ok) {
                try {
                    const data = await response.json();
                    if (data) {
                        if (data.totalLoggedUnits !== undefined) {
                            if (window.updateTotalUnits) window.updateTotalUnits(data.totalLoggedUnits);
                        } else if (data.totalUnits !== undefined) {
                            if (window.updateTotalUnits) window.updateTotalUnits(data.totalUnits);
                        }
                    }
                } catch (e) {
                    // Ignore JSON parse errors in case of opaque or non-json responses
                }
                return true;
            }
            return response.status === 0;
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
