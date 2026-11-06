import { createRoot } from 'react-dom/client';
import './app.css';
import App from './app/App';
import { isCameraWindow } from './lib/extension/appWindow';
import { configurePopupSize } from './lib/extension/popupSize';

configurePopupSize();
if (isCameraWindow(window.location.href))
  document.documentElement.classList.add('camera-window');
const target = document.getElementById('app');
if (!target) throw new Error('Could not find app container');
createRoot(target).render(<App />);
