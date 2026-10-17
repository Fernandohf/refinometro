import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { lerDoEndereco } from './compartilhar';
import './index.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Elemento #root não encontrado');

// O link de uma simulação precisa ser lido antes do primeiro render: é ele que
// põe a conta no `localStorage`, de onde o app a lê já no `useState`. Sem
// `#s=` no endereço, a promessa resolve na hora e nada espera.
void lerDoEndereco()
  .catch(() => null)
  .then((compartilhada) =>
    createRoot(raiz).render(
      <StrictMode>
        <App compartilhada={compartilhada} />
      </StrictMode>,
    ),
  );
