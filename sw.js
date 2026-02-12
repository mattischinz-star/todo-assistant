// Service Worker für ToDo Assistent PWA
const CACHE_NAME = 'todo-assistant-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/storage.js',
    '/speech.js',
    '/ai-parser.js',
    '/notifications.js',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg'
];

// Installation
self.addEventListener('install', (event) => {
    console.log('Service Worker wird installiert...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache geöffnet');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Alle Ressourcen gecached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Cache fehlgeschlagen:', error);
            })
    );
});

// Aktivierung
self.addEventListener('activate', (event) => {
    console.log('Service Worker aktiviert');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => {
                        console.log('Alter Cache gelöscht:', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// Fetch Handler - Network First mit Cache Fallback
self.addEventListener('fetch', (event) => {
    // API Requests nicht cachen
    if (event.request.url.includes('api.anthropic.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Erfolgreiche Response cachen
                if (response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Bei Netzwerkfehler aus Cache laden
                return caches.match(event.request).then((response) => {
                    if (response) {
                        return response;
                    }
                    // Fallback für Navigation zu index.html
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Push Notifications Handler
self.addEventListener('push', (event) => {
    console.log('Push Nachricht empfangen');

    const options = {
        body: event.data ? event.data.text() : 'Neue Benachrichtigung',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now()
        },
        actions: [
            { action: 'open', title: 'Öffnen' },
            { action: 'close', title: 'Schließen' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('ToDo Assistent', options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
    console.log('Notification geklickt');
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            // Existierendes Fenster fokussieren
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Oder neues Fenster öffnen
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

// Periodic Background Sync (falls unterstützt)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-reminders') {
        console.log('Periodischer Sync: Erinnerungen prüfen');
        // Hier könnte man Erinnerungen prüfen
        // Aber IndexedDB ist im SW eingeschränkt
    }
});
