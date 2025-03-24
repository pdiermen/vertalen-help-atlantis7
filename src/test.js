import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ES modules fix voor __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Script gestart");

// Laad environment variabelen
dotenv.config();

console.log("Environment variabelen geladen");

const bronMap = process.env.BRON_MAP;
const doelMap = process.env.DOEL_MAP;

console.log("Bronmap:", bronMap);
console.log("Doelmap:", doelMap);

async function testMappen() {
    try {
        console.log('Test 1: Controleren van bronmap...');
        const bronItems = await fs.readdir(bronMap, { withFileTypes: true });
        console.log('Items in bronmap:', bronItems.map(item => item.name));
        
        console.log('\nTest 2: Controleren van doelmap...');
        const doelItems = await fs.readdir(doelMap, { withFileTypes: true });
        console.log('Items in doelmap:', doelItems.map(item => item.name));
        
        console.log('\nTest 3: Controleren van Management map...');
        const managementItems = await fs.readdir(path.join(bronMap, 'Management'), { withFileTypes: true });
        console.log('Items in Management map:', managementItems.map(item => item.name));
        
        console.log('\nAlle tests succesvol afgerond!');
    } catch (error) {
        console.error('Fout tijdens test:', error);
    }
}

testMappen(); 