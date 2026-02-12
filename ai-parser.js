// Claude API Integration für intelligentes Task-Parsing
const AIParser = {
    apiUrl: 'https://api.anthropic.com/v1/messages',

    // Task aus natürlicher Sprache extrahieren
    async parseTask(text, apiKey) {
        if (!apiKey) {
            throw new Error('Kein API-Key konfiguriert. Bitte in den Einstellungen eingeben.');
        }

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        const systemPrompt = `Du bist ein Assistent der ToDo-Aufgaben aus natürlicher Sprache extrahiert.
Analysiere den Text und extrahiere:
1. Titel: Eine kurze, prägnante Beschreibung der Aufgabe
2. Priorität: "high", "medium" oder "low" (basierend auf Wörtern wie "wichtig", "dringend", "später", etc.)
3. Fälligkeitsdatum: Im Format YYYY-MM-DD (heute ist ${todayStr})
4. Uhrzeit: Im Format HH:MM (24-Stunden-Format)

Interpretiere relative Datumsangaben:
- "heute" = ${todayStr}
- "morgen" = Datum von morgen
- "übermorgen" = Datum von übermorgen
- "nächste Woche" = 7 Tage ab heute
- "am Montag/Dienstag/etc" = nächster entsprechender Wochentag
- Wenn kein Datum genannt wird, setze null

Interpretiere Uhrzeiten:
- "um 10 Uhr" = "10:00"
- "um halb 3" = "14:30"
- "um viertel nach 5" = "17:15"
- "nachmittags" = "15:00"
- "morgens" = "09:00"
- "abends" = "19:00"
- Wenn keine Uhrzeit genannt wird, setze null

Erinnerung:
- Wenn "erinnere mich", "Erinnerung", "nicht vergessen" o.ä. erwähnt wird: reminder = true
- Wenn ein Datum/Uhrzeit genannt wird, ist standardmäßig reminder = true
- Sonst reminder = false

Antworte NUR mit einem JSON-Objekt im folgenden Format:
{
  "title": "string",
  "priority": "high" | "medium" | "low",
  "dueDate": "YYYY-MM-DD" | null,
  "dueTime": "HH:MM" | null,
  "reminder": true | false
}`;

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 256,
                    messages: [
                        {
                            role: 'user',
                            content: `Extrahiere die Aufgabe aus folgendem Text:\n\n"${text}"`
                        }
                    ],
                    system: systemPrompt
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 401) {
                    throw new Error('Ungültiger API-Key. Bitte überprüfe deine Einstellungen.');
                }
                throw new Error(errorData.error?.message || `API Fehler: ${response.status}`);
            }

            const data = await response.json();
            const content = data.content[0]?.text;

            if (!content) {
                throw new Error('Keine Antwort von der API erhalten');
            }

            // JSON aus der Antwort extrahieren
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Konnte keine Aufgabe extrahieren');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Validierung
            if (!parsed.title || typeof parsed.title !== 'string') {
                throw new Error('Keine gültige Aufgabe erkannt');
            }

            // Priorität normalisieren
            const validPriorities = ['high', 'medium', 'low'];
            if (!validPriorities.includes(parsed.priority)) {
                parsed.priority = 'medium';
            }

            // Datum validieren
            if (parsed.dueDate) {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(parsed.dueDate)) {
                    parsed.dueDate = null;
                }
            }

            // Uhrzeit validieren
            if (parsed.dueTime) {
                const timeRegex = /^\d{2}:\d{2}$/;
                if (!timeRegex.test(parsed.dueTime)) {
                    parsed.dueTime = null;
                }
            }

            console.log('Geparste Aufgabe:', parsed);
            return parsed;

        } catch (error) {
            console.error('AI Parser Fehler:', error);
            throw error;
        }
    },

    // Fallback: Einfaches Parsing ohne KI
    parseTaskSimple(text) {
        const result = {
            title: text,
            priority: 'medium',
            dueDate: null,
            dueTime: null,
            reminder: false
        };

        // Einfache Prioritätserkennung
        const lowText = text.toLowerCase();
        if (lowText.includes('wichtig') || lowText.includes('dringend') || lowText.includes('sofort')) {
            result.priority = 'high';
        } else if (lowText.includes('später') || lowText.includes('irgendwann') || lowText.includes('unwichtig')) {
            result.priority = 'low';
        }

        // Einfache Datumserkennung
        const today = new Date();
        if (lowText.includes('heute')) {
            result.dueDate = today.toISOString().split('T')[0];
            result.reminder = true;
        } else if (lowText.includes('morgen')) {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            result.dueDate = tomorrow.toISOString().split('T')[0];
            result.reminder = true;
        } else if (lowText.includes('übermorgen')) {
            const dayAfter = new Date(today);
            dayAfter.setDate(dayAfter.getDate() + 2);
            result.dueDate = dayAfter.toISOString().split('T')[0];
            result.reminder = true;
        }

        // Einfache Uhrzeiterkennung
        const timeMatch = lowText.match(/um (\d{1,2})(:\d{2})?\s*(uhr)?/);
        if (timeMatch) {
            const hour = timeMatch[1].padStart(2, '0');
            const minutes = timeMatch[2] ? timeMatch[2].slice(1) : '00';
            result.dueTime = `${hour}:${minutes}`;
            result.reminder = true;
        }

        // Erinnerungs-Keywords
        if (lowText.includes('erinner') || lowText.includes('nicht vergessen')) {
            result.reminder = true;
        }

        return result;
    }
};
