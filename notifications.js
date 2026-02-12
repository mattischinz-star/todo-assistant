// Erinnerungs- und Benachrichtigungssystem
const NotificationManager = {
    isSupported: false,
    permission: 'default',
    isIOS: false,

    // Initialisierung
    async init() {
        // iOS Erkennung
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        this.isSupported = 'Notification' in window;

        if (this.isSupported) {
            this.permission = Notification.permission;
        }

        console.log('Notifications supported:', this.isSupported);
        console.log('Permission:', this.permission);
        console.log('iOS detected:', this.isIOS);

        return this.isSupported;
    },

    // Prüfen ob PWA auf Home-Screen installiert ist (iOS)
    isStandalone() {
        return window.navigator.standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches;
    },

    // Berechtigung anfordern
    async requestPermission() {
        // iOS Safari ohne PWA unterstützt keine Notifications
        if (this.isIOS && !this.isStandalone()) {
            console.log('iOS: Notifications nur in installierter PWA verfügbar');
            return 'ios-not-installed';
        }

        if (!this.isSupported) {
            return false;
        }

        if (this.permission === 'granted') {
            return true;
        }

        try {
            const result = await Notification.requestPermission();
            this.permission = result;
            return result === 'granted';
        } catch (error) {
            console.error('Fehler bei Berechtigungsanfrage:', error);
            return false;
        }
    },

    // Benachrichtigung senden
    async notify(title, body, options = {}) {
        if (!this.isSupported || this.permission !== 'granted') {
            console.log('Notifications nicht verfügbar oder nicht erlaubt');
            return false;
        }

        try {
            const notification = new Notification(title, {
                body,
                icon: 'icons/icon-192.png',
                badge: 'icons/icon-192.png',
                tag: options.tag || 'todo-reminder',
                renotify: options.renotify || false,
                ...options
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
                if (options.onClick) options.onClick();
            };

            return true;
        } catch (error) {
            console.error('Fehler beim Senden der Benachrichtigung:', error);
            return false;
        }
    },

    // Fällige Aufgaben prüfen und benachrichtigen
    async checkAndNotify() {
        const notificationsEnabled = SettingsStorage.getNotificationsEnabled();
        if (!notificationsEnabled) {
            console.log('Benachrichtigungen deaktiviert');
            return { dueSoon: [], overdue: [] };
        }

        // Nur einmal pro Tag prüfen
        const lastCheck = SettingsStorage.getLastReminderCheck();
        const today = new Date().toISOString().split('T')[0];

        // Aufgaben abrufen
        const dueSoon = await TodoStorage.getTasksDueSoon(1);
        const overdue = await TodoStorage.getOverdueTasks();

        // Nur benachrichtigen wenn neuer Tag
        if (lastCheck !== today) {
            if (overdue.length > 0) {
                await this.notify(
                    'Überfällige Aufgaben',
                    `Du hast ${overdue.length} überfällige Aufgabe${overdue.length > 1 ? 'n' : ''}.`,
                    { tag: 'overdue-reminder' }
                );
            }

            if (dueSoon.length > 0) {
                const titles = dueSoon.slice(0, 3).map(t => t.title).join(', ');
                await this.notify(
                    'Aufgaben bald fällig',
                    `${dueSoon.length} Aufgabe${dueSoon.length > 1 ? 'n' : ''} fällig: ${titles}`,
                    { tag: 'due-soon-reminder' }
                );
            }

            SettingsStorage.setLastReminderCheck(today);
        }

        return { dueSoon, overdue };
    },

    // In-App Banner anzeigen (Fallback wenn Notifications nicht verfügbar)
    showInAppReminder(tasks, type = 'due') {
        const banner = document.getElementById('reminderBanner');
        const text = document.getElementById('reminderText');

        if (!banner || !text || tasks.length === 0) {
            if (banner) banner.classList.add('hidden');
            return;
        }

        if (type === 'overdue') {
            text.textContent = `${tasks.length} überfällige Aufgabe${tasks.length > 1 ? 'n' : ''}!`;
        } else {
            const titles = tasks.slice(0, 2).map(t => t.title).join(', ');
            text.textContent = `Bald fällig: ${titles}${tasks.length > 2 ? '...' : ''}`;
        }

        banner.classList.remove('hidden');
    }
};
