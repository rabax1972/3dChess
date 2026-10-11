import './style.css';
import { App } from './ui/app';

const app = new App(document.getElementById('app')!);
// Accesso per il debug e i test end-to-end, solo in sviluppo.
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
