# Vertalen Help Atlantis 7

Een Node.js script dat Nederlandse RST-bestanden vertaalt naar Engels met behulp van de Gemini API.

## Functionaliteit

- Vertaalt Nederlandse RST-bestanden naar Engels
- Behoudt RST-opmaak en structuur
- Verwerkt bestanden in batches
- Houdt voortgang bij
- Analyseert niet-vertaalde woorden
- Behoudt woorden tussen accolades {} en hoofdletters met underscore
- Vertaalt woorden tussen * en * of ** en **
- Automatische voortgangsopslag

## Vereisten

- Node.js (versie 14 of hoger)
- Gemini API key
- Toegang tot bron- en doelmap

## Installatie

1. Clone de repository
2. Installeer dependencies:
   ```bash
   npm install
   ```
3. Maak een `.env` bestand aan met de volgende variabelen:
   ```
   GEMINI_API_KEY=jouw_api_key
   BRON_MAP=/pad/naar/bronmap
   DOEL_MAP=/pad/naar/doelmap
   BATCH_SIZE=50
   INTERVAL_TIME=10000
   DEBUG_MODE=true
   ```

## Gebruik

### Normaal gebruik
```bash
node src/index.js
```

### Reset voortgang
```bash
node src/index.js --reset
```

### Automatisch uitvoeren
```bash
node src/index.js --auto
```

### Batch grootte aanpassen
```bash
BATCH_SIZE=25 node src/index.js
```

## Configuratie

De volgende environment variabelen kunnen worden aangepast:

- `GEMINI_API_KEY`: Je Gemini API key
- `BRON_MAP`: Pad naar de map met Nederlandse RST-bestanden
- `DOEL_MAP`: Pad naar de map waar vertaalde bestanden worden opgeslagen
- `BATCH_SIZE`: Aantal bestanden per batch (standaard: 50)
- `INTERVAL_TIME`: Tijd tussen batches in milliseconden (standaard: 10000)
- `DEBUG_MODE`: Debug modus aan/uit (standaard: true)

## Voortgang

Het script houdt de voortgang bij in:
- `.voortgang.json`: Bevat lijst van verwerkte bestanden
- `niet_vertaalde_woorden.txt`: Bevat woorden die niet zijn vertaald

## Opmerkingen

- Woorden tussen accolades {} worden niet vertaald
- Woorden die geheel uit hoofdletters en underscore bestaan worden niet vertaald
- Woorden tussen * en * of ** en ** worden wel vertaald
- De RST-opmaak en structuur worden behouden

## Output

De tool genereert:

1. Vertaalde RST bestanden in de doelmap
2. Een bestand `niet_vertaalde_woorden.txt` met niet-vertaalde woorden
3. Logbestanden met voortgang en eventuele fouten

## Speciale Gevallen

De tool behandelt de volgende speciale gevallen:

- Woorden tussen accolades `{...}` worden niet vertaald
- Woorden die geheel uit hoofdletters met underscores worden niet vertaald
- Bestaande bestanden worden overschreven
- Mappenstructuur wordt automatisch aangemaakt

## Foutafhandeling

- Fouten worden gelogd
- Batch verwerking kan worden hervat na fouten
- Missende bestanden worden automatisch verwerkt

## Vereisten

- Google Apps Script omgeving
- Gemini API sleutel
- Toegang tot Google Drive mappen

## Beperkingen

- API limieten van Gemini
- Batch grootte beperkingen
- Bestandsgrootte beperkingen

## Support

Voor vragen of problemen, neem contact op met de ontwikkelaar.

# clone

clasp clone "12QQ8bXClMOsCIg1uAgLBkGzPtDBJghU_u4O5w1eaQSP2qYm-Ak6EyFNz" --rootDir src

# Push

clasp -P src/ push

or 

npm run push

# Pull

npm run pull