import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ES modules fix voor __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Script gestart");

// Laad environment variabelen
dotenv.config();
console.log("Environment variabelen geladen");
console.log("BATCH_SIZE environment variabele:", process.env.BATCH_SIZE);

// Configuratie
const config = {
    geminiApiKey: process.env.GEMINI_API_KEY,
    bronMap: process.env.BRON_MAP || '/Users/pdiermen/Development/atlantis-docs/docs/nl',
    doelMap: process.env.DOEL_MAP || '/Users/pdiermen/Development/atlantis-docs/docs/en',
    batchSize: parseInt(process.env.BATCH_SIZE) || 200,
    intervalTime: parseInt(process.env.INTERVAL_TIME) || 10000,
    debugMode: process.env.DEBUG_MODE === 'true',
    // Nieuwe taal configuratie
    bronTaal: process.env.BRON_TAAL || 'Dutch',
    doelTaal: process.env.DOEL_TAAL || 'English',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-pro'
};

// Definieer het pad voor het voortgangsbestand
const voortgangsBestand = path.join(config.doelMap, '.voortgang.json');

console.log("Config:", {
    ...config,
    geminiApiKey: '***' // Verberg API key in logs
});

// Configureer Gemini API
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

console.log("Gemini API geconfigureerd");

// Globale variabelen
let nietVertaaldeWoorden = new Set();
let verwerkteBestanden = new Map();
let totaalVerwerkteBestanden = 0;
let bestandenInHuidigeBatch = 0;
let batchIndex = 0;
let batchSize = 0;

// Functie voor logging
function log(bericht, type = "info") {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] `;
    
    if (type === "error") {
        console.error(prefix + bericht);
    } else {
        console.log(prefix + bericht);
    }
}

function analyseerNietVertaaldeWoorden(bronTekst, vertaaldeTekst) {
    // Splits beide teksten in woorden
    const bronWoorden = bronTekst.toLowerCase().match(/\b\w+\b/g) || [];
    const vertaaldeWoorden = vertaaldeTekst.toLowerCase().match(/\b\w+\b/g) || [];
    
    // Vind woorden die exact hetzelfde zijn in beide teksten
    const gevondenNietVertaaldeWoorden = bronWoorden.filter(woord => {
        // Controleer of het woord exact hetzelfde is in de vertaling
        const isNietVertaald = vertaaldeWoorden.includes(woord);
        
        // Controleer of het woord niet tussen accolades staat
        const isNietInAccolades = !bronTekst.includes(`{${woord}}`);
        
        // Controleer of het woord niet geheel uit hoofdletters en underscores bestaat
        const isNietHoofdletters = !/^[A-Z_]+$/.test(woord);
        
        return isNietVertaald && isNietInAccolades && isNietHoofdletters;
    });
    
    // Voeg de niet-vertaalde woorden toe aan de set
    gevondenNietVertaaldeWoorden.forEach(woord => nietVertaaldeWoorden.add(woord));
}

async function slaNietVertaaldeWoordenOp(doelMap) {
    log("=== OPSLAAN VAN NIET-VERTAALDE WOORDEN ===");
    
    try {
        const bestandsnaam = "niet_vertaalde_woorden.txt";
        const bestandspad = path.join(doelMap, bestandsnaam);
        
        // Lees bestaande woorden als het bestand bestaat
        let bestaandeWoorden = new Set();
        try {
            const bestaandeTekst = await fs.promises.readFile(bestandspad, 'utf8');
            if (bestaandeTekst !== "Geen niet-vertaalde woorden") {
                bestaandeTekst.split("\n").forEach(woord => {
                    if (woord.trim()) bestaandeWoorden.add(woord.trim());
                });
            }
        } catch (error) {
            // Bestand bestaat niet, dat is oké
        }
        
        // Voeg nieuwe woorden toe
        nietVertaaldeWoorden.forEach(woord => bestaandeWoorden.add(woord));
        
        // Schrijf het bestand
        const rapportTekst = bestaandeWoorden.size > 0 
            ? Array.from(bestaandeWoorden).sort().join("\n")
            : "Geen niet-vertaalde woorden";
        
        await fs.promises.writeFile(bestandspad, rapportTekst, 'utf8');
        
        log("Bestand succesvol aangemaakt:", bestandsnaam);
        log("Totaal aantal unieke woorden:", bestaandeWoorden.size);
        
        // Reset de Set
        nietVertaaldeWoorden.clear();
        log("Set met niet-vertaalde woorden gereset");
        
    } catch (error) {
        log('Fout bij het opslaan van niet-vertaalde woorden:', "error");
        log(error.message, "error");
    }
}

async function vertaalTekst(tekst, bestandPad) {
    // Haal witruimte aan begin en eind op
    const leadingWhitespace = tekst.match(/^\s*/)[0];
    const trailingWhitespace = tekst.match(/\s*$/)[0];
    const content = tekst.trim();

    // Als er geen content is, return de originele tekst
    if (!content) {
        return {
            vertaaldeTekst: tekst,
            succes: true
        };
    }

    // Configureer het model met hogere temperature voor meer variatie
    const model = genAI.getGenerativeModel({ 
        model: config.geminiModel,
        temperature: 0.3
    });

    // Maak een directe vertaalprompt
    const prompt = `Vertaal de volgende tekst van ${config.bronTaal} naar ${config.doelTaal}.
Regels:
1. Behoud alle markdown/RST opmaak exact zoals in de brontekst
2. Behoud alle variabelen tussen accolades {} exact zoals in de brontekst
3. Behoud alle speciale tekens en opmaak
4. Vertaal alleen de Nederlandse tekst
5. Geef alleen de vertaalde tekst terug, zonder extra uitleg of commentaar

Te vertalen tekst:
${content}`;

    // Log de bestandsinformatie
    console.log(`\n=== VERTAALPROCES VOOR ${bestandPad} ===`);
    console.log('Originele tekst:');
    console.log(content);
    console.log('\nPrompt naar Gemini:');
    console.log(prompt);

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const vertaaldeTekst = response.text();

        console.log('\nAntwoord van Gemini:');
        console.log(vertaaldeTekst);

        // Controleer of de vertaling geldig is
        if (!vertaaldeTekst || vertaaldeTekst.trim() === '') {
            console.log('\nWaarschuwing: Lege vertaling ontvangen van Gemini');
            return {
                vertaaldeTekst: tekst,
                succes: false
            };
        }

        // Voeg de originele witruimte weer toe
        const finalText = leadingWhitespace + vertaaldeTekst + trailingWhitespace;

        console.log('\nFinale vertaalde tekst:');
        console.log(finalText);
        console.log('=== EINDE VERTAALPROCES ===\n');

        return {
            vertaaldeTekst: finalText,
            succes: true
        };
    } catch (error) {
        console.error('\nFout bij vertalen:');
        console.error(error);
        console.log('=== EINDE VERTAALPROCES MET FOUT ===\n');
        return {
            vertaaldeTekst: tekst,
            succes: false
        };
    }
}

// Helper functie om het verschilpercentage tussen twee arrays van woorden te berekenen
function berekenVerschilPercentage(origineleWoorden, vertaaldeWoorden) {
    if (!origineleWoorden.length || !vertaaldeWoorden.length) return 0;
    
    const uniekeOrigineleWoorden = new Set(origineleWoorden);
    const uniekeVertaaldeWoorden = new Set(vertaaldeWoorden);
    
    const verschillend = [...uniekeOrigineleWoorden].filter(woord => !uniekeVertaaldeWoorden.has(woord));
    const totaalUniekeWoorden = new Set([...origineleWoorden, ...vertaaldeWoorden]).size;
    
    return (verschillend.length / totaalUniekeWoorden) * 100;
}

async function verwerkBestand(bronBestand) {
    try {
        // Controleer of het bestand al eerder is verwerkt
        const doelPad = bronBestand.replace(config.bronMap, config.doelMap);
        const bronStats = fs.statSync(bronBestand);
        const bronWijzigingsDatum = bronStats.mtime.getTime();

        // Controleer of het doelbestand bestaat
        const doelBestandBestaat = fs.existsSync(doelPad);

        // Als het bestand al eerder is verwerkt, controleer de wijzigingsdatum
        if (verwerkteBestanden.has(bronBestand)) {
            const laatsteVerwerkingDatum = verwerkteBestanden.get(bronBestand);
            if (bronWijzigingsDatum <= laatsteVerwerkingDatum && doelBestandBestaat) {
                log(`Bestand ${bronBestand} is niet gewijzigd sinds laatste verwerking, wordt overgeslagen`);
                return true;
            }
        }

        // Lees het bronbestand
        const inhoud = fs.readFileSync(bronBestand, 'utf8');
        log(`Bestand gelezen: ${bronBestand} (${inhoud.length} karakters)`);

        // Start vertaling
        log(`Start vertaling van: ${bronBestand}`);
        const vertaalResultaat = await vertaalTekst(inhoud, bronBestand);

        // Log de vertaling voor debugging
        log(`Vertaalresultaat: ${JSON.stringify(vertaalResultaat, null, 2)}`);

        // Controleer eerst of de vertaling succesvol was
        if (!vertaalResultaat.succes) {
            log(`Vertaling mislukt voor ${bronBestand}: ${vertaalResultaat.fout}`, "error");
            return false;
        }

        // Controleer of de vertaalde tekst gelijk is aan de originele tekst
        if (vertaalResultaat.vertaaldeTekst === inhoud) {
            log(`Vertaling is identiek aan origineel voor ${bronBestand}, wordt overgeslagen`, "warning");
            return false;
        }

        const doelDir = path.dirname(doelPad);

        // Maak de doelmap aan als deze niet bestaat
        if (!fs.existsSync(doelDir)) {
            fs.mkdirSync(doelDir, { recursive: true });
        }

        // Schrijf het vertaalde bestand
        fs.writeFileSync(doelPad, vertaalResultaat.vertaaldeTekst, 'utf8');
        log(`Bestand vertaald en opgeslagen: ${doelPad}`);

        // Analyseer niet-vertaalde woorden
        analyseerNietVertaaldeWoorden(inhoud, vertaalResultaat.vertaaldeTekst);

        // Update de verwerkte bestanden met de huidige wijzigingsdatum
        verwerkteBestanden.set(bronBestand, bronWijzigingsDatum);
        totaalVerwerkteBestanden++;
        bestandenInHuidigeBatch++;
        batchSize++;

        return true;
    } catch (error) {
        log(`Fout bij verwerken van ${bronBestand}: ${error.message}`, "error");
        return false;
    }
}

async function slaVoortgangOp() {
    try {
        // Converteer de Map naar een array van [key, value] paren voor JSON opslag
        const verwerkteBestandenArray = Array.from(verwerkteBestanden.entries());
        
        const data = {
            verwerkteBestanden: verwerkteBestandenArray,
            totaalVerwerkteBestanden,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(voortgangsBestand, JSON.stringify(data, null, 2));
        log(`Voortgang opgeslagen in: ${voortgangsBestand}`);
        log(`Opgeslagen voortgang:\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
        log(`Fout bij opslaan voortgang: ${error.message}`, "error");
    }
}

async function laadVoortgang() {
    try {
        if (fs.existsSync(voortgangsBestand)) {
            const data = JSON.parse(fs.readFileSync(voortgangsBestand, 'utf8'));
            // Converteer de array van [key, value] paren terug naar een Map
            verwerkteBestanden = new Map(data.verwerkteBestanden);
            totaalVerwerkteBestanden = data.totaalVerwerkteBestanden;
            log(`Voortgang geladen: ${verwerkteBestanden.size} bestanden eerder verwerkt`);
            return true;
        }
    } catch (error) {
        log(`Fout bij laden voortgang: ${error.message}`, "error");
    }
    return false;
}

async function resetVoortgang(doelMap) {
    try {
        if (fs.existsSync(voortgangsBestand)) {
            fs.unlinkSync(voortgangsBestand);
            log(`Voortgangsbestand verwijderd: ${voortgangsBestand}`);
        }
        verwerkteBestanden.clear();
        totaalVerwerkteBestanden = 0;
        log('Voortgang gereset');
    } catch (error) {
        log(`Fout bij resetten voortgang: ${error.message}`, "error");
    }
}

// Functie om te controleren of de batch limiet is bereikt
function isBatchLimietBereikt() {
    if (bestandenInHuidigeBatch >= config.batchSize) {
        log(`Batch limiet bereikt (${bestandenInHuidigeBatch}/${config.batchSize} bestanden)`);
        return true;
    }
    return false;
}

async function scanMap(currentBronMap, currentDoelMap) {
    try {
        // Maak de doelmap aan als deze niet bestaat
        if (!fs.existsSync(currentDoelMap)) {
            fs.mkdirSync(currentDoelMap, { recursive: true });
            log(`Doelmap aangemaakt: ${currentDoelMap}`);
        }

        // Lees alle items in de bronmap
        const items = await fs.promises.readdir(currentBronMap, { withFileTypes: true });
        
        // Verwerk bestanden
        for (const item of items) {
            const bronPad = path.join(currentBronMap, item.name);
            const doelPad = path.join(currentDoelMap, item.name);
            
            if (item.isDirectory()) {
                // Recursief verwerken van submappen
                await scanMap(bronPad, doelPad);
            } else if (item.name.endsWith('.rst')) {
                // .rst bestanden vertalen
                if (!verwerkteBestanden.has(bronPad)) {
                    const resultaat = await verwerkBestand(bronPad);
                    if (resultaat) {
                        log(`Bestand succesvol verwerkt: ${bronPad}`);
                    }
                }
            } else {
                // Andere bestanden alleen kopiëren als ze nog niet bestaan of verouderd zijn
                let moetKopieren = false;
                
                try {
                    // Controleer of het doelbestand bestaat
                    const doelBestaat = await fs.promises.access(doelPad)
                        .then(() => true)
                        .catch(() => false);
                    
                    if (!doelBestaat) {
                        // Bestand bestaat niet in doelmap, moet gekopieerd worden
                        moetKopieren = true;
                    } else {
                        // Vergelijk wijzigingsdatums
                        const bronStats = await fs.promises.stat(bronPad);
                        const doelStats = await fs.promises.stat(doelPad);
                        
                        if (bronStats.mtime.getTime() > doelStats.mtime.getTime()) {
                            // Bronbestand is nieuwer, moet gekopieerd worden
                            moetKopieren = true;
                        }
                    }
                } catch (error) {
                    // Er is een fout opgetreden, probeer te kopiëren
                    moetKopieren = true;
                    log(`Fout bij controleren van ${item.name}: ${error.message}`, "warning");
                }
                
                if (moetKopieren) {
                    // Maak de doelmap aan als deze niet bestaat
                    const doelDir = path.dirname(doelPad);
                    if (!fs.existsSync(doelDir)) {
                        fs.mkdirSync(doelDir, { recursive: true });
                    }
                    
                    // Kopieer het bestand
                    fs.copyFileSync(bronPad, doelPad);
                    log(`Bestand gekopieerd: ${item.name}`);
                } else {
                    log(`Bestand ${item.name} is up-to-date, wordt overgeslagen`);
                }
            }
        }
    } catch (error) {
        log(`Fout bij het scannen van map ${currentBronMap}: ${error.message}`, "error");
    }
}

async function verwerkBestandenInMap(bronMap, doelMap, voortgang) {
    try {
        log(`\n=== VERWERKEN VAN MAP: ${bronMap} ===`);
        
        // Controleer of de doelmap bestaat
        const doelMapBestaat = await fs.promises.access(doelMap)
            .then(() => true)
            .catch(() => false);
            
        if (!doelMapBestaat) {
            log(`Doelmap bestaat niet: ${doelMap}`);
            await fs.promises.mkdir(doelMap, { recursive: true });
            log(`Doelmap aangemaakt: ${doelMap}`);
        } else {
            log(`Doelmap bestaat al: ${doelMap}`);
        }

        // Lees alle items in de bronmap
        const items = await fs.promises.readdir(bronMap, { withFileTypes: true });
        const bestanden = items.filter(item => item.isFile());
        const mappen = items.filter(item => item.isDirectory());
        
        log(`Gevonden bestanden in map: ${items.length}`);
        
        // Verwerk eerst de .rst bestanden
        const rstBestanden = bestanden.filter(bestand => bestand.name.endsWith('.rst'));
        log(`Gevonden .rst bestanden: ${rstBestanden.length}`);
        
        // Verwerk ook de niet-.rst bestanden (direct kopiëren)
        const andereBestanden = bestanden.filter(bestand => !bestand.name.endsWith('.rst'));
        log(`Gevonden andere bestanden: ${andereBestanden.length}`);
        
        // Kopieer eerst de niet-.rst bestanden als ze nog niet bestaan of verouderd zijn
        for (const bestand of andereBestanden) {
            const bronPad = path.join(bronMap, bestand.name);
            const doelPad = path.join(doelMap, bestand.name);
            
            // Controleer of het bestand al bestaat en of het verouderd is
            let moetKopieren = false;
            
            try {
                // Controleer of het doelbestand bestaat
                const doelBestaat = await fs.promises.access(doelPad)
                    .then(() => true)
                    .catch(() => false);
                
                if (!doelBestaat) {
                    // Bestand bestaat niet in doelmap, moet gekopieerd worden
                    moetKopieren = true;
                } else {
                    // Vergelijk wijzigingsdatums
                    const bronStats = await fs.promises.stat(bronPad);
                    const doelStats = await fs.promises.stat(doelPad);
                    
                    if (bronStats.mtime.getTime() > doelStats.mtime.getTime()) {
                        // Bronbestand is nieuwer, moet gekopieerd worden
                        moetKopieren = true;
                    }
                }
            } catch (error) {
                // Er is een fout opgetreden, probeer te kopiëren
                moetKopieren = true;
                log(`Fout bij controleren van ${bestand.name}: ${error.message}`, "warning");
            }
            
            if (moetKopieren) {
                // Maak de doelmap aan als deze niet bestaat
                const doelDir = path.dirname(doelPad);
                if (!fs.existsSync(doelDir)) {
                    fs.mkdirSync(doelDir, { recursive: true });
                }
                
                // Kopieer het bestand
                fs.copyFileSync(bronPad, doelPad);
                log(`Bestand gekopieerd: ${bestand.name}`);
            } else {
                log(`Bestand ${bestand.name} is up-to-date, wordt overgeslagen`);
            }
        }
        
        // Verwerk de .rst bestanden
        for (const bestand of rstBestanden) {
            const bestandsPad = path.join(bronMap, bestand.name);
            const relatiefPad = path.relative(config.bronMap, bestandsPad);
            
            // Controleer of het bestand al is verwerkt en of de wijzigingsdatum is gewijzigd
            if (verwerkteBestanden.has(bestandsPad)) {
                const bronStats = await fs.promises.stat(bestandsPad);
                const bronWijzigingsDatum = bronStats.mtime.getTime();
                const laatsteVerwerkingDatum = verwerkteBestanden.get(bestandsPad);
                
                if (bronWijzigingsDatum <= laatsteVerwerkingDatum) {
                    log(`Bestand ${bestand.name} is niet gewijzigd sinds laatste verwerking, wordt overgeslagen`);
                    continue;
                }
            }
            
            // Controleer batch limiet
            if (bestandenInHuidigeBatch >= config.batchSize) {
                log(`Batch limiet bereikt (${bestandenInHuidigeBatch}/${config.batchSize} bestanden)`);
                log(`Voortgang wordt opgeslagen en programma wordt beëindigd`);
                await slaVoortgangOp();
                process.exit(0);
            }
            
            log(`Verwerken van bestand: ${bestandsPad}`);
            await verwerkBestand(bestandsPad);
        }
        
        // Verwerk daarna de submappen
        for (const map of mappen) {
            const subBronMap = path.join(bronMap, map.name);
            const subDoelMap = path.join(doelMap, map.name);
            
            // Controleer batch limiet
            if (bestandenInHuidigeBatch >= config.batchSize) {
                log(`Batch limiet bereikt (${bestandenInHuidigeBatch}/${config.batchSize} bestanden)`);
                log(`Voortgang wordt opgeslagen en programma wordt beëindigd`);
                await slaVoortgangOp();
                process.exit(0);
            }
            
            await scanMap(subBronMap, subDoelMap);
        }
        
        log(`Klaar met verwerken van map: ${bronMap}`);
    } catch (error) {
        log(`Fout bij verwerken van map ${bronMap}: ${error.message}`);
        throw error;
    }
}

async function verwerkMappen(bronMap, doelMap) {
    try {
        // Controleer of de doelmap bestaat
        try {
            await fs.promises.access(doelMap);
            log(`Doelmap bestaat al: ${doelMap}`);
        } catch {
            await fs.promises.mkdir(doelMap, { recursive: true });
            log(`Doelmap aangemaakt: ${doelMap}`);
        }
        
        // Haal alle items op uit de bronmap
        const items = await fs.promises.readdir(bronMap, { withFileTypes: true });
        
        // Scheid bestanden en mappen
        const bestanden = items.filter(item => !item.isDirectory());
        const submappen = items.filter(item => item.isDirectory());
        
        log(`\n=== VERWERKEN VAN MAP: ${bronMap} ===`);
        log(`Aantal submappen gevonden: ${submappen.length}`);
        
        // Verwerk eerst de bestanden in de huidige map
        await verwerkBestandenInMap(bronMap, doelMap, { verwerkteBestanden: [], batchTeller: 0 });
        
        // Als we de batch_size hebben bereikt, stop dan
        if (bestandenInHuidigeBatch >= config.batchSize) {
            return;
        }
        
        // Verwerk daarna de submappen recursief
        for (const submap of submappen) {
            // Als we de batch_size hebben bereikt, stop dan
            if (bestandenInHuidigeBatch >= config.batchSize) {
                return;
            }
            
            const bronSubmap = path.join(bronMap, submap.name);
            const doelSubmap = path.join(doelMap, submap.name);
            
            // Controleer of de doelmap bestaat
            try {
                await fs.promises.access(doelSubmap);
                log(`Doelmap bestaat al: ${doelSubmap}`);
            } catch {
                await fs.promises.mkdir(doelSubmap, { recursive: true });
                log(`Doelmap aangemaakt: ${doelSubmap}`);
            }
            
            await verwerkMappen(bronSubmap, doelSubmap);
        }
    } catch (error) {
        log(`Fout bij verwerken van map ${bronMap}:`, "error");
        log(error.message, "error");
    }
}

async function controleerEnVerwerkMissendeBestanden(bronMap, doelMap) {
    try {
        log("=== CONTROLEREN VAN MISSENDE BESTANDEN ===");
        
        // Lees alle bestanden uit beide mappen
        const bronBestanden = await getAllFiles(bronMap);
        const doelBestanden = await getAllFiles(doelMap);
        
        log(`Gevonden bestanden in bronmap: ${bronBestanden.length}`);
        log(`Gevonden bestanden in doelmap: ${doelBestanden.length}`);
        
        // Vind missende bestanden
        const missendeBestanden = bronBestanden.filter(bronBestand => {
            const relatievePad = path.relative(bronMap, bronBestand);
            const doelBestand = path.join(doelMap, relatievePad);
            return !doelBestanden.includes(doelBestand);
        });
        
        if (missendeBestanden.length > 0) {
            log(`Gevonden ${missendeBestanden.length} missende bestanden:`, "warning");
            missendeBestanden.forEach(bestand => log(`- ${bestand}`, "warning"));
            
            // Verwerk missende bestanden
            for (const bronBestand of missendeBestanden) {
                const relatievePad = path.relative(bronMap, bronBestand);
                const doelBestand = path.join(doelMap, relatievePad);
                
                // Zorg dat de doelmap bestaat
                await fs.promises.mkdir(path.dirname(doelBestand), { recursive: true });
                
                log(`Verwerken van missend bestand: ${bronBestand}`);
                await verwerkBestand(bronBestand);
            }
            
            log("Alle missende bestanden zijn verwerkt", "success");
        } else {
            log("Geen missende bestanden gevonden", "success");
        }
    } catch (error) {
        log("Fout bij controleren van missende bestanden:", "error");
        log(error.message, "error");
        throw error;
    }
}

// Functie om alle bestanden in een map te vinden
async function getAllFiles(dir) {
    const files = [];
    
    function scanDir(currentDir) {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                scanDir(fullPath);
            } else {
                files.push(fullPath);  // Voeg alle bestanden toe, niet alleen .rst bestanden
            }
        }
    }
    
    scanDir(dir);
    return files;
}

// Functie om map toegang te testen
async function testMapToegang(mapPad) {
    try {
        await fs.promises.access(mapPad);
        log(`Map toegankelijk: ${mapPad}`);
        return true;
    } catch (error) {
        log(`Map niet toegankelijk: ${mapPad}`, "error");
        return false;
    }
}

// Functie om bestanden te analyseren en een lijst te maken van te verwerken bestanden
async function analyseerBestanden(bronMap, doelMap) {
    const teVerwerkenBestanden = [];
    
    async function scanMap(currentBronMap, currentDoelMap) {
        const items = await fs.promises.readdir(currentBronMap, { withFileTypes: true });
        
        for (const item of items) {
            const bronPad = path.join(currentBronMap, item.name);
            const doelPad = path.join(currentDoelMap, item.name);
            
            if (item.isDirectory()) {
                // Maak doelmap aan als deze niet bestaat
                if (!fs.existsSync(doelPad)) {
                    await fs.promises.mkdir(doelPad, { recursive: true });
                }
                await scanMap(bronPad, doelPad);
            } else {
                try {
                    const bronStats = await fs.promises.stat(bronPad);
                    const bronWijzigingsDatum = bronStats.mtime.getTime();
                    
                    // Controleer of het doelbestand bestaat
                    let doelBestandBestaat = false;
                    let doelWijzigingsDatum = 0;
                    try {
                        const doelStats = await fs.promises.stat(doelPad);
                        doelBestandBestaat = true;
                        doelWijzigingsDatum = doelStats.mtime.getTime();
                    } catch (error) {
                        // Doelbestand bestaat niet
                    }
                    
                    // Controleer of het bestand verwerkt moet worden
                    let moetVerwerken = false;
                    
                    if (!doelBestandBestaat) {
                        // Doelbestand bestaat niet, moet verwerkt worden
                        moetVerwerken = true;
                    } else if (verwerkteBestanden.has(bronPad)) {
                        // Bestand is eerder verwerkt, controleer wijzigingsdatum
                        const laatsteVerwerkingDatum = verwerkteBestanden.get(bronPad);
                        moetVerwerken = bronWijzigingsDatum > laatsteVerwerkingDatum;
                    } else {
                        // Bestand is nog niet verwerkt, controleer of het doelbestand ouder is
                        moetVerwerken = bronWijzigingsDatum > doelWijzigingsDatum;
                    }
                    
                    if (moetVerwerken) {
                        teVerwerkenBestanden.push(bronPad);
                    }
                } catch (error) {
                    log(`Fout bij analyseren van ${bronPad}: ${error.message}`, "error");
                }
            }
        }
    }
    
    await scanMap(bronMap, doelMap);
    return teVerwerkenBestanden;
}

// Test functie voor Gemini API
async function testGeminiAPI() {
    try {
        log("=== TEST GEMINI API ===");
        const model = genAI.getGenerativeModel({ 
            model: config.geminiModel,
            generationConfig: {
                temperature: 0.1,
                topK: 1,
                topP: 1,
                maxOutputTokens: 2048,
            },
        });

        const testPrompt = `Translate this ${config.bronTaal} text to ${config.doelTaal}: 'Dit is een test.'`;
        log("Versturen test prompt naar Gemini API...");
        const result = await model.generateContent(testPrompt);
        const response = await result.response;
        const vertaaldeTekst = response.text().trim();
        log(`Test resultaat: ${vertaaldeTekst}`);
        return true;
    } catch (error) {
        log('Fout bij testen van Gemini API:', "error");
        log(error.message, "error");
        return false;
    }
}

// Hoofdfunctie
async function main() {
    try {
        log("\n=== START PROGRAMMA ===");
        log(`Start tijd: ${new Date().toISOString()}`);
        log(`Bronmap: ${config.bronMap}`);
        log(`Doelmap: ${config.doelMap}`);
        
        // Test Gemini API
        const apiWerkt = await testGeminiAPI();
        if (!apiWerkt) {
            throw new Error("Gemini API test mislukt");
        }
        
        // Test map toegang
        log("Testen van map toegang...");
        const bronMapToegankelijk = await testMapToegang(config.bronMap);
        const doelMapToegankelijk = await testMapToegang(config.doelMap);
        
        if (!bronMapToegankelijk || !doelMapToegankelijk) {
            throw new Error("Map toegang test mislukt");
        }
        
        // Reset voortgang als --reset flag is gebruikt
        if (process.argv.includes('--reset')) {
            log('Voortgang resetten...');
            await resetVoortgang(config.doelMap);
            log('Voortgang gereset');
        }

        // Laad voortgang
        await laadVoortgang();
        log('Voortgang geladen');

        // Analyseer bestanden en maak lijst van te verwerken bestanden
        log('\n=== ANALYSE VAN BESTANDEN ===');
        const teVerwerkenBestanden = await analyseerBestanden(config.bronMap, config.doelMap);
        log(`\nGevonden ${teVerwerkenBestanden.length} bestanden om te verwerken`);

        if (teVerwerkenBestanden.length === 0) {
            log('🎉 Alle bestanden zijn up-to-date!');
            return;
        }

        // Verwerk bestanden in batches
        log('\n=== START VERWERKEN VAN BESTANDEN ===');
        let verwerkteBestandenInBatch = 0;
        
        for (const bestandsPad of teVerwerkenBestanden) {
            // Controleer batch limiet
            if (bestandenInHuidigeBatch >= config.batchSize) {
                log(`\n📊 Batch statistieken:`);
                log(`- Verwerkte bestanden in deze batch: ${verwerkteBestandenInBatch}`);
                log(`- Totaal verwerkte bestanden: ${totaalVerwerkteBestanden}`);
                log(`- Batch limiet bereikt (${bestandenInHuidigeBatch}/${config.batchSize} bestanden)`);
                log(`Voortgang wordt opgeslagen en programma wordt beëindigd`);
                await slaVoortgangOp();
                process.exit(0);
            }

            log(`\n📄 Verwerken van bestand ${verwerkteBestandenInBatch + 1}/${teVerwerkenBestanden.length}: ${path.relative(config.bronMap, bestandsPad)}`);
            const succes = await verwerkBestand(bestandsPad);

            if (succes) {
                verwerkteBestandenInBatch++;
                log(`Voortgang: ${verwerkteBestandenInBatch}/${teVerwerkenBestanden.length} bestanden verwerkt`);
                await slaVoortgangOp();
            }

            // Wacht tussen bestanden om rate limiting te voorkomen
            await new Promise(resolve => setTimeout(resolve, config.intervalTime));
        }

        // Sla de finale voortgang op
        await slaVoortgangOp();
        log('\n=== SAMENVATTING ===');
        log(`🎉 Alle bestanden zijn verwerkt!`);
        log(`- Totaal verwerkte bestanden in deze sessie: ${verwerkteBestandenInBatch}`);
        log(`- Totaal verwerkte bestanden ooit: ${totaalVerwerkteBestanden}`);

        // Verhoog de batch index en reset de batch grootte
        batchIndex++;
        batchSize = 0;
        log(`Volgende batch gestart (${batchIndex})`);
    } catch (error) {
        log(`❌ Fout in hoofdprogramma: ${error.message}`, "error");
        process.exit(1);
    }
}

// Start het programma
main(); 