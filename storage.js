// IndexedDB Storage für ToDo-Aufgaben
const TodoStorage = {
    dbName: 'TodoAssistantDB',
    dbVersion: 1,
    storeName: 'tasks',
    db: null,

    // Datenbank initialisieren
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB Fehler:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB erfolgreich geöffnet');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Indizes für Abfragen
                    store.createIndex('dueDate', 'dueDate', { unique: false });
                    store.createIndex('priority', 'priority', { unique: false });
                    store.createIndex('completed', 'completed', { unique: false });

                    console.log('Object Store erstellt');
                }
            };
        });
    },

    // Aufgabe hinzufügen
    async addTask(task) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const taskData = {
                title: task.title,
                priority: task.priority || 'medium', // high, medium, low
                dueDate: task.dueDate || null,
                createdAt: new Date().toISOString(),
                completed: false,
                completedAt: null
            };

            const request = store.add(taskData);

            request.onsuccess = () => {
                taskData.id = request.result;
                console.log('Aufgabe hinzugefügt:', taskData);
                resolve(taskData);
            };

            request.onerror = () => {
                console.error('Fehler beim Hinzufügen:', request.error);
                reject(request.error);
            };
        });
    },

    // Alle Aufgaben abrufen
    async getAllTasks() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const tasks = request.result;
                // Sortieren: Nicht erledigt zuerst, dann nach Fälligkeit
                tasks.sort((a, b) => {
                    if (a.completed !== b.completed) {
                        return a.completed ? 1 : -1;
                    }
                    if (a.dueDate && b.dueDate) {
                        return new Date(a.dueDate) - new Date(b.dueDate);
                    }
                    if (a.dueDate) return -1;
                    if (b.dueDate) return 1;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
                resolve(tasks);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    },

    // Einzelne Aufgabe abrufen
    async getTask(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Aufgabe aktualisieren
    async updateTask(id, updates) {
        return new Promise(async (resolve, reject) => {
            const task = await this.getTask(id);
            if (!task) {
                reject(new Error('Aufgabe nicht gefunden'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const updatedTask = { ...task, ...updates };
            const request = store.put(updatedTask);

            request.onsuccess = () => {
                console.log('Aufgabe aktualisiert:', updatedTask);
                resolve(updatedTask);
            };

            request.onerror = () => reject(request.error);
        });
    },

    // Aufgabe als erledigt markieren
    async completeTask(id) {
        return this.updateTask(id, {
            completed: true,
            completedAt: new Date().toISOString()
        });
    },

    // Aufgabe löschen
    async deleteTask(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log('Aufgabe gelöscht:', id);
                resolve(true);
            };

            request.onerror = () => reject(request.error);
        });
    },

    // Aufgaben die bald fällig sind abrufen (für Erinnerungen)
    async getTasksDueSoon(daysAhead = 1) {
        const tasks = await this.getAllTasks();
        const now = new Date();
        const threshold = new Date();
        threshold.setDate(threshold.getDate() + daysAhead);

        return tasks.filter(task => {
            if (task.completed || !task.dueDate) return false;
            const dueDate = new Date(task.dueDate);
            return dueDate <= threshold && dueDate >= now;
        });
    },

    // Überfällige Aufgaben abrufen
    async getOverdueTasks() {
        const tasks = await this.getAllTasks();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return tasks.filter(task => {
            if (task.completed || !task.dueDate) return false;
            const dueDate = new Date(task.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate < now;
        });
    }
};

// Settings Storage (localStorage)
const SettingsStorage = {
    keys: {
        apiKey: 'todo_api_key',
        notifications: 'todo_notifications_enabled',
        lastReminderCheck: 'todo_last_reminder_check'
    },

    getApiKey() {
        return localStorage.getItem(this.keys.apiKey) || '';
    },

    setApiKey(key) {
        if (key) {
            localStorage.setItem(this.keys.apiKey, key);
        } else {
            localStorage.removeItem(this.keys.apiKey);
        }
    },

    getNotificationsEnabled() {
        return localStorage.getItem(this.keys.notifications) === 'true';
    },

    setNotificationsEnabled(enabled) {
        localStorage.setItem(this.keys.notifications, enabled.toString());
    },

    getLastReminderCheck() {
        return localStorage.getItem(this.keys.lastReminderCheck);
    },

    setLastReminderCheck(date) {
        localStorage.setItem(this.keys.lastReminderCheck, date);
    }
};
