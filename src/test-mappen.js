import { promises as fs } from 'fs';
import path from 'path';

async function toonMappenStructuur(bronMap, doelMap) {
    console.log('\n=== MAPPENSTRUCTUUR ===');
    console.log('Bronmap:', bronMap);
    console.log('Doelmap:', doelMap);
    
    try {
        // Controleer bronmap
        console.log('\nInhoud bronmap:');
        const bronItems = await fs.readdir(bronMap, { withFileTypes: true });
        for (const item of bronItems) {
            console.log(`${item.isDirectory() ? '📁' : '📄'} ${item.name}`);
        }
        
        // Controleer doelmap
        console.log('\nInhoud doelmap:');
        const doelItems = await fs.readdir(doelMap, { withFileTypes: true });
        for (const item of doelItems) {
            console.log(`${item.isDirectory() ? '📁' : '📄'} ${item.name}`);
        }
        
        console.log('\nTest succesvol afgerond!');
    } catch (error) {
        console.error('Fout tijdens test:', error);
        process.exit(1);
    }
}

// Test de mappenstructuur
const bronMap = '/Users/pdiermen/Development/atlantis-docs/docs/nl';
const doelMap = '/Users/pdiermen/Development/atlantis-docs/docs/en';

toonMappenStructuur(bronMap, doelMap); 