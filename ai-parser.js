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

Interpretiere relative Datumsangaben:
- "heute" = ${todayStr}
- "morgen" = Datum von morgen
- "übermorgen" = Datum von übermorgen
- "nächste Woche" = 7 Tage ab heute
- "am Montag/Dienstag/etc" = nächster entsprechender Wochentag
- Wenn kein Datum genannt wird, setze null

Antworte NUR mit einem JSON-Objekt im folgenden Format:
{
  "title": "string",
  "priority": "high" | "medium" | "low",
  "dueDate": "YYYY-MM-DD" | null
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
            dueDate: null
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
        } else if (lowText.includes('morgen')) {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            result.dueDate = tomorrow.toISOString().split('T')[0];
        } else if (lowText.includes('übermorgen')) {
            const dayAfter = new Date(today);
            dayAfter.setDate(dayAfter.getDate() + 2);
            result.dueDate = dayAfter.toISOString().split('T')[0];
        }

        return result;
    }
};
