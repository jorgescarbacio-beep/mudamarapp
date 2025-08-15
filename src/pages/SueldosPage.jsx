import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function SueldosPage({ tarifas, saveTarifas, updateBalance }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showTarifasModal, setShowTarifasModal] = useState(false);
  const [estadoSueldos, setEstadoSueldos] = useState({});
  const [localTarifas, setLocalTarifas] = useState({});
  const [updating, setUpdating] = useState(false);

  const monthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
  
  useEffect(() => {
    const defaultSueldos = {
      sueldoGuillermoSemanal: 200000,
      sueldoFabianSemanal: 200000,
      sueldoDiegoMensual: 600000,
    };
    setLocalTarifas({ ...defaultSueldos, ...tarifas });
  }, [tarifas]);

  const { sueldoGuillermoSemanal, sueldoFabianSemanal, sueldoDiegoMensual } = localTarifas;

  const TARIFA_FIELDS = [
    { key: 'sueldoGuillermoSemanal', label: 'Guillermo González (semanal)' },
    { key: 'sueldoFabianSemanal', label: 'Fabian Morales (semanal)' },
    { key: 'sueldoDiegoMensual', label: 'Diego Rancitelli (mensual)' },
  ];

  useEffect(() => {
    const docRef = doc(db, "sueldos_mensual", monthKey);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      setEstadoSueldos(snap.exists() ? snap.data() : {});
    });
    return () => unsubscribe();
  }, [monthKey]);

  const weeksOfMonth = useMemo(() => {
    const weeks = [];
    const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    let weekStart = new Date(firstDay);
    weekStart.setDate(weekStart.getDate() - (weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1));
    while (weekStart <= lastDay) {
      let weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekStart.getMonth() === selectedDate.getMonth() || weekEnd.getMonth() === selectedDate.getMonth()) {
        weeks.push({
          id: `week-${weekStart.toISOString().slice(0,10)}`,
          label: `Semana del ${weekStart.toLocaleDateString('es-AR')} al ${weekEnd.toLocaleDateString('es-AR')}`,
        });
      }
      weekStart.setDate(weekStart.getDate() + 7);
    }
    return weeks;
  }, [selectedDate]);

  const handleSaveTarifas = async (nuevasTarifas) => {
    try {
      const tarifasDocRef = doc(db, "configuracion", "tarifas");
      await setDoc(tarifasDocRef, nuevasTarifas, { merge: true });
      saveTarifas(nuevasTarifas);
      setShowTarifasModal(false);
      alert("¡Sueldos actualizados con éxito!");
    } catch (error) {
      console.error("Error al guardar sueldos:", error);
      alert("Hubo un error al guardar los sueldos.");
    }
  };

  // **INICIO DE LA CORRECCIÓN**
  // Lógica de guardado más robusta que crea el documento si no existe.
  const toggleSemanal = async (empleadoKey, montoSemanal, weekId) => {
    setUpdating(true);
    const docRef = doc(db, "sueldos_mensual", monthKey);
    
    // Hacemos una copia profunda para no modificar el estado directamente
    const newEstadoSueldos = JSON.parse(JSON.stringify(estadoSueldos));

    // Nos aseguramos de que el objeto para el empleado exista
    if (!newEstadoSueldos[empleadoKey]) {
      newEstadoSueldos[empleadoKey] = {};
    }

    // Cambiamos el estado del pago para esa semana
    const currentStatus = !!newEstadoSueldos[empleadoKey][weekId];
    newEstadoSueldos[empleadoKey][weekId] = !currentStatus;

    try {
      // Guardamos el objeto completo. setDoc lo creará si no existe.
      await setDoc(docRef, newEstadoSueldos);
      const amountToUpdate = currentStatus ? -montoSemanal : montoSemanal;
      updateBalance(amountToUpdate, 'gasto');
    } catch (error) {
      console.error("Error al actualizar sueldo semanal:", error);
      alert("Error al guardar el pago. Revisa tus reglas de seguridad en Firebase.");
    } finally {
      setUpdating(false);
    }
  };

  const toggleMensual = async (empleadoKey, montoMensual) => {
    setUpdating(true);
    const docRef = doc(db, "sueldos_mensual", monthKey);
    const newEstadoSueldos = JSON.parse(JSON.stringify(estadoSueldos));

    if (!newEstadoSueldos[empleadoKey]) {
      newEstadoSueldos[empleadoKey] = {};
    }

    const currentStatus = !!newEstadoSueldos[empleadoKey].mes;
    newEstadoSueldos[empleadoKey].mes = !currentStatus;

    try {
      await setDoc(docRef, newEstadoSueldos);
      const amountToUpdate = currentStatus ? -montoMensual : montoMensual;
      updateBalance(amountToUpdate, 'gasto');
    } catch (error) {
      console.error("Error al actualizar sueldo mensual:", error);
      alert("Error al guardar el pago.");
    } finally {
      setUpdating(false);
    }
  };
  // **FIN DE LA CORRECCIÓN**

  const totalMes = useMemo(() => {
    let total = 0;
    const g = estadoSueldos.guillermo || {};
    const f = estadoSueldos.fabian || {};
    const d = estadoSueldos.diego || {};
    Object.keys(g).forEach(k => { if (k.startsWith('week-') && g[k]) total += sueldoGuillermoSemanal; });
    Object.keys(f).forEach(k => { if (k.startsWith('week-') && f[k]) total += sueldoFabianSemanal; });
    if (d.mes) total += sueldoDiegoMensual;
    return total;
  }, [estadoSueldos, sueldoGuillermoSemanal, sueldoFabianSemanal, sueldoDiegoMensual]);

  return (
    <div>
      <EditTarifasModal
        show={showTarifasModal}
        onClose={() => setShowTarifasModal(false)}
        tarifas={localTarifas}
        onSave={handleSaveTarifas}
        title="Editar Sueldos"
        fields={TARIFA_FIELDS}
      />
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">Sueldos a Pagar</h1>
        <button onClick={() => setShowTarifasModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Editar Sueldos</button>
      </div>

      <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">‹</button>
            <h2 className="text-2xl font-semibold text-white capitalize">{selectedDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}</h2>
            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">›</button>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Total Sueldos del Mes</p>
            <p className="text-3xl font-bold text-red-400">{currencyFormatter.format(totalMes)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna Guillermo */}
          <div className="bg-zinc-700/30 rounded-lg p-4 border border-zinc-700">
            <h3 className="text-xl font-semibold text-white mb-2">Guillermo González</h3>
            <p className="text-sm text-zinc-400 mb-4">Sueldo semanal: {currencyFormatter.format(sueldoGuillermoSemanal)}</p>
            <div className="space-y-3">
              {weeksOfMonth.map(week => {
                const checked = !!(estadoSueldos.guillermo && estadoSueldos.guillermo[week.id]);
                return (
                  <div key={week.id} className="flex items-center justify-between bg-zinc-700/50 p-3 rounded-md">
                    <span className="text-white">{week.label}</span>
                    <label className={`flex items-center gap-2 text-white ${updating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      <input type="checkbox" checked={checked} disabled={updating} onChange={() => toggleSemanal('guillermo', sueldoGuillermoSemanal, week.id)} className="h-5 w-5 rounded bg-zinc-600 border-zinc-500 text-orange-600 focus:ring-orange-500" />
                      Pagado
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columna Fabian */}
          <div className="bg-zinc-700/30 rounded-lg p-4 border border-zinc-700">
            <h3 className="text-xl font-semibold text-white mb-2">Fabian Morales</h3>
            <p className="text-sm text-zinc-400 mb-4">Sueldo semanal: {currencyFormatter.format(sueldoFabianSemanal)}</p>
            <div className="space-y-3">
              {weeksOfMonth.map(week => {
                const checked = !!(estadoSueldos.fabian && estadoSueldos.fabian[week.id]);
                return (
                  <div key={week.id} className="flex items-center justify-between bg-zinc-700/50 p-3 rounded-md">
                    <span className="text-white">{week.label}</span>
                    <label className={`flex items-center gap-2 text-white ${updating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      <input type="checkbox" checked={checked} disabled={updating} onChange={() => toggleSemanal('fabian', sueldoFabianSemanal, week.id)} className="h-5 w-5 rounded bg-zinc-600 border-zinc-500 text-orange-600 focus:ring-orange-500" />
                      Pagado
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fila Diego */}
        <div className="mt-6 bg-zinc-700/30 rounded-lg p-4 border border-zinc-700">
          <h3 className="text-xl font-semibold text-white mb-2">Diego Rancitelli</h3>
          <p className="text-sm text-zinc-400 mb-4">Sueldo mensual: {currencyFormatter.format(sueldoDiegoMensual)}</p>
          <div className="flex items-center justify-between bg-zinc-700/50 p-3 rounded-md">
            <span className="text-white">Mes de {selectedDate.toLocaleString('es-AR', { month: 'long' })}</span>
            <label className={`flex items-center gap-2 text-white ${updating ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={!!(estadoSueldos.diego && estadoSueldos.diego.mes)} disabled={updating} onChange={() => toggleMensual('diego', sueldoDiegoMensual)} className="h-5 w-5 rounded bg-zinc-600 border-zinc-500 text-orange-600 focus:ring-orange-500" />
              Pagado
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SueldosPage;
