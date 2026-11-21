import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
registerSW({ immediate: true });
createRoot(root).render(<App />);
