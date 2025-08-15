import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase'; // Importamos la conexión a Firebase
import { collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc, setDoc, Timestamp } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';
import EditEntryModal from '../components/EditEntryModal.jsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Formateador de moneda
const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const IVA_RATE = 0.21; // 21%

// ========================================================================
// Componente reutilizable para cada sección (CC y FC)
// ========================================================================
function TripSection({ entityKey, title, locales, serviceTypes, tarifas, updateBalance, includeIVA = false }) {
  const [trips, setTrips] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentTrip, setCurrentTrip] = useState(null);
  const collectionName = `viajes_${entityKey}`;

  // Leer datos de Firebase en tiempo real
  useEffect(() => {
    const tripsCollectionRef = collection(db, collectionName);
    const unsubscribe = onSnapshot(tripsCollectionRef, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        // Aseguramos que la fecha sea un objeto Date de Javascript para ordenar
        dateObj: doc.data().date.toDate() 
      }));
      // Ordenar por fecha, más reciente primero
      tripsData.sort((a, b) => b.dateObj - a.dateObj);
      setTrips(tripsData);
    });
    return () => unsubscribe(); // Limpiar la suscripción al desmontar
  }, [collectionName]);

  // Calcular totales
  const subTotal = useMemo(() => trips.reduce((sum, trip) => sum + trip.amount, 0), [trips]);
  const ivaTotal = includeIVA ? subTotal * IVA_RATE : 0;
  const totalGeneral = subTotal + ivaTotal;

  // Agregar un nuevo viaje/servicio
  const handleAddTrip = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const serviceKey = formData.get('service-type');
    const selectedService = serviceTypes.find(s => s.key === serviceKey);
    const price = tarifas[serviceKey] || 0;
    const quantity = parseInt(formData.get('quantity'), 10);
    const amount = price * quantity;
    
    let descriptionText = selectedService.label;
    if (quantity > 1) {
      descriptionText += ` x${quantity}`;
    }

    const newTrip = {
      date: Timestamp.fromDate(new Date(formData.get('date') + 'T00:00:00')), // Guardamos como Timestamp
      local: formData.get('local'),
      description: descriptionText,
      amount: amount
    };

    try {
      await addDoc(collection(db, collectionName), newTrip);
      updateBalance(amount, 'ingreso');
      e.target.reset();
    } catch (error) {
      console.error("Error al agregar el viaje: ", error);
      alert("Error al guardar el viaje.");
    }
  };
  
  // Borrar un viaje
  const handleRemoveTrip = async (tripToDelete) => {
    if (window.confirm("¿Estás seguro de que quieres eliminar este registro?")) {
      try {
        await deleteDoc(doc(db, collectionName, tripToDelete.id));
        updateBalance(-tripToDelete.amount, 'ingreso'); // Restamos del balance
      } catch (error) {
        console.error("Error al borrar el viaje: ", error);
        alert("Error al borrar el viaje.");
      }
    }
  };

  // Actualizar un viaje (solo la fecha por ahora)
  const handleUpdateTrip = async (updatedTripData) => {
     try {
        const tripDocRef = doc(db, collectionName, updatedTripData.id);
        const newDate = Timestamp.fromDate(new Date(updatedTripData.date + 'T00:00:00'));
        await updateDoc(tripDocRef, {
            date: newDate
        });
        setShowEditModal(false);
     } catch (error) {
        console.error("Error al actualizar el viaje:", error);
        alert("Hubo un error al actualizar.");
     }
  };

  // Generar Remito en PDF
  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Remito de Servicios - ${title}`, 14, 22);
    
    const tableColumn = ["Fecha", "Local", "Detalle", "Importe"];
    const tableRows = trips.map(trip => [
      trip.date.toDate().toLocaleDateString('es-AR'),
      trip.local,
      trip.description,
      currencyFormatter.format(trip.amount)
    ]);

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'grid' });
    const finalY = doc.lastAutoTable.finalY || 50;

    doc.setFontSize(12);
    if (includeIVA) {
        doc.text("Subtotal:", 14, finalY + 15);
        doc.text(currencyFormatter.format(subTotal), 200, finalY + 15, { align: 'right' });
        doc.text("IVA (21%):", 14, finalY + 22);
        doc.text(currencyFormatter.format(ivaTotal), 200, finalY + 22, { align: 'right' });
        doc.setFont("helvetica", "bold");
        doc.text("Total a Facturar:", 14, finalY + 29);
        doc.text(currencyFormatter.format(totalGeneral), 200, finalY + 29, { align: 'right' });
    } else {
        doc.setFont("helvetica", "bold");
        doc.text("Total a Facturar:", 14, finalY + 15);
        doc.text(currencyFormatter.format(totalGeneral), 200, finalY + 15, { align: 'right' });
    }
    
    doc.save(`Remito_${entityKey}.pdf`);
  };

  const editFields = [
    { key: 'date', label: 'Fecha', type: 'date' },
    // Campos no editables, solo para mostrar en el modal
    { key: 'local', label: 'Local', type: 'text', readOnly: true },
    { key: 'description', label: 'Descripción', type: 'text', readOnly: true },
    { key: 'amount', label: 'Importe', type: 'number', readOnly: true }
  ];

  return (
    <div>
      {showEditModal && (
        <EditEntryModal
          show={showEditModal}
          onClose={() => setShowEditModal(false)}
          entry={{
            ...currentTrip,
            // Formateamos la fecha para el input tipo 'date'
            date: currentTrip.date.toDate().toISOString().split('T')[0]
          }}
          onSave={handleUpdateTrip}
          title="Editar Registro"
          fields={editFields}
        />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
        {/* Columna para agregar viajes */}
        <div className="lg:col-span-2 bg-zinc-800 p-6 rounded-xl border border-zinc-700">
          <h2 className="text-2xl font-semibold mb-6 text-white">Agregar Servicio</h2>
          <form onSubmit={handleAddTrip} className="space-y-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-zinc-300 mb-1">Fecha</label>
              <input type="date" id="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required />
            </div>
            <div>
              <label htmlFor="local" className="block text-sm font-medium text-zinc-300 mb-1">Local</label>
              <select id="local" name="local" className="form-select w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required>
                {locales.map(local => <option key={local} value={local}>{local}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="service-type" className="block text-sm font-medium text-zinc-300 mb-1">Tipo de Servicio</label>
              <select id="service-type" name="service-type" className="form-select w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required>
                {serviceTypes.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-zinc-300 mb-1">Cantidad</label>
              <input type="number" id="quantity" name="quantity" defaultValue="1" min="1" className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required/>
            </div>
            <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-lg">Agregar al Resumen</button>
          </form>
        </div>

        {/* Columna de resumen */}
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
                  <tr><td colSpan="4" className="text-center py-8 text-zinc-500">Aún no hay servicios guardados.</td></tr>
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
             {includeIVA && (
                <>
                    <div className="flex justify-between items-center text-lg mb-1">
                        <span className="text-zinc-400">Subtotal</span>
                        <span className="font-mono">{currencyFormatter.format(subTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg mb-2">
                        <span className="text-zinc-400">IVA (21%)</span>
                        <span className="font-mono">{currencyFormatter.format(ivaTotal)}</span>
                    </div>
                </>
             )}
            <div className="flex justify-between items-center">
              <span className="text-xl font-medium">TOTAL</span>
              <span className="text-3xl font-bold">{currencyFormatter.format(totalGeneral)}</span>
            </div>
            <button onClick={generatePDF} className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg">Generar Remito PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ========================================================================
// Componente principal de la página Mostaza
// ========================================================================
function MostazaPage({ tarifas, saveTarifas, updateBalance }) {
  const [activeTab, setActiveTab] = useState('cc');
  const [showTarifasModal, setShowTarifasModal] = useState(false);
  
  // ESTADO LOCAL PARA MANEJAR LAS TARIFAS CON VALORES POR DEFECTO
  const [localTarifas, setLocalTarifas] = useState({});

  // USEEFFECT PARA ESTABLECER LOS VALORES POR DEFECTO
  useEffect(() => {
    const defaultMostazaTarifas = {
      mostazaCCViaje: 18000,
      mostazaCCLimpieza: 80000,
      mostazaFCViaje: 20000,
    };
    // Combinamos las tarifas que vienen de App.jsx con las de por defecto.
    // Si una tarifa ya existe en Firebase, se usa esa. Si no, se usa la de por defecto.
    setLocalTarifas({ ...defaultMostazaTarifas, ...tarifas });
  }, [tarifas]); // Se actualiza cada vez que las tarifas globales cambian

  // Definimos todas las tarifas de Mostaza en un solo lugar
  const TARIFA_FIELDS = [
    { key: 'mostazaCCViaje', label: 'Viaje (CC)' },
    { key: 'mostazaCCLimpieza', label: 'Limpieza de Veredas (CC)' },
    { key: 'mostazaFCViaje', label: 'Viaje (FC)' }
  ];

  // FUNCIÓN CORREGIDA PARA GUARDAR TARIFAS EN FIREBASE
  const handleSaveTarifas = async (nuevasTarifas) => {
    try {
      const tarifasDocRef = doc(db, "configuracion", "tarifas");
      // Usamos set con merge:true para crear/actualizar el documento de forma segura
      await setDoc(tarifasDocRef, nuevasTarifas, { merge: true });
      saveTarifas(nuevasTarifas); // Llama a la función de App.jsx para actualizar el estado global
      setShowTarifasModal(false); // Cierra el modal
      alert("¡Tarifas actualizadas con éxito!");
    } catch (error) {
      console.error("Error al guardar tarifas:", error);
      alert("Hubo un error al guardar las tarifas.");
    }
  };

  const TabButton = ({ tabName, title }) => {
    const isActive = activeTab === tabName;
    return (
      <button 
        onClick={() => setActiveTab(tabName)} 
        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 ${
          isActive ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white'
        }`}
      >
        <span className="font-bold">{title}</span>
      </button>
    );
  };

  return (
    <div>
      <EditTarifasModal
        show={showTarifasModal}
        onClose={() => setShowTarifasModal(false)}
        tarifas={localTarifas} // Usamos las tarifas locales con los valores por defecto
        onSave={handleSaveTarifas} // Usamos la función que guarda en Firebase
        title="Editar Tarifas de Mostaza"
        fields={TARIFA_FIELDS}
      />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-4xl font-bold text-white">Gestión: Mostaza</h1>
        <button onClick={() => setShowTarifasModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Editar Tarifas</button>
      </div>

      {/* Navegación por solapas */}
      <div className="border-b border-zinc-700 mb-4">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <TabButton tabName="cc" title="Mostaza CC" />
          <TabButton tabName="fc" title="Mostaza FC" />
        </nav>
      </div>

      {/* Contenido de la solapa activa */}
      <div>
        {activeTab === 'cc' && (
          <TripSection
            entityKey="mostaza_cc"
            title="Mostaza CC"
            locales={['Perla', 'Peatonal']}
            serviceTypes={[
              { key: 'mostazaCCViaje', label: 'Viaje' },
              { key: 'mostazaCCLimpieza', label: 'Limpieza de Veredas' }
            ]}
            tarifas={localTarifas} // Pasamos las tarifas locales
            updateBalance={updateBalance}
            includeIVA={false}
          />
        )}
        {activeTab === 'fc' && (
          <TripSection
            entityKey="mostaza_fc"
            title="Mostaza FC"
            locales={['Aldrey', 'Los Gallegos']}
            serviceTypes={[
              { key: 'mostazaFCViaje', label: 'Viaje' }
            ]}
            tarifas={localTarifas} // Pasamos las tarifas locales
            updateBalance={updateBalance}
            includeIVA={true}
          />
        )}
      </div>
    </div>
  );
}

export default MostazaPage;
