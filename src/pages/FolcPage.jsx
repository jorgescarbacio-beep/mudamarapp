import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function FolcPage({ tarifas, saveTarifas, updateBalance }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tripData, setTripData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [localTarifas, setLocalTarifas] = useState({});

  useEffect(() => {
    const defaultFolcTarifas = {
      folcViajePrincipal: 25000,
      folcViajeMoreno: 15000,
    };
    setLocalTarifas({ ...defaultFolcTarifas, ...tarifas });
  }, [tarifas]);

  const monthYearId = `folc-${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    const docRef = doc(db, "facturacion_mensual", monthYearId);
    const unsubscribe = onSnapshot(docRef, (doc) => {
      setTripData(doc.exists() ? doc.data() : {});
    });
    return () => unsubscribe();
  }, [monthYearId]);

  const calendarDays = useMemo(() => {
    const days = [];
    const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    while (date.getMonth() === selectedDate.getMonth()) {
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 2 || dayOfWeek === 5) { // Martes y Viernes
        days.push(new Date(date));
      }
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [selectedDate]);

  const handleCheckboxChange = async (date, tripType) => {
    const dateString = date.toISOString().split('T')[0];
    const currentDayData = tripData[dateString] || { viajePrincipal: false, viajeMoreno: false };
    const isCurrentlyChecked = !!currentDayData[tripType];
    const newDayData = { ...currentDayData, [tripType]: !isCurrentlyChecked };
    
    try {
      const docRef = doc(db, "facturacion_mensual", monthYearId);
      await setDoc(docRef, { [dateString]: newDayData }, { merge: true });

      const amount = tripType === 'viajePrincipal' ? localTarifas.folcViajePrincipal : localTarifas.folcViajeMoreno;
      const amountToUpdate = isCurrentlyChecked ? -amount : amount;
      // updateBalance(amountToUpdate, 'ingreso'); // Descomentar si se necesita actualizar el balance global
    } catch (error) { 
      console.error("Error al actualizar el viaje: ", error); 
      alert("Error al guardar el cambio.");
    }
  };

  const totalAmount = useMemo(() => {
    return Object.values(tripData).reduce((total, dayData) => {
      if (dayData.viajePrincipal) total += localTarifas.folcViajePrincipal || 0;
      if (dayData.viajeMoreno) total += localTarifas.folcViajeMoreno || 0;
      return total;
    }, 0);
  }, [tripData, localTarifas]);

  const handleSaveTarifas = async (nuevasTarifas) => {
    try {
      const tarifasDocRef = doc(db, "configuracion", "tarifas");
      await setDoc(tarifasDocRef, nuevasTarifas, { merge: true });
      saveTarifas(nuevasTarifas);
      setShowModal(false);
      alert("¡Tarifas actualizadas con éxito!");
    } catch (error) {
      console.error("Error al guardar tarifas:", error);
      alert("Hubo un error al guardar las tarifas.");
    }
  };

  const TARIFA_FIELDS = [
    { key: 'folcViajePrincipal', label: 'Viaje S.Martin-Formosa' },
    { key: 'folcViajeMoreno', label: 'Viaje Moreno' }
  ];
  
  const generatePDF = () => {
    const doc = new jsPDF();
    const monthName = selectedDate.toLocaleString('es-AR', { month: 'long' });
    const year = selectedDate.getFullYear();
    doc.setFontSize(18);
    doc.text("Remito de Viajes - FOLC", 14, 22);
    doc.setFontSize(11);
    doc.text(`Período: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`, 14, 29);

    const tableColumn = ["Fecha", "Descripción del Viaje", "Importe"];
    const tableRows = [];
    calendarDays.forEach(day => {
        const dateString = day.toISOString().split('T')[0];
        const data = tripData[dateString];
        if (data) {
            if (data.viajePrincipal) {
                tableRows.push([
                    day.toLocaleDateString('es-AR'),
                    "Viaje San Martin <-> Formosa",
                    currencyFormatter.format(localTarifas.folcViajePrincipal)
                ]);
            }
            if (data.viajeMoreno) {
                tableRows.push([
                    day.toLocaleDateString('es-AR'),
                    "Viaje a Moreno",
                    currencyFormatter.format(localTarifas.folcViajeMoreno)
                ]);
            }
        }
    });

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'grid' });
    const finalY = doc.lastAutoTable.finalY || 50;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Total a Facturar:", 14, finalY + 15);
    doc.text(currencyFormatter.format(totalAmount), 200, finalY + 15, { align: 'right' });
    
    doc.save(`Remito_Folc_${monthName}_${year}.pdf`);
  };

  return (
    <div>
      <EditTarifasModal
        show={showModal}
        onClose={() => setShowModal(false)}
        tarifas={localTarifas}
        onSave={handleSaveTarifas}
        title="Editar Tarifas de Folc"
        fields={TARIFA_FIELDS}
      />
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">Gestión: Folc</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Editar Tarifas</button>
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
          {calendarDays.map(day => {
            const dateString = day.toISOString().split('T')[0];
            const dayData = tripData[dateString] || {};
            return (
              <div key={dateString} className="bg-zinc-700/50 p-4 rounded-lg flex items-center justify-between">
                <div className="font-medium text-white"><p>{day.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}</p></div>
                <div className="flex gap-6 text-white">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!dayData.viajePrincipal} onChange={() => handleCheckboxChange(day, 'viajePrincipal')} className="h-5 w-5 rounded bg-zinc-600 border-zinc-500 text-orange-600 focus:ring-orange-500" />
                    <span>Viaje S.Martin-Formosa ({currencyFormatter.format(localTarifas.folcViajePrincipal)})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!dayData.viajeMoreno} onChange={() => handleCheckboxChange(day, 'viajeMoreno')} className="h-5 w-5 rounded bg-zinc-600 border-zinc-500 text-orange-600 focus:ring-orange-500" />
                    <span>Viaje Moreno ({currencyFormatter.format(localTarifas.folcViajeMoreno)})</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
         <div className="mt-6 text-right">
            <button onClick={generatePDF} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg">Generar Remito PDF</button>
        </div>
      </div>
    </div>
  );
}

export default FolcPage;
