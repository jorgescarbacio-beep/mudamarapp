import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { collection, onSnapshot, addDoc, doc, deleteDoc, Timestamp, query, where, getDocs, writeBatch, serverTimestamp, orderBy } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// ========================================================================
// Componente Modal para mostrar los totales del mes
// ========================================================================
function TotalsModal({ show, onClose, totals }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50">
      <div className="bg-zinc-800 rounded-lg shadow-xl p-6 w-full max-w-2xl border border-zinc-700">
        <h2 className="text-2xl font-bold text-white mb-4">Resumen de Gastos del Mes</h2>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-4">
          {Object.keys(totals).map(vehiculoNombre => (
            <div key={vehiculoNombre}>
              <h3 className="text-xl font-semibold text-orange-500">{vehiculoNombre}</h3>
              <table className="w-full mt-2 text-sm text-zinc-300">
                <tbody>
                  <tr className="border-b border-zinc-700">
                    <td className="py-2">Combustible</td>
                    <td className="py-2 text-right font-mono">{currencyFormatter.format(totals[vehiculoNombre].combustible || 0)}</td>
                  </tr>
                  <tr className="border-b border-zinc-700">
                    <td className="py-2">Reparaciones</td>
                    <td className="py-2 text-right font-mono">{currencyFormatter.format(totals[vehiculoNombre].reparaciones || 0)}</td>
                  </tr>
                  <tr className="border-b border-zinc-700">
                    <td className="py-2">Seguros</td>
                    <td className="py-2 text-right font-mono">{currencyFormatter.format(totals[vehiculoNombre].seguros || 0)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="font-bold text-white">
                    <td className="py-2 pt-3">Subtotal Vehículo</td>
                    <td className="py-2 pt-3 text-right font-mono text-lg">{currencyFormatter.format(totals[vehiculoNombre].totalVehiculo || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-zinc-600 pt-4 flex justify-between items-center">
            <h3 className="text-2xl font-bold text-white">Total General</h3>
            <p className="text-3xl font-bold text-red-400">{currencyFormatter.format(totals.totalGeneral || 0)}</p>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded-lg">Cerrar</button>
        </div>
      </div>
    </div>
  );
}


// ========================================================================
// Componente para la sección de GASTOS (Combustible, Reparaciones, etc.)
// ========================================================================
function GastoSection({ vehiculo, tipoGasto, formFields, tableHeaders, selectedDate }) {
  const [gastos, setGastos] = useState([]);
  const collectionPath = `vehiculos/${vehiculo.id}/${tipoGasto}`;

  useEffect(() => {
    const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

    const q = query(
      collection(db, collectionPath),
      where("date", ">=", Timestamp.fromDate(startDate)),
      where("date", "<=", Timestamp.fromDate(endDate))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gastosData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      }));
      setGastos(gastosData);
    });
    return () => unsubscribe();
  }, [collectionPath, selectedDate]);

  const handleAddGasto = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newGasto = {
      date: Timestamp.fromDate(new Date(formData.get('date') + 'T00:00:00')),
    };
    formFields.forEach(field => {
      if (field.key !== 'date') {
        const value = formData.get(field.key);
        newGasto[field.key] = field.type === 'number' ? parseFloat(value) : value;
      }
    });

    try {
      await addDoc(collection(db, collectionPath), newGasto);
      e.target.reset();
    } catch (error) {
      console.error(`Error al agregar ${tipoGasto}:`, error);
      alert(`Error al guardar el gasto.`);
    }
  };

  const handleRemoveGasto = async (id) => {
    if (window.confirm("¿Estás seguro?")) {
      await deleteDoc(doc(db, collectionPath, id));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mt-6">
      <div className="lg:col-span-2 bg-zinc-800 p-6 rounded-xl border border-zinc-700">
        <h3 className="text-2xl font-semibold mb-6 text-white">Agregar Gasto</h3>
        <form onSubmit={handleAddGasto} className="space-y-4">
          {formFields.map(field => (
            <div key={field.key}>
              <label htmlFor={field.key} className="block text-sm font-medium text-zinc-300 mb-1">{field.label}</label>
              {field.type === 'select' ? (
                 <select id={field.key} name={field.key} className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" required>
                   {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                 </select>
              ) : (
                <input 
                  type={field.type || 'text'} 
                  id={field.key} 
                  name={field.key} 
                  step={field.type === 'number' ? '0.01' : undefined}
                  defaultValue={field.type === 'date' ? new Date().toISOString().split('T')[0] : ''}
                  className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" 
                  required 
                />
              )}
            </div>
          ))}
          <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-lg">Agregar Registro</button>
        </form>
      </div>

      <div className="lg:col-span-3 bg-zinc-800 p-6 rounded-xl border border-zinc-700 flex flex-col">
        <h3 className="text-2xl font-semibold mb-6 text-white">Historial del Mes</h3>
        <div className="flex-grow overflow-y-auto pr-2" style={{ maxHeight: '400px' }}>
          <table className="w-full text-sm text-left text-zinc-400">
            <thead className="text-xs text-zinc-300 uppercase bg-zinc-700 sticky top-0">
              <tr>
                {tableHeaders.map(header => <th key={header} className="p-3">{header}</th>)}
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastos.length === 0 ? (
                <tr><td colSpan={tableHeaders.length + 1} className="text-center py-8 text-zinc-500">No hay registros este mes.</td></tr>
              ) : (
                gastos.map((gasto) => (
                  <tr key={gasto.id} className="border-b border-zinc-700 hover:bg-zinc-700/50">
                    {formFields.map(field => (
                       <td key={field.key} className="p-3 font-medium text-white">
                         {field.key === 'date' ? gasto.date.toDate().toLocaleDateString('es-AR') : 
                          field.key === 'importe' ? currencyFormatter.format(gasto.importe) :
                          gasto[field.key]}
                       </td>
                    ))}
                    <td className="p-3 text-center">
                      <button onClick={() => handleRemoveGasto(gasto.id)} className="text-red-500 hover:text-red-400 p-1 rounded-full">🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ========================================================================
// Componente Principal de la página
// ========================================================================
function VehiculosPage({ tarifas, saveTarifas }) {
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [activeTab, setActiveTab] = useState('combustible');
  const [showSegurosModal, setShowSegurosModal] = useState(false);
  const [showTotalsModal, setShowTotalsModal] = useState(false);
  const [monthlyTotals, setMonthlyTotals] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());

  const vehiculos = [
    { id: 'MITSUBISHI_AA015KL', nombre: 'Mitsubishi AA015KL', tarifaKey: 'seguroMitsubishi' },
    { id: 'PARTNER_IBV358', nombre: 'Partner IBV358', tarifaKey: 'seguroPartner' },
    { id: 'KANGOO_AA057GK', nombre: 'Kangoo AA057GK', tarifaKey: 'seguroKangoo1' },
    { id: 'KANGOO_AA702HA', nombre: 'Kangoo AA702HA', tarifaKey: 'seguroKangoo2' },
  ];

  const TARIFA_FIELDS_SEGUROS = vehiculos.map(v => ({ key: v.tarifaKey, label: v.nombre }));

  useEffect(() => {
    const cargarSegurosDelMes = async () => {
      const monthYear = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
      const detalleMes = `Póliza ${selectedDate.toLocaleString('es-AR', { month: 'long' })} ${selectedDate.getFullYear()}`;
      const batch = writeBatch(db);
      let writesCounter = 0;

      for (const vehiculo of vehiculos) {
        const tarifa = tarifas[vehiculo.tarifaKey];
        if (!tarifa) continue;

        const collectionPath = `vehiculos/${vehiculo.id}/seguros`;
        const q = query(collection(db, collectionPath), where("monthYear", "==", monthYear));
        
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          const newSeguroRef = doc(collection(db, collectionPath));
          batch.set(newSeguroRef, {
            date: Timestamp.fromDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)),
            detalle: detalleMes,
            importe: tarifa,
            monthYear: monthYear
          });
          writesCounter++;
        }
      }

      if (writesCounter > 0) {
        await batch.commit();
      }
    };
    
    if (Object.keys(tarifas).length > 0) {
        cargarSegurosDelMes();
    }
  }, [tarifas, selectedDate]);

  const calculateTotals = async () => {
    const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    let totals = { totalGeneral: 0 };

    for (const vehiculo of vehiculos) {
        totals[vehiculo.nombre] = { combustible: 0, reparaciones: 0, seguros: 0, totalVehiculo: 0 };
        for (const tipoGasto of ['combustible', 'reparaciones', 'seguros']) {
            const collectionPath = `vehiculos/${vehiculo.id}/${tipoGasto}`;
            const q = query(
                collection(db, collectionPath),
                where("date", ">=", Timestamp.fromDate(startDate)),
                where("date", "<=", Timestamp.fromDate(endDate))
            );
            const querySnapshot = await getDocs(q);
            const sum = querySnapshot.docs.reduce((acc, doc) => acc + doc.data().importe, 0);
            totals[vehiculo.nombre][tipoGasto] = sum;
            totals[vehiculo.nombre].totalVehiculo += sum;
            totals.totalGeneral += sum;
        }
    }
    setMonthlyTotals(totals);
    setShowTotalsModal(true);
  };

  const renderContent = () => {
    if (!selectedVehicle) {
      return <p className="text-center text-zinc-400 mt-8">Selecciona un vehículo para ver sus gastos.</p>;
    }
    const commonProps = { vehiculo: selectedVehicle, selectedDate };
    switch (activeTab) {
      case 'combustible': return <GastoSection {...commonProps} tipoGasto="combustible" formFields={[{ key: 'date', label: 'Fecha', type: 'date' },{ key: 'detalle', label: 'Tipo', type: 'select', options: ['Nafta', 'Gasoil', 'Gas'] },{ key: 'importe', label: 'Importe', type: 'number' }]} tableHeaders={['Fecha', 'Tipo', 'Importe']} />;
      case 'reparaciones': return <GastoSection {...commonProps} tipoGasto="reparaciones" formFields={[{ key: 'date', label: 'Fecha', type: 'date' },{ key: 'detalle', label: 'Detalle', type: 'text' },{ key: 'importe', label: 'Importe', type: 'number' }]} tableHeaders={['Fecha', 'Detalle', 'Importe']} />;
      case 'seguros': return <GastoSection {...commonProps} tipoGasto="seguros" formFields={[{ key: 'date', label: 'Fecha de Pago', type: 'date' },{ key: 'detalle', label: 'Descripción', type: 'text' },{ key: 'importe', label: 'Importe', type: 'number' }]} tableHeaders={['Fecha de Pago', 'Descripción', 'Importe']} />;
      default: return null;
    }
  };

  const TabButton = ({ tabName, title }) => ( <button onClick={() => setActiveTab(tabName)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 ${ activeTab === tabName ? 'border-orange-500 text-orange-500' : 'border-transparent text-zinc-400 hover:text-white' }`}><span className="font-bold">{title}</span></button> );

  return (
    <div>
      <EditTarifasModal show={showSegurosModal} onClose={() => setShowSegurosModal(false)} tarifas={tarifas} onSave={(nuevasTarifas) => { const tarifasDocRef = doc(db, "configuracion", "tarifas"); setDoc(tarifasDocRef, nuevasTarifas, { merge: true }).then(() => { saveTarifas(nuevasTarifas); setShowSegurosModal(false); alert("Tarifas de seguros actualizadas."); }); }} title="Editar Tarifas de Seguros" fields={TARIFA_FIELDS_SEGUROS} />
      <TotalsModal show={showTotalsModal} onClose={() => setShowTotalsModal(false)} totals={monthlyTotals} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-bold text-white">Gestión de Vehículos</h1>
        <div className="flex gap-4">
          <button onClick={calculateTotals} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">Ver Totales del Mes</button>
          <button onClick={() => setShowSegurosModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Editar Seguros</button>
        </div>
      </div>
      
      <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedDate(d => new Date(d.setMonth(d.getMonth() - 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">‹</button>
            <h2 className="text-2xl font-semibold text-white capitalize">{selectedDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}</h2>
            <button onClick={() => setSelectedDate(d => new Date(d.setMonth(d.getMonth() + 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">›</button>
          </div>
        </div>
        
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-zinc-400 mb-3">Seleccionar Vehículo:</h2>
          <div className="flex flex-wrap gap-3">
            {vehiculos.map(v => (<button key={v.id} onClick={() => setSelectedVehicle(v)} className={`py-2 px-5 rounded-lg font-semibold transition-colors duration-200 ${ selectedVehicle?.id === v.id ? 'bg-orange-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200' }`}>{v.nombre}</button>))}
          </div>
        </div>

        {selectedVehicle && (
          <div className="border-t border-zinc-700 pt-4">
            <h2 className="text-2xl font-bold text-white mb-4">Gastos de: <span className="text-orange-500">{selectedVehicle.nombre}</span></h2>
            <div className="border-b border-zinc-700 mb-4">
              <nav className="-mb-px flex space-x-6" aria-label="Tabs"><TabButton tabName="combustible" title="Combustible" /><TabButton tabName="reparaciones" title="Reparaciones" /><TabButton tabName="seguros" title="Seguros" /></nav>
            </div>
            {renderContent()}
          </div>
        )}
      </div>
    </div>
  );
}

export default VehiculosPage;
