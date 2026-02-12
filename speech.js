// Web Speech API Wrapper für Spracherkennung
const SpeechRecognizer = {
    recognition: null,
    isListening: false,
    onResult: null,
    onError: null,
    onStart: null,
    onEnd: null,

    // Prüfen ob Spracherkennung verfügbar ist
    isSupported() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    },

    // Initialisierung
    init() {
        if (!this.isSupported()) {
            console.error('Spracherkennung wird nicht unterstützt');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        // Konfiguration
        this.recognition.lang = 'de-DE';
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        // Event Handler
        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('Spracherkennung gestartet');
            if (this.onStart) this.onStart();
        };

        this.recognition.onend = () => {
            this.isListening = false;
            console.log('Spracherkennung beendet');
            if (this.onEnd) this.onEnd();
        };

        this.recognition.onresult = (event) => {
            const result = event.results[0][0];
            const transcript = result.transcript;
            const confidence = result.confidence;

            console.log('Erkannt:', transcript, 'Konfidenz:', confidence);

            if (this.onResult) {
                this.onResult(transcript, confidence);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Spracherkennungsfehler:', event.error);
            this.isListening = false;

            let errorMessage = 'Ein Fehler ist aufgetreten';
            switch (event.error) {
                case 'no-speech':
                    errorMessage = 'Keine Sprache erkannt. Bitte versuche es erneut.';
                    break;
                case 'audio-capture':
                    errorMessage = 'Kein Mikrofon gefunden.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Mikrofonzugriff wurde verweigert. Bitte erlaube den Zugriff in den Einstellungen.';
                    break;
                case 'network':
                    errorMessage = 'Netzwerkfehler bei der Spracherkennung.';
                    break;
                case 'aborted':
                    errorMessage = 'Spracherkennung abgebrochen.';
                    break;
            }

            if (this.onError) {
                this.onError(errorMessage, event.error);
            }
        };

        console.log('Spracherkennung initialisiert');
        return true;
    },

    // Spracherkennung starten
    start() {
        if (!this.recognition) {
            console.error('Spracherkennung nicht initialisiert');
            return false;
        }

        if (this.isListening) {
            console.log('Spracherkennung läuft bereits');
            return false;
        }

        try {
            this.recognition.start();
            return true;
        } catch (error) {
            console.error('Fehler beim Starten:', error);
            return false;
        }
    },

    // Spracherkennung stoppen
    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
    },

    // Abbrechen
    abort() {
        if (this.recognition) {
            this.recognition.abort();
        }
    }
};
