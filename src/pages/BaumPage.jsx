import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc, setDoc, Timestamp } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';
import EditEntryModal from '../components/EditEntryModal.jsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function BaumPage({ tarifas, saveTarifas, updateBalance }) {
  const [trips, setTrips] = useState([]);
  const [showTarifasModal, setShowTarifasModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentTrip, setCurrentTrip] = useState(null);
  const [localTarifas, setLocalTarifas] = useState({});
  const collectionName = 'viajes_baum';

  const tarifaKey = 'baumTarifaViaje';

  useEffect(() => {
    // Tarifa por defecto para Baum
    const defaultTarifas = { [tarifaKey]: 15000 };
    setLocalTarifas({ ...defaultTarifas, ...tarifas });
  }, [tarifas]);

  useEffect(() => {
    const tripsCollectionRef = collection(db, collectionName);
    const unsubscribe = onSnapshot(tripsCollectionRef, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data.date && typeof data.date.toDate === 'function') {
          return { ...data, id: doc.id, dateObj: data.date.toDate() };
        }
        console.warn(`Documento inválido omitido en ${collectionName}: ${doc.id}`);
        return null;
      }).filter(Boolean);
      tripsData.sort((a, b) => b.dateObj - a.dateObj);
      setTrips(tripsData);
    });
    return () => unsubscribe();
  }, []);

  const total = useMemo(() => trips.reduce((sum, trip) => sum + trip.amount, 0), [trips]);

  const TARIFA_FIELDS = [{ key: tarifaKey, label: 'Tarifa por Viaje' }];

  const handleSaveTarifas = async (nuevasTarifas) => {
    try {
      const tarifasDocRef = doc(db, "configuracion", "tarifas");
      await setDoc(tarifasDocRef, nuevasTarifas, { merge: true });
      saveTarifas(nuevasTarifas);
      setShowTarifasModal(false);
      alert("¡Tarifa actualizada con éxito!");
    } catch (error) {
      console.error("Error al guardar tarifas:", error);
      alert("Hubo un error al guardar las tarifas.");
    }
  };

  const handleAddTrip = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const price = localTarifas[tarifaKey] || 0;
    const quantity = parseInt(formData.get('quantity'), 10);
    const amount = price * quantity;
    
    const newTrip = {
      date: Timestamp.fromDate(new Date(formData.get('date') + 'T00:00:00')),
      local: formData.get('local'),
      description: `Viaje x${quantity}`,
      amount: amount
    };

    try {
      await addDoc(collection(db, collectionName), newTrip);
      updateBalance(amount, 'ingreso');
      e.target.reset();
    } catch (error) {
      console.error("Error al agregar el viaje:", error);
      alert("Error al guardar el viaje.");
    }
  };

  const handleRemoveTrip = async (tripToDelete) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este registro?")) {
      try {
        await deleteDoc(doc(db, collectionName, tripToDelete.id));
        updateBalance(-tripToDelete.amount, 'ingreso');
      } catch (error) {
        console.error("Error al borrar el viaje:", error);
        alert("Error al borrar el viaje.");
      }
    }
  };
  
  const handleUpdateTrip = async (updatedTripData) => {
    try {
      const tripDocRef = doc(db, collectionName, updatedTripData.id);
      const newDate = Timestamp.fromDate(new Date(updatedTripData.date + 'T00:00:00'));
      await updateDoc(tripDocRef, { date: newDate });
      setShowEditModal(false);
    } catch (error) {
      console.error("Error al actualizar el viaje:", error);
      alert("Hubo un error al actualizar.");
    }
  };

  const downloadRemitoPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Remito de Servicios - Baum`, 14, 22);
    
    const tableColumn = ["Fecha", "Local", "Detalle", "Importe"];
    const tableRows = trips.map(trip => [
      trip.date.toDate().toLocaleDateString('es-AR'),
      trip.local,
      trip.description,
      currencyFormatter.format(trip.amount)
    ]);

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'grid' });
    const finalY = doc.lastAutoTable.finalY || 50;
    
    doc.setFont("helvetica", "bold");
    doc.text("Total a Facturar:", 14, finalY + 15);
    doc.text(currencyFormatter.format(total), 200, finalY + 15, { align: 'right' });
    
    doc.save(`Remito_Baum_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const editFields = [
    { key: 'date', label: 'Fecha', type: 'date' },
    { key: 'local', label: 'Local', type: 'text', readOnly: true },
    { key: 'description', label: 'Descripción', type: 'text', readOnly: true },
    { key: 'amount', label: 'Importe', type: 'number', readOnly: true }
  ];

  return (
    <div>
      <EditTarifasModal
        show={showTarifasModal}
        onClose={() => setShowTarifasModal(false)}
        tarifas={localTarifas}
        onSave={handleSaveTarifas}
        title="Editar Tarifa Baum"
        fields={TARIFA_FIELDS}
      />
      {showEditModal && (
        <EditEntryModal
          show={showEditModal}
          onClose={() => setShowEditModal(false)}
          entry={{
            ...currentTrip,
            date: currentTrip.date.toDate().toISOString().split('T')[0]
          }}
          onSave={handleUpdateTrip}
          title="Editar Viaje"
          fields={editFields}
        />
      )}

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-4xl font-bold text-white">Gestión: Baum</h1>
        <div className="flex gap-4">
            <button onClick={() => setShowTarifasModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Editar Tarifa</button>
            <button onClick={downloadRemitoPDF} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Exportar Remito (PDF)</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
        <div className="lg:col-span-2 bg-zinc-800 p-6 rounded-xl border border-zinc-700">
          <h2 className="text-2xl font-semibold mb-6 text-white">Agregar Viaje</h2>
          <form onSubmit={handleAddTrip} className="space-y-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-zinc-300 mb-1">Fecha</label>
              <input type="date" id="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required />
            </div>
            <div>
              <label htmlFor="local" className="block text-sm font-medium text-zinc-300 mb-1">Local</label>
              <select id="local" name="local" className="form-select w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required>
                <option>Constitución</option>
                <option>Güemes</option>
                <option>Fábrica</option>
                <option>Otro</option>
              </select>
            </div>
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-zinc-300 mb-1">Cantidad de Viajes</label>
              <input type="number" id="quantity" name="quantity" defaultValue="1" min="1" className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required/>
            </div>
            <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-lg">Agregar al Resumen</button>
          </form>
        </div>

        <div className="lg:col-span-3 bg-zinc-800 p-6 rounded-xl border border-zinc-700 flex flex-col">
          <h2 className="text-2xl font-semibold mb-6 text-white">Resumen para Facturar</h2>
          <div className="flex-grow overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
            <table className="w-full text-sm text-left text-zinc-400">
              <thead className="text-xs text-zinc-300 uppercase bg-zinc-700 sticky top-0">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Detalle</th>
                  <th className="p-3 text-right">Importe</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trips.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-8 text-zinc-500">Aún no hay viajes guardados.</td></tr>
                ) : (
                  trips.map((trip) => (
                    <tr key={trip.id} className="border-b border-zinc-700 hover:bg-zinc-700/50">
                      <td className="p-3">{trip.date.toDate().toLocaleDateString('es-AR')}</td>
                      <td className="p-3 font-medium text-white">{trip.local} - {trip.description}</td>
                      <td className="p-3 text-right font-mono">{currencyFormatter.format(trip.amount)}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => { setCurrentTrip(trip); setShowEditModal(true); }} className="text-blue-400 hover:text-blue-300 p-1 rounded-full mr-2">✏️</button>
                        <button onClick={() => handleRemoveTrip(trip)} className="text-red-500 hover:text-red-400 p-1 rounded-full">🗑️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-6 border-t-2 border-zinc-700 pt-4">
            <div className="flex justify-between items-center">
              <span className="text-xl font-medium">TOTAL</span>
              <span className="text-3xl font-bold">{currencyFormatter.format(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BaumPage;
