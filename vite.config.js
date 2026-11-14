import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { target: 'es2022', rollupOptions: { output: { manualChunks(id) { if(id.includes('@firebase/firestore'))return 'firestore'; if(id.includes('@firebase/auth'))return 'auth'; if(id.includes('@firebase/database'))return 'realtime'; } } } } });
