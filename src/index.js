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
    bronMap: process.env.BRON_MAP,
    doelMap: process.env.DOEL_MAP,
    batchSize: Number(process.env.BATCH_SIZE || '5'),
    intervalTime: Number(process.env.INTERVAL_TIME || '10000'),
    debugMode: process.env.DEBUG_MODE === 'true'
};

console.log("Config:", {
    ...config,
    geminiApiKey: '***' // Verberg API key in logs
});

// Configureer Gemini API
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

console.log("Gemini API geconfigureerd");

// Globale variabelen
let nietVertaaldeWoorden = new Set();
let verwerkteBestanden = new Set();
let totaalVerwerkteBestanden = 0;
let bestandenInHuidigeBatch = 0;  // Nieuwe globale teller voor de huidige batch

// Logging functie
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
        info: '\x1b[36m', // Cyan
        success: '\x1b[32m', // Groen
        warning: '\x1b[33m', // Geel
        error: '\x1b[31m', // Rood
        reset: '\x1b[0m' // Reset
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
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

async function vertaalTekst(tekst) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `Vertaal de volgende Nederlandse tekst naar Engels. 
Vertaal geen woorden die tussen accolades {} staan en vertaal geen woorden die geheel uit hoofdletters bestaan en underscore hebben. Behoud de exacte RST-indeling en opmaak van de tekst, inclusief witregels, inspringing en speciale tekens. Normale woorden die tussen * en * of ** en ** staan worden wel vertaald en de vertaling wordt weer tussen * en * of ** en ** gezet.

${tekst}`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const vertaaldeTekst = response.text();
        
        // Wacht een moment tussen vertalingen om rate limiting te voorkomen
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { vertaaldeTekst };
    } catch (error) {
        log('Fout bij vertalen:', "error");
        log(error.message, "error");
        return { vertaaldeTekst: null, fout: error.toString() };
    }
}

async function verwerkBestand(bronBestand, doelBestand) {
    try {
        log(`Verwerken van bestand: ${bronBestand}`);
        
        // Lees het bestand
        const tekst = await fs.promises.readFile(bronBestand, 'utf8');
        log(`Bestand gelezen: ${bronBestand} (${tekst.length} karakters)`);

        // Vertaal de tekst
        log(`Start vertaling van: ${bronBestand}`);
        const vertaalResultaat = await vertaalTekst(tekst);
        
        if (vertaalResultaat.vertaaldeTekst) {
            log(`Vertaling succesvol voor: ${bronBestand}`);
            
            // Analyseer niet-vertaalde woorden
            analyseerNietVertaaldeWoorden(tekst, vertaalResultaat.vertaaldeTekst);
            
            // Schrijf het vertaalde bestand direct op zonder verdere verwerking
            await fs.promises.writeFile(doelBestand, vertaalResultaat.vertaaldeTekst, 'utf8');
            log(`Vertaald bestand opgeslagen: ${doelBestand}`);
        } else {
            log(`Fout bij vertalen van ${bronBestand}: ${vertaalResultaat.fout}`, "error");
        }
    } catch (error) {
        log('Fout bij het verwerken van bestand:', "error");
        log(error.message, "error");
        log(error.stack, "error");
        throw error;
    }
}

// Functie om verwerkte bestanden op te slaan
async function slaVoortgangOp(doelMap) {
    try {
        // Gebruik altijd het hoofdbestand voor voortgang
        const voortgangPad = path.join(config.doelMap, '.voortgang.json');
        const data = {
            verwerkteBestanden: Array.from(verwerkteBestanden),
            timestamp: new Date().toISOString(),
            totaalVerwerkteBestanden: totaalVerwerkteBestanden
        };
        
        await fs.promises.writeFile(voortgangPad, JSON.stringify(data, null, 2));
        log(`Voortgang opgeslagen in: ${voortgangPad}`);
        log('\nOpgeslagen voortgang:');
        log(JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        log(`Fout bij opslaan voortgang: ${error.message}`);
        return false;
    }
}

// Functie om voortgang te laden
async function laadVoortgang(doelMap) {
    try {
        // Gebruik altijd het hoofdbestand voor voortgang
        const voortgangPad = path.join(config.doelMap, '.voortgang.json');
        log(`Probeer voortgang te laden van: ${voortgangPad}`);
        
        try {
            await fs.promises.access(voortgangPad);
            const data = JSON.parse(await fs.promises.readFile(voortgangPad, 'utf8'));
            verwerkteBestanden = new Set(data.verwerkteBestanden || []);
            totaalVerwerkteBestanden = data.totaalVerwerkteBestanden || 0;
            log(`Voortgang geladen: ${verwerkteBestanden.size} bestanden al verwerkt`);
            log('\nVerwerkte bestanden:');
            verwerkteBestanden.forEach(bestand => log(`- ${bestand}`));
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                log('Geen voortgang gevonden, start vanaf begin');
                verwerkteBestanden = new Set();
                totaalVerwerkteBestanden = 0;
                return false;
            }
            throw error;
        }
    } catch (error) {
        log(`Fout bij laden voortgang: ${error.message}`);
        verwerkteBestanden = new Set();
        totaalVerwerkteBestanden = 0;
        return false;
    }
}

// Functie om voortgang te resetten
async function resetVoortgang(doelMap) {
    try {
        const voortgangsBestand = path.join(doelMap, '.voortgang.json');
        const nietVertaaldeBestand = path.join(doelMap, 'niet_vertaalde_woorden.txt');
        
        // Verwijder voortgangsbestand als het bestaat
        try {
            await fs.promises.unlink(voortgangsBestand);
            log('Voortgangsbestand verwijderd');
        } catch (error) {
            // Bestand bestaat niet, dat is oké
        }
        
        // Verwijder niet-vertaalde woorden bestand als het bestaat
        try {
            await fs.promises.unlink(nietVertaaldeBestand);
            log('Niet-vertaalde woorden bestand verwijderd');
        } catch (error) {
            // Bestand bestaat niet, dat is oké
        }
        
        // Reset de Sets
        verwerkteBestanden.clear();
        nietVertaaldeWoorden.clear();
        
        log('Voortgang succesvol gereset');
        return true;
    } catch (error) {
        log('Fout bij resetten van voortgang:', "error");
        log(error.message, "error");
        return false;
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

async function verwerkBestandenInMap(bronMap, doelMap) {
    try {
        log(`Verwerken van map: ${bronMap}`);
        
        // Lees alle bestanden in de map
        const bestanden = await fs.promises.readdir(bronMap);
        const subMappen = bestanden.filter(bestand => {
            const volledigPad = path.join(bronMap, bestand);
            return fs.statSync(volledigPad).isDirectory();
        });
        
        log(`Gevonden subfolders: ${subMappen.length}`);
        
        // Filter bestanden (geen submappen)
        const bestandenInMap = bestanden.filter(bestand => {
            const volledigPad = path.join(bronMap, bestand);
            return !fs.statSync(volledigPad).isDirectory();
        });
        
        log(`Gevonden bestanden in map: ${bestandenInMap.length}`);
        
        // Filter onverwerkte bestanden
        const onverwerkteBestanden = bestandenInMap.filter(bestand => {
            const volledigPad = path.join(bronMap, bestand);
            return !verwerkteBestanden.has(volledigPad);
        });
        
        log(`Onverwerkte bestanden in map: ${onverwerkteBestanden.length}`);
        
        // Verwerk bestanden tot aan de batch limit
        for (const bestand of onverwerkteBestanden) {
            if (isBatchLimietBereikt()) {
                return; // Stop direct met verwerken als batch limiet is bereikt
            }
            
            const bronBestand = path.join(bronMap, bestand);
            const doelBestand = path.join(doelMap, bestand);
            
            // Controleer of het bestand al verwerkt is
            if (verwerkteBestanden.has(bronBestand)) {
                log(`Bestand al verwerkt, overslaan: ${bestand}`);
                continue;
            }
            
            // Maak doelmap aan als deze niet bestaat
            await fs.promises.mkdir(doelMap, { recursive: true });
            
            if (bestand.endsWith('.rst')) {
                log(`Verwerken van RST bestand (${bestandenInHuidigeBatch + 1}/${config.batchSize}): ${bestand}`);
                await verwerkBestand(bronBestand, doelBestand);
            } else {
                log(`Kopiëren van niet-RST bestand (${bestandenInHuidigeBatch + 1}/${config.batchSize}): ${bestand}`);
                await fs.promises.copyFile(bronBestand, doelBestand);
            }
            
            // Update voortgang
            verwerkteBestanden.add(bronBestand);
            totaalVerwerkteBestanden++;
            bestandenInHuidigeBatch++;
            
            // Sla voortgang op na elk bestand
            await slaVoortgangOp(doelMap);
            
            // Check batch limiet na elk bestand
            if (isBatchLimietBereikt()) {
                return;
            }
        }
        
        // Verwerk submappen als we nog niet de batch limiet hebben bereikt
        for (const subMap of subMappen) {
            if (isBatchLimietBereikt()) {
                return; // Stop direct met verwerken als batch limiet is bereikt
            }
            
            const bronSubMap = path.join(bronMap, subMap);
            const doelSubMap = path.join(doelMap, subMap);
            
            await verwerkBestandenInMap(bronSubMap, doelSubMap);
            
            // Check batch limiet na elke submap
            if (isBatchLimietBereikt()) {
                return;
            }
        }
        
    } catch (error) {
        log(`Fout bij verwerken van map ${bronMap}:`, "error");
        log(error.message, "error");
        throw error;
    }
}

async function verwerkMappen(bronMap, doelMap) {
    try {
        // Haal alle items op uit de bronmap
        const items = await fs.promises.readdir(bronMap, { withFileTypes: true });
        
        // Scheid bestanden en mappen
        const bestanden = items.filter(item => !item.isDirectory());
        const submappen = items.filter(item => item.isDirectory());
        
        log(`\n=== VERWERKEN VAN MAP: ${bronMap} ===`);
        log(`Aantal submappen gevonden: ${submappen.length}`);
        
        // Verwerk eerst de bestanden in de huidige map
        await verwerkBestandenInMap(bronMap, doelMap);
        
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
            
            // Maak de doelmap aan als deze nog niet bestaat
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
    log("=== START CONTROLE MISSENDE BESTANDEN ===");
    
    try {
        // Lees alle bestanden uit de bronmap
        const bronBestanden = await getAllFiles(bronMap);
        log(`Totaal aantal bestanden in bronmap: ${bronBestanden.length}`);
        
        // Lees alle bestanden uit de doelmap
        const doelBestanden = await getAllFiles(doelMap);
        log(`Totaal aantal bestanden in doelmap: ${doelBestanden.length}`);
        
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
                
                log(`Verwerken van missend bestand: ${bronBestand}`);
                await verwerkBestand(bronBestand, doelBestand);
                
                // Voeg toe aan verwerkte bestanden
                verwerkteBestanden.add(bronBestand);
                totaalVerwerkteBestanden++;
                
                // Sla voortgang op
                await slaVoortgangOp(doelMap);
            }
            
            log("Alle missende bestanden zijn verwerkt", "success");
        } else {
            log("Geen missende bestanden gevonden", "success");
        }
        
        return true;
    } catch (error) {
        log(`Fout bij controleren missende bestanden: ${error.message}`, "error");
        return false;
    }
}

// Functie om alle bestanden in een map te vinden
async function getAllFiles(dir) {
    const files = await fs.promises.readdir(dir);
    const allFiles = [];
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.promises.stat(filePath);
        
        if (stat.isDirectory()) {
            const subFiles = await getAllFiles(filePath);
            allFiles.push(...subFiles);
        } else {
            allFiles.push(filePath);
        }
    }
    
    return allFiles;
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

// Hoofdfunctie
async function main() {
    try {
        log("\n=== START PROGRAMMA ===");
        log(`Start tijd: ${new Date().toISOString()}`);
        log(`Bronmap: ${config.bronMap}`);
        log(`Doelmap: ${config.doelMap}`);
        
        // Test map toegang
        log("Testen van map toegang...");
        const bronMapToegankelijk = await testMapToegang(config.bronMap);
        const doelMapToegankelijk = await testMapToegang(config.doelMap);
        
        if (!bronMapToegankelijk || !doelMapToegankelijk) {
            throw new Error("Map toegang test mislukt");
        }
        
        // Laad voortgang
        await laadVoortgang(config.doelMap);
        
        // Verwerk bestanden
        await verwerkBestandenInMap(config.bronMap, config.doelMap);
        
        // Controleer en verwerk missende bestanden
        await controleerEnVerwerkMissendeBestanden(config.bronMap, config.doelMap);
        
        // Sla niet-vertaalde woorden op
        await slaNietVertaaldeWoordenOp(config.doelMap);
        
        log("\n=== EINDE PROGRAMMA ===");
        log(`Eind tijd: ${new Date().toISOString()}`);
        log(`Totaal verwerkte bestanden: ${totaalVerwerkteBestanden}`);
        
    } catch (error) {
        log("Fout in hoofdprogramma:", "error");
        log(error.message, "error");
        process.exit(1);
    }
}

// Start het programma
main(); 