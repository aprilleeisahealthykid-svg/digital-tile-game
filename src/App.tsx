import { useEffect, useState } from 'react';
import { HomePage } from './components/HomePage.js';
import { RoomPage } from './components/RoomPage.js';

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export default function App() {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (next: string) => {
    window.history.pushState({}, '', next);
    setPath(currentPath());
  };

  const match = path.match(/^\/room\/([A-Z0-9]{6})$/i);
  return match ? <RoomPage code={match[1].toUpperCase()} navigate={navigate} /> : <HomePage navigate={navigate} />;
}
