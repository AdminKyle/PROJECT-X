document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const searchTrigger = document.getElementById('search-trigger');
    const searchOverlay = document.getElementById('search-overlay');
    const closeSearch = document.getElementById('close-search');
    const searchInput = document.getElementById('search-input');
    const searchResultsContainer = document.getElementById('search-results');
    const setupModal = document.getElementById('setup-modal');
    const usernameInput = document.getElementById('username-input');
    const pinInput = document.getElementById('pin-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const toastContainer = document.getElementById('toast-container');
    const totalUnitsCounter = document.getElementById('total-units-counter');
    const lastLoggedName = document.getElementById('last-logged-name');

    // State
    let currentUser = localStorage.getItem('pixl_user') || null;
    // Load previously cached flavors if available (crucial for offline)
    let flavors = JSON.parse(localStorage.getItem('pixl_flavors_cache') || '[]');
    let fuse = null;
    let lastTapTime = 0;
    let localTotalUnits = parseInt(localStorage.getItem('pixl_total_units') || '0', 10);

    // Initialization
    function init() {
        checkUserSetup();
        updateCounterUI(localTotalUnits);
        fetchFlavors();
        setupEventListeners();
        registerServiceWorker();
    }

    // Expose counter update so sync.js can call it when server responds
    window.updateTotalUnits = function(units) {
        if (typeof units === 'number') {
            localTotalUnits = units;
            localStorage.setItem('pixl_total_units', units);
            updateCounterUI(units);
        }
    };

    function updateCounterUI(units) {
        if (totalUnitsCounter) {
            totalUnitsCounter.textContent = units;
        }
    }

    function updateLastLogged(flavorName) {
        if (lastLoggedName) {
            lastLoggedName.textContent = flavorName;
        }
        localStorage.setItem('pixl_last_logged', flavorName);
    }

    // Restore last logged on init
    const savedLastLogged = localStorage.getItem('pixl_last_logged');
    if (savedLastLogged && lastLoggedName) {
        lastLoggedName.textContent = savedLastLogged;
    }

    function checkUserSetup() {
        if (!currentUser) {
            setupModal.classList.remove('hidden');
        }
    }

    async function fetchFlavors() {
        // Initialize search immediately with whatever is in the local cache
        initFuse();

        try {
            // Attempt to fetch from App Script
            // Added cache-buster to ensure we NEVER load an old cached list from the browser
            const response = await fetch(`${APPS_SCRIPT_URL}?action=getProducts&t=${Date.now()}`);
            const data = await response.json();
            
            // Flexible extraction depending on how the Apps Script returns data
            if (data && Array.isArray(data)) {
                // If it's a flat array of objects
                const extracted = data.map(item => ({ name: item.product_name || item.product || item.flavour || item.name || item[1] || "Unknown" })).filter(f => f.name !== "Unknown");
                if (extracted.length > 0) {
                    flavors = extracted;
                    localStorage.setItem('pixl_flavors_cache', JSON.stringify(flavors));
                }
            } else if (data) {
                if (data.products && data.products.length > 0) {
                    flavors = data.products.map(p => ({ name: p.product_name || p.name || p.product || p.flavour }));
                    localStorage.setItem('pixl_flavors_cache', JSON.stringify(flavors));
                }
                if (data.totalLoggedUnits !== undefined) {
                    window.updateTotalUnits(data.totalLoggedUnits);
                } else if (data.totalUnits !== undefined) {
                    window.updateTotalUnits(data.totalUnits);
                }
            }
            
            initFuse();
        } catch (e) {
            console.log("Could not fetch latest flavors, using offline cache/mocks", e);
        }
    }

    function initFuse() {
        fuse = new Fuse(flavors, {
            keys: ['name'],
            threshold: 0.4, // Loose matching
            includeScore: true
        });
    }

    function setupEventListeners() {
        // Login
        loginBtn.addEventListener('click', handleLogin);

        // Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // Search Trigger
        searchTrigger.addEventListener('click', openSearch);

        // Close Search
        closeSearch.addEventListener('click', closeSearchOverlay);

        // Search Input
        searchInput.addEventListener('input', handleSearch);
    }

    function handleLogout() {
        localStorage.removeItem('pixl_user');
        currentUser = null;
        usernameInput.value = '';
        pinInput.value = '';
        loginError.classList.add('hidden');
        setupModal.classList.remove('hidden');
    }

    async function handleLogin() {
        const username = usernameInput.value.trim();
        const pin = pinInput.value.trim();

        if (!username || !pin) {
            loginError.textContent = "Please enter both Username and PIN.";
            loginError.classList.remove('hidden');
            return;
        }

        if (!navigator.onLine) {
            loginError.textContent = "You must be online to log in for the first time.";
            loginError.classList.remove('hidden');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = "Logging in...";
        loginError.classList.add('hidden');

        try {
            // Adjust the URL and params to match the exact Apps Script signature
            const response = await fetch(`${APPS_SCRIPT_URL}?action=login&username=${encodeURIComponent(username)}&pin=${encodeURIComponent(pin)}`);
            const data = await response.json();

            // Assuming the script returns { success: true } or similar upon a valid login
            // You can adjust this condition based on what the script actually returns
            if (data && (data.success || data.status === 'success' || data.user)) {
                localStorage.setItem('pixl_user', username);
                currentUser = username;
                setupModal.classList.add('hidden');
            } else {
                loginError.textContent = data.message || "Invalid Username or PIN.";
                loginError.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Login error:", error);
            loginError.textContent = "Network error or script failure. Try again.";
            loginError.classList.remove('hidden');
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = "Login";
        }
    }

    function openSearch() {
        searchOverlay.classList.remove('hidden');
        searchInput.value = '';
        renderResults(flavors.slice(0, 10)); // Show top/recent flavors initially
        setTimeout(() => searchInput.focus(), 100);
    }

    function closeSearchOverlay() {
        searchOverlay.classList.add('hidden');
        searchInput.blur();
    }

    function handleSearch(e) {
        const query = e.target.value.trim();
        if (!query) {
            renderResults(flavors.slice(0, 10));
            return;
        }

        if (fuse) {
            const results = fuse.search(query).map(result => result.item);
            renderResults(results);
        }
    }

    function renderResults(results) {
        searchResultsContainer.innerHTML = '';
        if (results.length === 0) {
            searchResultsContainer.innerHTML = '<div class="result-item-empty">No flavours found</div>';
            return;
        }

        results.forEach(flavor => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `<span class="result-item-name">${flavor.name}</span>`;
            
            div.addEventListener('click', () => handleFlavorSelect(flavor.name));
            searchResultsContainer.appendChild(div);
        });
    }

    function generateEventId() {
        let counter = parseInt(localStorage.getItem('pixl_log_counter') || '0', 10);
        counter++;
        localStorage.setItem('pixl_log_counter', counter);
        
        // Strip spaces and special chars from username for a clean ID prefix
        const userPrefix = (currentUser || 'USER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        return `LOG_${userPrefix}_${counter}`;
    }

    async function handleFlavorSelect(flavorName) {
        // Layer 1: UI Tap Lock (300ms suppression)
        const now = Date.now();
        if (now - lastTapTime < 400) {
            return; // Prevent accidental double taps
        }
        lastTapTime = now;

        // Instant UI Feedback
        closeSearchOverlay();
        showToast(`✓ ${flavorName} logged`);
        updateLastLogged(flavorName);
        
        // Optimistically increment the counter
        window.updateTotalUnits(localTotalUnits + 1);

        // Layer 2: Client Event ID & payload
        const logData = {
            action: "logFlavor",
            eventId: generateEventId(),
            flavour: flavorName,
            barcode: "",
            user: currentUser || "Unknown User",
            quantity: 1,
            timestamp: new Date().toISOString()
        };

        // Queue in IndexedDB for offline support
        if (window.pixlDB && window.syncManager) {
            window.pixlDB.addLog(logData).then(() => {
                // Trigger sync immediately
                window.syncManager.syncNow().catch(err => alert("Sync Network Error: " + err.message));
            }).catch(err => {
                console.error('Failed to queue log:', err);
                alert('Database Error: Your device is blocking local storage. ' + err);
            });
        } else {
            alert("System Error: App failed to initialize the database in the background.");
        }
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        // Trigger reflow to apply animation
        void toast.offsetWidth;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then(reg => {
                    console.log('SW registered: ', reg.scope);
                }).catch(err => {
                    console.log('SW registration failed: ', err);
                });
            });
        }
    }

    init();
});
