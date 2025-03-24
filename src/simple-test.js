import { promises as fs } from 'fs';
import path from 'path';

console.log('Script gestart');

async function test() {
    try {
        console.log('Test 1: Controleren van huidige directory...');
        const currentDir = process.cwd();
        console.log('Huidige directory:', currentDir);
        
        console.log('\nTest 2: Controleren van src directory...');
        const srcItems = await fs.readdir('./src', { withFileTypes: true });
        console.log('Items in src directory:', srcItems.map(item => item.name));
        
        console.log('\nTest 3: Controleren van package.json...');
        const packageJson = await fs.readFile('./package.json', 'utf8');
        console.log('package.json inhoud:', packageJson);
        
        console.log('\nAlle tests succesvol afgerond!');
    } catch (error) {
        console.error('Fout tijdens test:', error);
    }
}

test(); 