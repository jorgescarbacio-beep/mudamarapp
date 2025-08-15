import React, { useState, useEffect } from 'react';
import { db } from './utils/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// Importamos todas las páginas
import SaldosPage from './pages/SaldosPage.jsx';
import McDonaldsPage from './pages/McDonaldsPage.jsx';
import MunicipalidadPage from './pages/MunicipalidadPage.jsx';
import MostazaPage from './pages/MostazaPage.jsx';
import FolcPage from './pages/FolcPage.jsx';
import ChipaPage from './pages/ChipaPage.jsx';
import PetShopPage from './pages/PetShopPage.jsx';
import HannaPage from './pages/HannaPage.jsx';
import MudanzasPage from './pages/MudanzasPage.jsx';
import SueldosPage from './pages/SueldosPage.jsx';
import BurgerKingPage from './pages/BurgerKingPage.jsx';
import BaumPage from './pages/BaumPage.jsx';
import VehiculosPage from './pages/VehiculosPage.jsx';

function PlaceholderPage({ title }) {
  return <h1 className="text-4xl font-bold text-white">{title}</h1>;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('Saldos');
  const [tarifas, setTarifas] = useState({});
  const [balanceData, setBalanceData] = useState({ totalIngresos: 0, totalEgresos: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Estado para el menú en celular

  useEffect(() => {
    const tarifasDocRef = doc(db, "configuracion", "tarifas");
    const unsubscribe = onSnapshot(tarifasDocRef, (doc) => {
      if (doc.exists()) {
        setTarifas(doc.data());
      } else {
        const defaultTarifas = {
          seguroMitsubishi: 119836.00,
          seguroPartner: 65062.62,
          seguroKangoo1: 102541.00,
          seguroKangoo2: 104194.00,
        };
        setDoc(tarifasDocRef, defaultTarifas);
      }
    });
    return () => unsubscribe();
  }, []);

  const saveTarifas = (nuevasTarifas) => {
    setTarifas(prevTarifas => ({ ...prevTarifas, ...nuevasTarifas }));
  };

  const updateBalance = (amount, type) => {
    setBalanceData(prevData => {
      if (type === 'ingreso') {
        return { ...prevData, totalIngresos: prevData.totalIngresos + amount };
      }
      if (type === 'gasto') {
        return { ...prevData, totalEgresos: prevData.totalEgresos + amount };
      }
      return prevData;
    });
  };

  const pageProps = { tarifas, saveTarifas, updateBalance };

  function NavButton({ pageName }) {
    const isActive = currentPage === pageName;
    return (
      <button
        onClick={() => {
          setCurrentPage(pageName);
          setIsSidebarOpen(false); // Cierra el menú al seleccionar una opción en celu
        }}
        className={`w-full text-left px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
          isActive ? 'bg-orange-600 text-white' : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
        }`}
      >
        {pageName}
      </button>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'Saldos': return <SaldosPage {...pageProps} balanceData={balanceData} />;
      case 'Mc Donalds': return <McDonaldsPage {...pageProps} />;
      case 'Mostaza': return <MostazaPage {...pageProps} />;
      case 'Burger King': return <BurgerKingPage {...pageProps} />;
      case 'Municipalidad': return <MunicipalidadPage {...pageProps} />;
      case 'Folc': return <FolcPage {...pageProps} />;
      case 'Chipa de la Tia': return <ChipaPage {...pageProps} />;
      case 'Pet shop': return <PetShopPage {...pageProps} />;
      case 'Hanna': return <HannaPage {...pageProps} />;
      case 'Baum': return <BaumPage {...pageProps} />;
      case 'Mudanzas': return <MudanzasPage {...pageProps} />;
      case 'Sueldos a Pagar': return <SueldosPage {...pageProps} />;
      case 'Vehículos': return <VehiculosPage {...pageProps} />;
      default: return <PlaceholderPage title={`Página "${currentPage}" no encontrada`} />;
    }
  };

  return (
    <div className="relative min-h-screen md:flex bg-zinc-900 text-white font-sans">
      
      {/* Overlay para cerrar el menú en celular */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* ===== BARRA LATERAL (ASIDE) - AHORA ES RESPONSIVE ===== */}
      <aside className={`w-64 bg-zinc-800 p-4 flex flex-col border-r border-zinc-700 fixed inset-y-0 left-0 z-30 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:flex-shrink-0`}>
        <div className="flex items-center justify-center mb-8 flex-shrink-0">
          <img src="/logo.png" alt="Logo Mudamar" className="h-32 w-auto" />
        </div>
        <div className="flex-grow overflow-y-auto pr-2">
          <nav className="flex flex-col gap-4">
            <div><NavButton pageName="Saldos" /></div>
            <div>
              <h3 className="px-4 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ingresos</h3>
              <div className="flex flex-col gap-1">
                <NavButton pageName="Mc Donalds" /><NavButton pageName="Mostaza" /><NavButton pageName="Burger King" /><NavButton pageName="Municipalidad" /><NavButton pageName="Folc" /><NavButton pageName="Chipa de la Tia" /><NavButton pageName="Pet shop" /><NavButton pageName="Hanna" /><NavButton pageName="Baum" /><NavButton pageName="Mudanzas" />
              </div>
            </div>
            <div>
              <h3 className="px-4 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Egresos</h3>
              <div className="flex flex-col gap-1">
                <NavButton pageName="Sueldos a Pagar" /><NavButton pageName="Vehículos" /> 
              </div>
            </div>
          </nav>
        </div>
      </aside>

      {/* ===== CONTENIDO PRINCIPAL (MAIN) ===== */}
      <main className="flex-1 p-6 sm:p-10 overflow-y-auto">
        {/* Botón de Hamburguesa (solo visible en celular) */}
        <button 
          className="md:hidden mb-4 p-2 rounded-md bg-zinc-800 text-white"
          onClick={() => setIsSidebarOpen(true)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </button>
        {renderPage()}
      </main>
    </div>
  );
}
