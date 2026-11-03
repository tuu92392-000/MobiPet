import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { DEMO_BUILD } from './config/build';

// GitHub Pages serves static files only, so the browser-only demo uses #/ routes: a refresh never 404s.
const Router = DEMO_BUILD ? HashRouter : BrowserRouter;
import { MotionConfig } from 'framer-motion';
import App from './App';
import './index.css';

if (import.meta.env.DEV) {
  // Accessibility checks in dev: violations are logged to the browser console.
  void Promise.all([import('@axe-core/react'), import('react-dom')]).then(([axe, dom]) => {
    axe.default(React, dom, 1000);
  });
  void import('./dev/audit');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Honor prefers-reduced-motion for every Framer Motion animation. */}
    <MotionConfig reducedMotion="user">
      <Router>
        <App />
      </Router>
    </MotionConfig>
  </React.StrictMode>,
);
