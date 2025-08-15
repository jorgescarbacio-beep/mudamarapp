import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import EditEntryModal from '../components/EditEntryModal.jsx';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function MudanzasPage({ updateBalance }) {
  const [mudanzas, setMudanzas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [currentMudanza, setCurrentMudanza] = useState(null);
  const collectionName = "mudanzas";

  // Se conecta a Firebase y trae las mudanzas ordenadas por fecha
  useEffect(() => {
    const q = query(collection(db, collectionName), orderBy("fecha", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id, 
        ...doc.data(),
      }));
      setMudanzas(data);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenModal = (mudanza = null) => {
    // Si estamos editando, convertimos el Timestamp de Firebase a un formato que el input[type=date] entienda
    const entryToEdit = mudanza ? { ...mudanza, fecha: mudanza.fecha.toDate().toISOString().split('T')[0] } : null;
    setCurrentMudanza(entryToEdit);
    setShowModal(true);
  };

  const handleSave = async (entryData) => {
    // Convertimos los montos a números para guardarlos correctamente
    const cobrado = parseFloat(entryData.cobrado) || 0;
    const pagado = parseFloat(entryData.pagado) || 0;

    const mudanzaPayload = {
      ...entryData,
      fecha: Timestamp.fromDate(new Date(entryData.fecha + 'T00:00:00')),
      cobrado,
      pagado,
    };

    try {
      if (currentMudanza && currentMudanza.id) {
        // --- Lógica para EDITAR una mudanza existente ---
        const docRef = doc(db, collectionName, currentMudanza.id);
        // Calculamos la diferencia para ajustar el balance
        const diffCobrado = cobrado - currentMudanza.cobrado;
        const diffPagado = pagado - currentMudanza.pagado;
        
        await updateDoc(docRef, mudanzaPayload);
        
        if(diffCobrado !== 0) updateBalance(diffCobrado, 'ingreso');
        if(diffPagado !== 0) updateBalance(diffPagado, 'gasto');

      } else {
        // --- Lógica para AGREGAR una nueva mudanza ---
        await addDoc(collection(db, collectionName), mudanzaPayload);
        updateBalance(cobrado, 'ingreso');
        updateBalance(pagado, 'gasto');
      }
      setShowModal(false);
    } catch (error) {
      console.error("Error al guardar la mudanza:", error);
      alert("No se pudo guardar la mudanza. Revisa la consola.");
    }
  };

  const handleDelete = async (mudanza) => {
    if (window.confirm(`¿Seguro que quieres eliminar la mudanza del cliente "${mudanza.cliente}"?`)) {
        try {
            await deleteDoc(doc(db, collectionName, mudanza.id));
            // Revertimos los montos en el balance general
            updateBalance(-mudanza.cobrado, 'ingreso');
            updateBalance(-mudanza.pagado, 'gasto');
        } catch (error) {
            console.error("Error al eliminar la mudanza:", error);
            alert("No se pudo eliminar la mudanza.");
        }
    }
  };

  const totals = useMemo(() => mudanzas.reduce((acc, curr) => {
    const cobrado = curr.cobrado || 0;
    const pagado = curr.pagado || 0;
    return {
      cobrado: acc.cobrado + cobrado,
      pagado: acc.pagado + pagado,
      saldo: acc.saldo + (cobrado - pagado)
    }
  }, { cobrado: 0, pagado: 0, saldo: 0 }), [mudanzas]);

  const modalFields = [
    { key: 'fecha', label: 'Fecha', type: 'date' },
    { key: 'cliente', label: 'Nombre del Cliente', type: 'text' },
    { key: 'origen', label: 'Lugar de Retiro', type: 'text' },
    { key: 'destino', label: 'Lugar de Destino', type: 'text' },
    { key: 'cobrado', label: 'Monto Cobrado', type: 'number', step: '0.01' },
    { key: 'pagado', label: 'Monto Pagado (Dueño Camión)', type: 'number', step: '0.01' }
  ];

  return (
    <div>
      {showModal && (
        <EditEntryModal
          show={showModal}
          onClose={() => setShowModal(false)}
          entry={currentMudanza}
          onSave={handleSave}
          fields={modalFields}
          title={currentMudanza ? "Editar Mudanza" : "Registrar Nueva Mudanza"}
        />
      )}

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">Gestión de Mudanzas</h1>
        <button onClick={() => handleOpenModal()} className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg">Registrar Mudanza</button>
      </div>

      <div className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
        <table className="w-full text-sm text-left text-zinc-400">
          <thead className="text-xs text-zinc-300 uppercase bg-zinc-700">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Origen</th>
              <th className="p-3">Destino</th>
              <th className="p-3 text-right">Cobrado</th>
              <th className="p-3 text-right">Pagado</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {mudanzas.map(m => {
              const cobrado = m.cobrado || 0;
              const pagado = m.pagado || 0;
              const saldo = cobrado - pagado;
              return (
                <tr key={m.id} className="border-b border-zinc-700 hover:bg-zinc-700/50">
                  <td className="p-3 font-medium text-white">{m.fecha.toDate().toLocaleDateString('es-AR')}</td>
                  <td className="p-3">{m.cliente}</td>
                  <td className="p-3">{m.origen}</td>
                  <td className="p-3">{m.destino}</td>
                  <td className="p-3 text-right font-mono text-green-400">{currencyFormatter.format(cobrado)}</td>
                  <td className="p-3 text-right font-mono text-red-400">{currencyFormatter.format(pagado)}</td>
                  <td className="p-3 text-right font-mono text-white font-bold">{currencyFormatter.format(saldo)}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleOpenModal(m)} className="text-blue-400 hover:text-blue-300 p-1 rounded-full mr-2">✏️</button>
                    <button onClick={() => handleDelete(m)} className="text-red-500 hover:text-red-400 p-1 rounded-full">🗑️</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-zinc-700 font-bold text-white">
            <tr>
              <td colSpan="4" className="p-3 text-right">TOTALES:</td>
              <td className="p-3 text-right font-mono text-green-400">{currencyFormatter.format(totals.cobrado)}</td>
              <td className="p-3 text-right font-mono text-red-400">{currencyFormatter.format(totals.pagado)}</td>
              <td className="p-3 text-right font-mono">{currencyFormatter.format(totals.saldo)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default MudanzasPage;
