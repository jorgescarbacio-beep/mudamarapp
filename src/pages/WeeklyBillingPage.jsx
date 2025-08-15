import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// Recibimos 'clientName' desde App.jsx para saber a qué cliente corresponde esta página.
// El 'clientKey' se genera a partir del nombre para usarlo en la base de datos.
function WeeklyBillingPage({ clientName, tarifas, saveTarifas }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [facturacionData, setFacturacionData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [localTarifas, setLocalTarifas] = useState({});
  const [updatingWeek, setUpdatingWeek] = useState(null);

  // Generamos una clave única para el cliente para usar en la base de datos y en las tarifas.
  const clientKey = useMemo(() => clientName.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, ''), [clientName]);
  const tarifaKey = `${clientKey}TarifaSemanal`;

  useEffect(() => {
    // Tarifas por defecto para cada cliente
    const defaultTarifas = {
      chipa_de_la_tiaTarifaSemanal: 120000,
      pet_shopTarifaSemanal: 165000,
      hannaTarifaSemanal: 90000,
    };
    setLocalTarifas({ ...defaultTarifas, ...tarifas });
  }, [tarifas]);

  const monthYearId = `${clientKey}-${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    const docRef = doc(db, "facturacion_mensual", monthYearId);
    const unsubscribe = onSnapshot(docRef, 
      (doc) => {
        setFacturacionData(doc.exists() ? doc.data() : {});
      },
      (error) => {
        console.error(`Error al leer datos para ${clientName}:`, error);
        alert(`No se pudieron cargar los datos para ${clientName}. Revisa la consola.`);
      }
    );
    return () => unsubscribe();
  }, [monthYearId]);

  const weeksOfMonth = useMemo(() => {
    const weeks = [];
    const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    
    let weekStart = new Date(firstDay);
    weekStart.setDate(weekStart.getDate() - (weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1));

    while (weekStart <= lastDay) {
      let weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekStart.getMonth() === selectedDate.getMonth() || weekEnd.getMonth() === selectedDate.getMonth()) {
          weeks.push({ 
            id: `week-${weekStart.toISOString().slice(0,10)}`, 
            label: `Semana del ${weekStart.toLocaleDateString('es-AR')} al ${weekEnd.toLocaleDateString('es-AR')}` 
          });
      }
      weekStart.setDate(weekStart.getDate() + 7);
    }
    return weeks;
  }, [selectedDate]);

  const handleCheckboxChange = async (weekId) => {
    setUpdatingWeek(weekId);
    const docRef = doc(db, "facturacion_mensual", monthYearId);
    const isCurrentlyChecked = !!facturacionData[weekId];
    try {
      await setDoc(docRef, { [weekId]: !isCurrentlyChecked }, { merge: true });
    } catch (error) {
      console.error("Error al actualizar la semana: ", error);
      alert("Error al guardar el cambio. Revisa las reglas de seguridad de Firestore.");
    } finally {
      setUpdatingWeek(null);
    }
  };
  
  const TARIFA_SEMANAL = localTarifas[tarifaKey] || 0;

  const totalAmount = useMemo(() => {
    return Object.keys(facturacionData).reduce((total, weekId) => (facturacionData[weekId] ? total + TARIFA_SEMANAL : total), 0);
  }, [facturacionData, TARIFA_SEMANAL]);

  const handleSaveTarifas = async (nuevasTarifas) => {
    try {
      const tarifasDocRef = doc(db, "configuracion", "tarifas");
      await setDoc(tarifasDocRef, nuevasTarifas, { merge: true });
      saveTarifas(nuevasTarifas);
      setShowModal(false);
      alert("¡Tarifa actualizada con éxito!");
    } catch (error) {
      console.error("Error al guardar tarifas:", error);
      alert("Hubo un error al guardar las tarifas.");
    }
  };

  const TARIFA_FIELDS = [{ key: tarifaKey, label: 'Tarifa Semanal' }];

  const generatePDF = () => {
    const doc = new jsPDF();
    const monthName = selectedDate.toLocaleString('es-AR', { month: 'long' });
    const year = selectedDate.getFullYear();
    doc.setFontSize(18);
    doc.text(`Remito de Servicios - ${clientName}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Período: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`, 14, 29);

    const tableColumn = ["Semana", "Estado", "Importe"];
    const tableRows = weeksOfMonth
      .filter(week => facturacionData[week.id])
      .map(week => [
        week.label,
        "Facturada",
        currencyFormatter.format(TARIFA_SEMANAL)
      ]);

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'grid' });
    const finalY = doc.lastAutoTable.finalY || 50;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Total a Facturar:", 14, finalY + 15);
    doc.text(currencyFormatter.format(totalAmount), 200, finalY + 15, { align: 'right' });
    
    doc.save(`Remito_${clientKey}_${monthName}_${year}.pdf`);
  };

  return (
    <div>
      <EditTarifasModal
        show={showModal}
        onClose={() => setShowModal(false)}
        tarifas={localTarifas}
        onSave={handleSaveTarifas}
        title={`Editar Tarifa ${clientName}`}
        fields={TARIFA_FIELDS}
      />
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">Gestión: {clientName}</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Editar Tarifa</button>
      </div>

      <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() - 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">‹</button>
            <h2 className="text-2xl font-semibold text-white capitalize">{selectedDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}</h2>
            <button onClick={() => setSelectedDate(new Date(selectedDate.setMonth(selectedDate.getMonth() + 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">›</button>
          </div>
          <div className="text-right">
            <p className="text-zinc-400">Total del Mes</p>
            <p className="text-3xl font-bold text-green-400">{currencyFormatter.format(totalAmount)}</p>
          </div>
        </div>

        <div className="space-y-4">
          {weeksOfMonth.map(week => (
            <div key={week.id} className="bg-zinc-700/50 p-4 rounded-lg flex items-center justify-between">
              <span className="font-medium text-white">{week.label}</span>
              <label className={`flex items-center gap-3 text-white ${updatingWeek === week.id ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <input 
                  type="checkbox" 
                  checked={!!facturacionData[week.id]} 
                  onChange={() => handleCheckboxChange(week.id)} 
                  disabled={updatingWeek === week.id}
                  className="h-5 w-5 rounded bg-zinc-600 border-zinc-500 text-orange-600 focus:ring-orange-500" 
                /> 
                Facturada ({currencyFormatter.format(TARIFA_SEMANAL)})
              </label>
            </div>
          ))}
        </div>
        <div className="mt-6 text-right">
            <button onClick={generatePDF} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg">Generar Remito PDF</button>
        </div>
      </div>
    </div>
  );
}

export default WeeklyBillingPage;
