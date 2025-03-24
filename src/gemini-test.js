import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

console.log('Script gestart');

// Laad environment variabelen
dotenv.config();

console.log('Environment variabelen geladen');

// Configuratie
const config = {
    geminiApiKey: process.env.GEMINI_API_KEY,
};

console.log('Config:', config);

// Configureer Gemini API
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

console.log('Gemini API geconfigureerd');

async function testGemini() {
    try {
        console.log('Start Gemini API test...');
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log('Model geïnitialiseerd');
        
        const prompt = 'Vertaal het woord "hallo" naar het Engels.';
        console.log('Prompt voorbereid:', prompt);
        
        const result = await model.generateContent(prompt);
        console.log('Resultaat ontvangen');
        
        const response = await result.response;
        console.log('Vertaling:', response.text());
        
        console.log('Test succesvol afgerond!');
    } catch (error) {
        console.error('Fout tijdens Gemini API test:', error);
        process.exit(1);
    }
}

testGemini(); 