import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, onSnapshot, addDoc, doc, deleteDoc, setDoc, Timestamp, serverTimestamp, query, where } from 'firebase/firestore';
import EditTarifasModal from '../components/EditTarifasModal.jsx';
import EditEntryModal from '../components/EditEntryModal.jsx';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export default function MunicipalidadPage({ tarifas, saveTarifas, updateBalance }) {
  const [facturasPendientes, setFacturasPendientes] = useState([]);
  const [facturasCobradas, setFacturasCobradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTarifasModal, setShowTarifasModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentFactura, setCurrentFactura] = useState(null);
  const [localTarifas, setLocalTarifas] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());

  const collectionNamePendientes = 'facturas_municipalidad';
  const collectionNameCobradas = 'facturas_cobradas_muni';

  useEffect(() => {
    const defaultTarifas = { muniMontoFijo: 3658590.00 };
    setLocalTarifas({ ...defaultTarifas, ...tarifas });
  }, [tarifas]);

  useEffect(() => {
    const q = query(collection(db, collectionNamePendientes));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const facturasData = snapshot.docs.map(doc => {
        const data = doc.data();
        const parseDate = (dateField) => {
          if (!dateField) return null;
          if (typeof dateField.toDate === 'function') return dateField.toDate();
          if (typeof dateField === 'string' && dateField.includes('/')) {
            const parts = dateField.split('/');
            if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
          }
          return null;
        };
        const fechaEmisionObj = parseDate(data.fechaEmision);
        if (!fechaEmisionObj) return null;
        return { ...data, id: doc.id, fechaEmisionObj, fechaVencimientoObj: parseDate(data.fechaVencimiento) };
      }).filter(Boolean);
      facturasData.sort((a, b) => b.fechaEmisionObj - a.fechaEmisionObj);
      setFacturasPendientes(facturasData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    const q = query(collection(db, collectionNameCobradas), where("fechaCobro", ">=", startDate), where("fechaCobro", "<=", endDate));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const cobradasData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        setFacturasCobradas(cobradasData);
    });
    return () => unsubscribe();
  }, [selectedDate]);

  const handleSaveTarifas = async (nuevasTarifas) => {
    try {
      const tarifasDocRef = doc(db, "configuracion", "tarifas");
      await setDoc(tarifasDocRef, nuevasTarifas, { merge: true });
      saveTarifas(nuevasTarifas);
      setShowTarifasModal(false);
      alert("¡Tarifa actualizada con éxito!");
    } catch (error) {
      console.error("Error al guardar tarifa:", error);
      alert("Hubo un error al guardar la tarifa.");
    }
  };

  const handleAddFactura = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const fechaEmision = new Date(formData.get('fechaEmision') + 'T00:00:00');
    let fechaVencimiento = new Date(fechaEmision);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 60);
    const newInvoice = {
      periodo: formData.get('periodo'),
      nroFactura: formData.get('nroFactura'),
      fechaEmision: Timestamp.fromDate(fechaEmision),
      fechaVencimiento: Timestamp.fromDate(fechaVencimiento),
      monto: localTarifas.muniMontoFijo || 0,
      estado: 'Pendiente'
    };
    try {
      await addDoc(collection(db, collectionNamePendientes), newInvoice);
      e.target.reset();
    } catch (error) {
      console.error("Error al registrar la factura:", error);
      alert("Error al registrar la factura.");
    }
  };

  const handleDeleteFactura = async (facturaToDelete) => {
    if (window.confirm(`¿Seguro que quieres eliminar la factura del período "${facturaToDelete.periodo}"?`)) {
      try {
        await deleteDoc(doc(db, collectionNamePendientes, facturaToDelete.id));
      } catch (error) {
        console.error("Error al eliminar factura:", error);
        alert("Error al eliminar la factura.");
      }
    }
  };

  const handleUpdateFactura = async (facturaToUpdate) => {
     try {
        const facturaDocRef = doc(db, collectionNamePendientes, facturaToUpdate.id);
        const fechaEmision = new Date(facturaToUpdate.fechaEmision + 'T00:00:00');
        let fechaVencimiento = new Date(fechaEmision);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 60);
        await updateDoc(facturaDocRef, {
            periodo: facturaToUpdate.periodo,
            nroFactura: facturaToUpdate.nroFactura,
            fechaEmision: Timestamp.fromDate(fechaEmision),
            fechaVencimiento: Timestamp.fromDate(fechaVencimiento)
        });
        setShowEditModal(false);
     } catch (error) {
        console.error("Error al actualizar factura:", error);
        alert("Hubo un error al actualizar.");
     }
  };

  const handleMarkAsPaid = async (factura) => {
    if (window.confirm(`¿Confirmas que la factura de "${factura.periodo}" ha sido pagada?`)) {
      try {
        const cobroData = {
          cliente: "Municipalidad",
          monto: factura.monto,
          fechaCobro: serverTimestamp(),
          fechaFactura: factura.fechaEmision,
          periodo: factura.periodo,
          nroFactura: factura.nroFactura,
        };
        await addDoc(collection(db, collectionNameCobradas), cobroData);
        await deleteDoc(doc(db, collectionNamePendientes, factura.id));
        updateBalance(factura.monto, 'ingreso');
        alert("Factura marcada como pagada y movida a cobros.");
      } catch (error) {
        console.error("Error al marcar como pagada:", error);
        alert("Error al procesar el pago. Revisa la consola.");
      }
    }
  };
  
  // **INICIO DE LA CORRECCIÓN**
  const handleUndoCobro = async (facturaCobrada) => {
    if (window.confirm(`¿Quieres deshacer el cobro de la factura "${facturaCobrada.nroFactura}" y moverla a pendientes?`)) {
      try {
        // Función segura para convertir la fecha, sin importar si es Timestamp o texto.
        const parseDate = (dateField) => {
          if (!dateField) return null;
          if (typeof dateField.toDate === 'function') return dateField.toDate();
          return new Date(dateField);
        };
        
        const fechaFacturaOriginal = parseDate(facturaCobrada.fechaFactura);
        if (!fechaFacturaOriginal) {
            alert("Error: No se pudo leer la fecha original de la factura cobrada.");
            return;
        }

        let fechaVencimiento = new Date(fechaFacturaOriginal);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 60);

        const pendienteData = {
          periodo: facturaCobrada.periodo,
          nroFactura: facturaCobrada.nroFactura,
          fechaEmision: Timestamp.fromDate(fechaFacturaOriginal),
          fechaVencimiento: Timestamp.fromDate(fechaVencimiento),
          monto: facturaCobrada.monto,
          estado: 'Pendiente'
        };
        await addDoc(collection(db, collectionNamePendientes), pendienteData);
        await deleteDoc(doc(db, collectionNameCobradas, facturaCobrada.id));
        updateBalance(-facturaCobrada.monto, 'ingreso');
        alert("El cobro se ha deshecho. La factura está nuevamente en pendientes.");
      } catch (error) {
        console.error("Error al deshacer el cobro:", error);
        alert("No se pudo deshacer el cobro. Revisa la consola.");
      }
    }
  };
  // **FIN DE LA CORRECCIÓN**

  const TARIFA_FIELDS = [{ key: 'muniMontoFijo', label: 'Monto Fijo Mensual' }];
  const editFields = [
    { key: 'periodo', label: 'Período', type: 'text' },
    { key: 'nroFactura', label: 'Nº Factura', type: 'text' },
    { key: 'fechaEmision', label: 'Fecha Emisión', type: 'date' },
  ];

  return (
    <div>
      <EditTarifasModal show={showTarifasModal} onClose={() => setShowTarifasModal(false)} tarifas={localTarifas} onSave={handleSaveTarifas} title="Editar Tarifa Municipalidad" fields={TARIFA_FIELDS} />
      {showEditModal && (
         <EditEntryModal show={showEditModal} onClose={() => setShowEditModal(false)} entry={{ ...currentFactura, fechaEmision: currentFactura.fechaEmisionObj.toISOString().split('T')[0] }} onSave={handleUpdateFactura} title="Editar Factura" fields={editFields} />
      )}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-white">Gestión: Municipalidad</h1>
        <button onClick={() => setShowTarifasModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">Editar Tarifa</button>
      </div>
      <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700 mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Registrar Nueva Factura Pendiente</h2>
        <form onSubmit={handleAddFactura} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div><label htmlFor="periodo" className="block text-sm font-medium text-zinc-300 mb-1">Período</label><input type="text" id="periodo" name="periodo" required className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" placeholder="Ej: Agosto 2025" /></div>
          <div><label htmlFor="fechaEmision" className="block text-sm font-medium text-zinc-300 mb-1">Fecha Emisión</label><input type="date" id="fechaEmision" name="fechaEmision" defaultValue={new Date().toISOString().split('T')[0]} required className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" /></div>
          <div><label htmlFor="nroFactura" className="block text-sm font-medium text-zinc-300 mb-1">Nº de Factura</label><input type="text" id="nroFactura" name="nroFactura" required className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white" placeholder="0001-00012345" /></div>
          <button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg h-10">Registrar</button>
        </form>
      </div>
      <div className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
        <table className="w-full text-sm text-left text-zinc-400">
          <thead className="text-xs text-zinc-300 uppercase bg-zinc-700">
            <tr><th className="p-3">Período</th><th className="p-3">Fecha Emisión</th><th className="p-3">Nº Factura</th><th className="p-3">Fecha Vencimiento</th><th className="p-3 text-right">Importe</th><th className="p-3 text-center">Estado</th><th className="p-3 text-center">Acciones</th></tr>
          </thead>
          <tbody>
            {loading ? ( <tr><td colSpan="7" className="text-center py-8 text-zinc-500">Cargando...</td></tr> ) : 
             facturasPendientes.length === 0 ? ( <tr><td colSpan="7" className="text-center py-8 text-zinc-500">No hay facturas pendientes.</td></tr> ) : 
             (facturasPendientes.map(factura => (
                <tr key={factura.id} className="border-b border-zinc-700 hover:bg-zinc-700/50">
                  <td className="p-3 font-medium text-white">{factura.periodo}</td><td className="p-3">{factura.fechaEmisionObj.toLocaleDateString('es-AR')}</td><td className="p-3">{factura.nroFactura}</td><td className="p-3">{factura.fechaVencimientoObj ? factura.fechaVencimientoObj.toLocaleDateString('es-AR') : 'N/A'}</td><td className="p-3 text-right font-mono">{currencyFormatter.format(factura.monto)}</td><td className="p-3 text-center"><button onClick={() => handleMarkAsPaid(factura)} className="px-3 py-1 text-xs font-bold rounded-full bg-yellow-500/20 text-yellow-300 hover:bg-green-500/20 hover:text-green-300 transition-colors">Marcar como Pagada</button></td><td className="p-3 text-center"><button onClick={() => { setCurrentFactura(factura); setShowEditModal(true); }} className="text-blue-400 hover:text-blue-300 p-1 rounded-full mr-2">✏️</button><button onClick={() => handleDeleteFactura(factura)} className="text-red-500 hover:text-red-400 p-1 rounded-full">🗑️</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Facturas Cobradas en {selectedDate.toLocaleString('es-AR', { month: 'long' })}</h2>
        <div className="bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
            <table className="w-full text-sm text-left text-zinc-400">
                <thead className="text-xs text-zinc-300 uppercase bg-zinc-700">
                    <tr><th className="p-3">Período</th><th className="p-3">Fecha Cobro</th><th className="p-3">Nº Factura</th><th className="p-3 text-right">Importe</th><th className="p-3 text-center">Acciones</th></tr>
                </thead>
                <tbody>
                    {facturasCobradas.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-8 text-zinc-500">No hay facturas cobradas este mes.</td></tr>
                    ) : (
                        facturasCobradas.map(factura => (
                            <tr key={factura.id} className="border-b border-zinc-700">
                                <td className="p-3 font-medium text-white">{factura.periodo}</td><td className="p-3">{factura.fechaCobro.toDate().toLocaleDateString('es-AR')}</td><td className="p-3">{factura.nroFactura}</td><td className="p-3 text-right font-mono text-green-400">{currencyFormatter.format(factura.monto)}</td><td className="p-3 text-center"><button onClick={() => handleUndoCobro(factura)} className="text-yellow-400 hover:text-yellow-300 p-1 rounded-full">↩️</button></td>
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