// Haupt-App Logik
const App = {
    currentTaskId: null,

    // App initialisieren
    async init() {
        console.log('App wird initialisiert...');

        try {
            // Storage initialisieren
            await TodoStorage.init();

            // Spracherkennung initialisieren
            if (SpeechRecognizer.isSupported()) {
                SpeechRecognizer.init();
                this.setupSpeechHandlers();
            } else {
                this.showError('Spracherkennung wird in diesem Browser nicht unterstützt.');
            }

            // Notifications initialisieren
            await NotificationManager.init();

            // UI Event Listener
            this.setupEventListeners();

            // Tasks laden und anzeigen
            await this.renderTasks();

            // Einstellungen laden
            this.loadSettings();

            // Erinnerungen prüfen
            await this.checkReminders();

            // Service Worker registrieren
            this.registerServiceWorker();

            console.log('App erfolgreich initialisiert');
        } catch (error) {
            console.error('Fehler bei der Initialisierung:', error);
            this.showError('Fehler beim Laden der App: ' + error.message);
        }
    },

    // Event Listener einrichten
    setupEventListeners() {
        // Voice Button
        const voiceBtn = document.getElementById('voiceBtn');
        voiceBtn.addEventListener('click', () => this.toggleVoiceInput());

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());

        // Task Modal
        document.getElementById('closeTaskModal').addEventListener('click', () => this.closeTaskModal());
        document.getElementById('completeTask').addEventListener('click', () => this.completeCurrentTask());
        document.getElementById('deleteTask').addEventListener('click', () => this.deleteCurrentTask());
        document.getElementById('taskReminderToggle').addEventListener('change', (e) => this.toggleReminder(e.target.checked));

        // Reminder Banner
        document.getElementById('dismissReminder').addEventListener('click', () => {
            document.getElementById('reminderBanner').classList.add('hidden');
        });

        // Modal Backdrop schließen
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    },

    // Spracheingabe Handler
    setupSpeechHandlers() {
        SpeechRecognizer.onStart = () => {
            document.getElementById('voiceBtn').classList.add('recording');
            document.getElementById('recordingIndicator').classList.remove('hidden');
        };

        SpeechRecognizer.onEnd = () => {
            document.getElementById('voiceBtn').classList.remove('recording');
            document.getElementById('recordingIndicator').classList.add('hidden');
        };

        SpeechRecognizer.onResult = async (transcript) => {
            console.log('Transkript:', transcript);
            await this.processVoiceInput(transcript);
        };

        SpeechRecognizer.onError = (message) => {
            this.showError(message);
        };
    },

    // Spracheingabe umschalten
    toggleVoiceInput() {
        if (SpeechRecognizer.isListening) {
            SpeechRecognizer.stop();
        } else {
            SpeechRecognizer.start();
        }
    },

    // Spracheingabe verarbeiten
    async processVoiceInput(transcript) {
        const apiKey = SettingsStorage.getApiKey();

        document.getElementById('processingIndicator').classList.remove('hidden');

        try {
            let taskData;

            if (apiKey) {
                // KI-basiertes Parsing
                taskData = await AIParser.parseTask(transcript, apiKey);
            } else {
                // Fallback: Einfaches Parsing
                taskData = AIParser.parseTaskSimple(transcript);
                this.showError('Kein API-Key konfiguriert. Einfaches Parsing wird verwendet.');
            }

            // Task speichern
            const savedTask = await TodoStorage.addTask(taskData);

            // UI aktualisieren
            await this.renderTasks();

            // Erfolg anzeigen
            this.showSuccess(`Aufgabe hinzugefügt: ${savedTask.title}`);

        } catch (error) {
            console.error('Fehler bei der Verarbeitung:', error);
            this.showError(error.message);
        } finally {
            document.getElementById('processingIndicator').classList.add('hidden');
        }
    },

    // Tasks rendern
    async renderTasks() {
        const taskList = document.getElementById('taskList');
        const tasks = await TodoStorage.getAllTasks();

        if (tasks.length === 0) {
            taskList.innerHTML = `<p class="empty-state">Keine Aufgaben vorhanden.<br>Tippe auf das Mikrofon um eine Aufgabe hinzuzufügen.</p>`;
            return;
        }

        taskList.innerHTML = tasks.map(task => this.createTaskHTML(task)).join('');

        // Event Listener für Tasks
        taskList.querySelectorAll('.task-item').forEach(item => {
            const taskId = parseInt(item.dataset.id);
            const taskInner = item.querySelector('.task-inner');

            // Checkbox Click
            item.querySelector('.task-checkbox').addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.toggleTaskComplete(taskId);
            });

            // Task Click (Details)
            taskInner.addEventListener('click', () => this.openTaskModal(taskId));

            // Swipe to Delete
            this.setupSwipeToDelete(item, taskId);
        });
    },

    // Swipe to Delete Setup
    setupSwipeToDelete(item, taskId) {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;

        const taskInner = item.querySelector('.task-inner');

        item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            taskInner.style.transition = 'none';
        }, { passive: true });

        item.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const diffX = currentX - startX;

            // Nur nach links swipen erlauben
            if (diffX < 0) {
                const translateX = Math.max(diffX, -100);
                taskInner.style.transform = `translateX(${translateX}px)`;
            }
        }, { passive: true });

        item.addEventListener('touchend', async () => {
            if (!isDragging) return;
            isDragging = false;

            const diffX = currentX - startX;
            taskInner.style.transition = 'transform 0.3s ease';

            if (diffX < -80) {
                // Löschen
                taskInner.style.transform = 'translateX(-100%)';
                setTimeout(async () => {
                    await TodoStorage.deleteTask(taskId);
                    await this.renderTasks();
                }, 200);
            } else {
                // Zurücksetzen
                taskInner.style.transform = 'translateX(0)';
            }

            startX = 0;
            currentX = 0;
        });
    },

    // Task HTML erstellen
    createTaskHTML(task) {
        const prioClass = `prio-${task.priority}`;
        const completedClass = task.completed ? 'completed' : '';
        const dueInfo = this.formatDueDate(task.dueDate, task.dueTime);
        const reminderIcon = task.reminder ? '<span class="reminder-icon" title="Erinnerung aktiv">🔔</span>' : '';

        return `
            <div class="task-item ${prioClass} ${completedClass}" data-id="${task.id}">
                <div class="task-inner">
                    <div class="task-checkbox">
                        <svg viewBox="0 0 24 24">
                            <path fill="currentColor" d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
                        </svg>
                    </div>
                    <div class="task-content">
                        <div class="task-title">${this.escapeHTML(task.title)} ${reminderIcon}</div>
                        <div class="task-meta">
                            <span class="prio-badge ${task.priority}">${this.formatPriority(task.priority)}</span>
                            ${dueInfo ? `<span class="${dueInfo.class}">${dueInfo.text}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="task-delete">Löschen</div>
            </div>
        `;
    },

    // Fälligkeitsdatum formatieren
    formatDueDate(dueDate, dueTime) {
        if (!dueDate) return null;

        const due = new Date(dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
        const timeStr = dueTime ? ` um ${dueTime}` : '';

        if (diffDays < 0) {
            return { text: `Überfällig (${this.formatDate(dueDate)}${timeStr})`, class: 'overdue' };
        } else if (diffDays === 0) {
            return { text: `Heute${timeStr}`, class: 'due-soon' };
        } else if (diffDays === 1) {
            return { text: `Morgen${timeStr}`, class: 'due-soon' };
        } else if (diffDays <= 7) {
            return { text: `In ${diffDays} Tagen${timeStr}`, class: '' };
        } else {
            return { text: `${this.formatDate(dueDate)}${timeStr}`, class: '' };
        }
    },

    // Datum formatieren
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    // Priorität formatieren
    formatPriority(priority) {
        const labels = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };
        return labels[priority] || 'Mittel';
    },

    // Task erledigt toggle
    async toggleTaskComplete(taskId) {
        const task = await TodoStorage.getTask(taskId);
        if (task.completed) {
            await TodoStorage.updateTask(taskId, { completed: false, completedAt: null });
        } else {
            await TodoStorage.completeTask(taskId);
        }
        await this.renderTasks();
    },

    // Task Modal öffnen
    async openTaskModal(taskId) {
        const task = await TodoStorage.getTask(taskId);
        if (!task) return;

        this.currentTaskId = taskId;

        document.getElementById('taskModalTitle').textContent = task.title;
        document.getElementById('taskModalPriority').innerHTML =
            `<span class="prio-badge ${task.priority}">${this.formatPriority(task.priority)}</span>`;

        const dueInfo = this.formatDueDate(task.dueDate, task.dueTime);
        document.getElementById('taskModalDue').textContent = dueInfo ? dueInfo.text : 'Kein Datum';

        // Erinnerung Toggle
        const reminderToggle = document.getElementById('taskReminderToggle');
        reminderToggle.checked = task.reminder || false;

        document.getElementById('taskModal').classList.remove('hidden');
    },

    // Task Modal schließen
    closeTaskModal() {
        document.getElementById('taskModal').classList.add('hidden');
        this.currentTaskId = null;
    },

    // Aktuellen Task erledigen
    async completeCurrentTask() {
        if (this.currentTaskId) {
            await TodoStorage.completeTask(this.currentTaskId);
            this.closeTaskModal();
            await this.renderTasks();
        }
    },

    // Aktuellen Task löschen
    async deleteCurrentTask() {
        if (this.currentTaskId && confirm('Aufgabe wirklich löschen?')) {
            await TodoStorage.deleteTask(this.currentTaskId);
            this.closeTaskModal();
            await this.renderTasks();
        }
    },

    // Erinnerung umschalten
    async toggleReminder(enabled) {
        if (this.currentTaskId) {
            await TodoStorage.updateTask(this.currentTaskId, { reminder: enabled });
            await this.renderTasks();
        }
    },

    // Einstellungen öffnen
    openSettings() {
        document.getElementById('apiKeyInput').value = SettingsStorage.getApiKey();
        document.getElementById('notificationsToggle').checked = SettingsStorage.getNotificationsEnabled();
        document.getElementById('settingsModal').classList.remove('hidden');
    },

    // Einstellungen schließen
    closeSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    },

    // Einstellungen speichern
    async saveSettings() {
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        const notificationsEnabled = document.getElementById('notificationsToggle').checked;

        SettingsStorage.setApiKey(apiKey);

        if (notificationsEnabled && NotificationManager.permission !== 'granted') {
            const granted = await NotificationManager.requestPermission();
            if (!granted) {
                this.showError('Benachrichtigungsberechtigung wurde nicht erteilt.');
                document.getElementById('notificationsToggle').checked = false;
                SettingsStorage.setNotificationsEnabled(false);
            } else {
                SettingsStorage.setNotificationsEnabled(true);
            }
        } else {
            SettingsStorage.setNotificationsEnabled(notificationsEnabled);
        }

        this.closeSettings();
        this.showSuccess('Einstellungen gespeichert');
    },

    // Einstellungen laden
    loadSettings() {
        // Prüfen ob API-Key existiert
        if (!SettingsStorage.getApiKey()) {
            // Hinweis anzeigen beim ersten Start
            setTimeout(() => {
                this.showError('Tipp: Konfiguriere deinen Anthropic API-Key in den Einstellungen für intelligentes Parsing.');
            }, 1000);
        }
    },

    // Erinnerungen prüfen
    async checkReminders() {
        const result = await NotificationManager.checkAndNotify();

        // In-App Banner als Fallback
        if (result.overdue.length > 0) {
            NotificationManager.showInAppReminder(result.overdue, 'overdue');
        } else if (result.dueSoon.length > 0) {
            NotificationManager.showInAppReminder(result.dueSoon, 'due');
        }
    },

    // Service Worker registrieren
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registriert:', registration.scope);
            } catch (error) {
                console.log('Service Worker Registrierung fehlgeschlagen:', error);
            }
        }
    },

    // Hilfsfunktionen
    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    showError(message) {
        // Einfacher Alert als Fallback - kann später durch Toast ersetzt werden
        console.error(message);
        alert(message);
    },

    showSuccess(message) {
        console.log(message);
        // Kann später durch Toast ersetzt werden
    }
};

// App starten wenn DOM geladen
document.addEventListener('DOMContentLoaded', () => App.init());
