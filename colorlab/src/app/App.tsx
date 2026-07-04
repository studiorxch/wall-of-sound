import React, { useState } from 'react';
import ColorlabLibrary from '../components/ColorlabLibrary';
import PaletteGeneratorPanel from '../components/PaletteGeneratorPanel';

type Tab = 'library' | 'create';

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [libraryKey, setLibraryKey] = useState(0);

  const handleSaved = () => {
    setLibraryKey(k => k + 1);
    setTab('library');
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Colorlab</h1>
        <nav className="app__tabs">
          <button
            className={`tab-btn${tab === 'library' ? ' tab-btn--active' : ''}`}
            onClick={() => setTab('library')}
          >
            Library
          </button>
          <button
            className={`tab-btn${tab === 'create' ? ' tab-btn--active' : ''}`}
            onClick={() => setTab('create')}
          >
            Create
          </button>
        </nav>
      </header>

      <main className="app__main">
        {tab === 'library' && (
          <div className="cl-layout">
            <ColorlabLibrary
              refreshKey={libraryKey}
              onCreateNew={() => setTab('create')}
            />
          </div>
        )}
        {tab === 'create' && (
          <div className="cl-layout">
            <PaletteGeneratorPanel onSaved={handleSaved} />
          </div>
        )}
      </main>
    </div>
  );
}
