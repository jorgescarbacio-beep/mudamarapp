import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { collection, onSnapshot, addDoc, doc, deleteDoc, writeBatch, Timestamp, serverTimestamp } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';
import EditEntryModal from '../components/EditEntryModal.jsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// ========================================================================
// Componente TripSection (Lógica para cada solapa)
// ========================================================================
function TripSection({ entity, tarifas, updateBalance }) {
  const [trips, setTrips] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentTrip, setCurrentTrip] = useState(null);
  const collectionName = `viajes_${entity}`;

  useEffect(() => {
    const tripsCollectionRef = collection(db, collectionName);
    const unsubscribe = onSnapshot(tripsCollectionRef, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data.date && typeof data.date.toDate === 'function') {
          return { ...data, id: doc.id, dateObj: data.date.toDate() };
        }
        return null;
      }).filter(Boolean);
      tripsData.sort((a, b) => b.dateObj - a.dateObj);
      setTrips(tripsData);
    });
    return () => unsubscribe();
  }, [collectionName]);

  const total = useMemo(() => trips.reduce((sum, trip) => sum + trip.amount, 0), [trips]);

  const TARIFA_FIELDS = [
    { key: 'mcViajeFrio', label: 'Viaje de Frío' },
    { key: 'mcViajeComun', label: 'Viaje Común/Interno' },
    { key: 'mcViajeCosta', label: 'Viaje a la Costa' },
    { key: 'mcViajePnmVgl', label: 'Viaje a PNM y VGL' },
    { key: 'mcLimpieza', label: 'Limpieza Techos y Desagues' },
    { key: 'mcOsmosis', label: 'Control Valores Osmosis' }
  ];

  const handleAddTrip = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const tripTypeKey = formData.get('trip-type');
    const selectedTarifa = TARIFA_FIELDS.find(t => t.key === tripTypeKey);
    
    // **CORRECCIÓN DE BUG**: Verificamos que la tarifa exista antes de usarla
    if (!selectedTarifa) {
        alert("Error: Tarifa no encontrada. Asegúrate de que las tarifas estén cargadas.");
        return;
    }

    const price = tarifas[tripTypeKey] || 0;
    const quantity = parseInt(formData.get('quantity'), 10);
    const amount = price * quantity;
    
    let descriptionText = selectedTarifa.label;
    if (quantity > 1) {
      descriptionText += ` x${quantity}`;
    }

    const newTrip = {
      date: Timestamp.fromDate(new Date(formData.get('date') + 'T00:00:00')),
      local: formData.get('local'),
      solicitante: formData.get('solicitante'), // **NUEVO CAMPO**
      description: descriptionText,
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
    if (window.confirm("¿Estás seguro?")) {
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
      await updateDoc(tripDocRef, { 
          date: newDate,
          local: updatedTripData.local,
          solicitante: updatedTripData.solicitante
      });
      setShowEditModal(false);
    } catch (error) {
      console.error("Error al actualizar el viaje:", error);
      alert("Hubo un error al actualizar.");
    }
  };

  // **NUEVA LÓGICA PARA GENERAR Y ARCHIVAR**
  const handleGenerateAndArchive = async () => {
    if (trips.length === 0) {
      alert("No hay viajes para generar un remito.");
      return;
    }

    // 1. Generar el PDF
    const docPDF = new jsPDF();
    docPDF.setFontSize(18);
    docPDF.text(`Remito - ${entity === 'mudamar' ? 'Mudamar' : 'Scarbacio'}`, 14, 22);
    const tableColumn = ["Fecha", "Local", "Solicitó", "Detalle", "Importe"];
    const tableRows = trips.map(trip => [
      trip.date.toDate().toLocaleDateString('es-AR'),
      trip.local,
      trip.solicitante,
      trip.description,
      currencyFormatter.format(trip.amount)
    ]);
    docPDF.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'grid' });
    const finalY = docPDF.lastAutoTable.finalY || 50;
    docPDF.setFont("helvetica", "bold");
    docPDF.text("Total a Facturar:", 14, finalY + 15);
    docPDF.text(currencyFormatter.format(total), 200, finalY + 15, { align: 'right' });
    docPDF.save(`remito_${entity}_${new Date().toISOString().slice(0,10)}.pdf`);

    // 2. Crear el resumen y preparar el borrado
    if (window.confirm("El remito se ha descargado. ¿Deseas archivar estos viajes y limpiar la pantalla?")) {
        try {
            // Guardar resumen
            const remitoData = {
                fechaArchivado: serverTimestamp(),
                entidad: entity,
                total: total,
                cantidadViajes: trips.length,
                viajes: trips.map(t => ({...t, date: t.date.toDate().toISOString()})) // Guardamos una copia de los datos
            };
            await addDoc(collection(db, 'remitos_archivados'), remitoData);

            // Borrar individuales usando un batch
            const batch = writeBatch(db);
            trips.forEach(trip => {
                batch.delete(doc(db, collectionName, trip.id));
            });
            await batch.commit();

            alert("Viajes archivados y limpiados correctamente.");
        } catch (error) {
            console.error("Error al archivar y borrar:", error);
            alert("Hubo un error al archivar los viajes.");
        }
    }
  };

  const localOptions = ["CFM", "ACM", "LGM", "SMM", "TEM", "PRM", "VGL", "PNM"];
  const editFields = [
    { key: 'date', label: 'Fecha', type: 'date' },
    { key: 'local', label: 'Local', type: 'select', options: localOptions },
    { key: 'solicitante', label: 'Solicitante', type: 'select', options: ['Mantenimiento', 'Operaciones'] },
  ];

  return (
    <div>
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

      <div className="flex justify-end mb-4">
        <button onClick={handleGenerateAndArchive} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
          Generar y Archivar Remito
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-2 bg-zinc-800 p-6 rounded-xl border border-zinc-700">
          <h2 className="text-2xl font-semibold mb-6 text-white">Agregar Viaje/Servicio</h2>
          <form onSubmit={handleAddTrip} className="space-y-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-zinc-300 mb-1">Fecha</label>
              <input type="date" id="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" />
            </div>
            <div>
              <label htmlFor="local" className="block text-sm font-medium text-zinc-300 mb-1">Local</label>
              <select id="local" name="local" className="form-select w-full rounded-lg bg-zinc-700 border-zinc-600 text-white">
                {localOptions.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            {/* **NUEVO CAMPO** */}
            <div>
              <label htmlFor="solicitante" className="block text-sm font-medium text-zinc-300 mb-1">Quién pide el viaje</label>
              <select id="solicitante" name="solicitante" className="form-select w-full rounded-lg bg-zinc-700 border-zinc-600 text-white">
                <option>Operaciones</option>
                <option>Mantenimiento</option>
              </select>
            </div>
            <div>
              <label htmlFor="trip-type" className="block text-sm font-medium text-zinc-300 mb-1">Tipo de Viaje/Servicio</label>
              <select id="trip-type" name="trip-type" className="form-select w-full rounded-lg bg-zinc-700 border-zinc-600 text-white">
                {TARIFA_FIELDS.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-zinc-300 mb-1">Cantidad</label>
              <input type="number" id="quantity" name="quantity" defaultValue="1" min="1" className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" />
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
                  <th className="p-3">Solicitó</th>
                  <th className="p-3 text-right">Importe</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trips.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-8 text-zinc-500">Aún no hay viajes guardados.</td></tr>
                ) : (
                  trips.map((trip) => (
                    <tr key={trip.id} className="border-b border-zinc-700 hover:bg-zinc-700/50">
                      <td className="p-3">{trip.date.toDate().toLocaleDateString('es-AR')}</td>
                      <td className="p-3 font-medium text-white">{trip.local} - {trip.description}</td>
                      <td className="p-3">{trip.solicitante}</td>
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

// ========================================================================
// Componente Principal McDonaldsPage
// ========================================================================
function McDonaldsPage({ tarifas, saveTarifas, updateBalance }) {
  const [activeTab, setActiveTab] = useState('mudamar');
  const [showTarifasModal, setShowTarifasModal] = useState(false);
  const [localTarifas, setLocalTarifas] = useState({});

  useEffect(() => {
    const defaultMcTarifas = {
      mcViajeFrio: 32000,
      mcViajeComun: 25000,
      mcViajeCosta: 150000,
      mcViajePnmVgl: 182000,
      mcLimpieza: 215000,
      mcOsmosis: 75000
    };
    setLocalTarifas({ ...defaultMcTarifas, ...tarifas });
  }, [tarifas]);

  const TARIFA_FIELDS = [
    { key: 'mcViajeFrio', label: 'Viaje de Frío' },
    { key: 'mcViajeComun', label: 'Viaje Común/Interno' },
    { key: 'mcViajeCosta', label: 'Viaje a la Costa' },
    { key: 'mcViajePnmVgl', label: 'Viaje a PNM y VGL' },
    { key: 'mcLimpieza', label: 'Limpieza Techos y Desagues' },
    { key: 'mcOsmosis', label: 'Control Valores Osmosis' }
  ];

  const handleSaveTarifas = async (nuevasTarifas) => {
    try {
      const tarifasDocRef = doc(db, "configuracion", "tarifas");
      await setDoc(tarifasDocRef, nuevasTarifas, { merge: true });
      saveTarifas(nuevasTarifas);
      setShowTarifasModal(false);
      alert("¡Tarifas actualizadas con éxito!");
    } catch (error) {
      console.error("Error al guardar tarifas:", error);
      alert("Hubo un error al guardar las tarifas.");
    }
  };

  const TabButton = ({ tabName, title, cuit }) => {
    const isActive = activeTab === tabName;
    return (
      <button onClick={() => setActiveTab(tabName)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 ${isActive ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'}`}>
        <span className="font-bold">{title}</span>
        <span className="block text-xs">{cuit}</span>
      </button>
    );
  };

  return (
    <div>
       <EditTarifasModal
        show={showTarifasModal}
        onClose={() => setShowTarifasModal(false)}
        tarifas={localTarifas}
        onSave={handleSaveTarifas}
        title="Editar Tarifas Comunes"
        fields={TARIFA_FIELDS}
      />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-4xl font-bold text-white">Facturación Mc Donald's</h1>
        <button onClick={() => setShowTarifasModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">
          Editar Tarifas
        </button>
      </div>
      
      <div className="border-b border-zinc-700 mb-4">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <TabButton tabName="mudamar" title="Mudamar" cuit="33-71729627-9" />
          <TabButton tabName="scarbacio" title="Scarbacio" cuit="20-27803155-2" />
        </nav>
      </div>
      
      <div>
        {activeTab === 'mudamar' && <TripSection entity="mudamar" tarifas={localTarifas} saveTarifas={saveTarifas} updateBalance={updateBalance} />}
        {activeTab === 'scarbacio' && <TripSection entity="scarbacio" tarifas={localTarifas} saveTarifas={saveTarifas} updateBalance={updateBalance} />}
      </div>
    </div>
  );
}

export default McDonaldsPage;
