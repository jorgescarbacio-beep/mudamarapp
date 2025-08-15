import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

function PetShopPage({ tarifas, saveTarifas }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tripData, setTripData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [localTarifas, setLocalTarifas] = useState({});
  const [updatingDay, setUpdatingDay] = useState(null);

  const clientName = "Pet Shop";
  const clientKey = "pet_shop";
  const tarifaKey = "pet_shopTarifaViaje";

  useEffect(() => {
    const defaultTarifas = { [tarifaKey]: 175000 };
    setLocalTarifas({ ...defaultTarifas, ...tarifas });
  }, [tarifas, tarifaKey]);

  const monthYearId = `${clientKey}-${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;

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
    const deliveryDays = [1, 3, 5]; // Lunes, Miércoles, Viernes
    while (date.getMonth() === selectedDate.getMonth()) {
      if (deliveryDays.includes(date.getDay())) {
        days.push(new Date(date));
      }
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [selectedDate]);

  const handleCheckboxChange = async (date) => {
    const dateString = date.toISOString().split('T')[0];
    setUpdatingDay(dateString);
    const isCurrentlyChecked = !!tripData[dateString];
    try {
      const docRef = doc(db, "facturacion_mensual", monthYearId);
      await setDoc(docRef, { [dateString]: !isCurrentlyChecked }, { merge: true });
    } catch (error) {
      console.error("Error al actualizar el viaje: ", error);
      alert("Error al guardar el cambio.");
    } finally {
      setUpdatingDay(null);
    }
  };

  const totalAmount = useMemo(() => {
    const TARIFA_VIAJE = localTarifas[tarifaKey] || 0;
    return Object.keys(tripData)
      .filter(key => tripData[key] === true)
      .reduce((total) => total + TARIFA_VIAJE, 0);
  }, [tripData, localTarifas, tarifaKey]);

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

  const TARIFA_FIELDS = [{ key: tarifaKey, label: 'Tarifa por Viaje' }];

  const generatePDF = () => {
    const doc = new jsPDF();
    const monthName = selectedDate.toLocaleString('es-AR', { month: 'long' });
    const year = selectedDate.getFullYear();
    doc.setFontSize(18);
    doc.text(`Remito de Viajes - ${clientName}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Período: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`, 14, 29);

    const tableColumn = ["Fecha", "Descripción", "Importe"];
    const tableRows = calendarDays
      .filter(day => tripData[day.toISOString().split('T')[0]])
      .map(day => [
        day.toLocaleDateString('es-AR'),
        "Viaje Realizado",
        currencyFormatter.format(localTarifas[tarifaKey])
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
          {calendarDays.map(day => {
            const dateString = day.toISOString().split('T')[0];
            return (
              <div key={dateString} className="bg-zinc-700/50 p-4 rounded-lg flex items-center justify-between">
                <div className="font-medium text-white"><p>{day.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })}</p></div>
                <label className={`flex items-center gap-3 text-white ${updatingDay === dateString ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                  <input 
                    type="checkbox" 
                    checked={!!tripData[dateString]} 
                    onChange={() => handleCheckboxChange(day)} 
                    disabled={updatingDay === dateString}
                    className="h-5 w-5 rounded bg-zinc-600 border-zinc-500 text-orange-600 focus:ring-orange-500" 
                  /> 
                  Viaje Realizado ({currencyFormatter.format(localTarifas[tarifaKey])})
                </label>
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

export default PetShopPage;
