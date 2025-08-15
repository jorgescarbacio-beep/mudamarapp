import React, { useState, useEffect } from 'react';
import { db } from '../utils/firebase';
import { collection, query, where, getDocs, Timestamp, doc } from 'firebase/firestore';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// ========================================================================
// LISTA COMPLETA DE FUENTES DE INGRESOS Y EGRESOS
// ========================================================================
const incomeSources = [
  { collection: 'viajes_mudamar', name: 'Mc Donalds (Mudamar) - Pendiente', amountField: 'amount', dateField: 'date' },
  { collection: 'viajes_scarbacio', name: 'Mc Donalds (Scarbacio) - Pendiente', amountField: 'amount', dateField: 'date' },
  { collection: 'viajes_mostaza_cc', name: 'Mostaza CC - Pendiente', amountField: 'amount', dateField: 'date' },
  { collection: 'viajes_mostaza_fc', name: 'Mostaza FC - Pendiente', amountField: 'amount', dateField: 'date' },
  { collection: 'viajes_burgerking', name: 'Burger King - Pendiente', amountField: 'amount', dateField: 'date' },
  { collection: 'viajes_baum', name: 'Baum - Pendiente', amountField: 'amount', dateField: 'date' },
  { collection: 'mudanzas', name: 'Mudanzas (Cobrado)', amountField: 'cobrado', dateField: 'fecha' },
  // **INICIO DE LA CORRECCIÓN: AHORA LEE DE LA NUEVA COLECCIÓN**
  { collection: 'facturas_cobradas_muni', name: 'Municipalidad (Cobrado)', amountField: 'monto', dateField: 'fechaCobro' },
];

const weeklyIncomeSources = [
    { clientKey: 'chipa', name: 'Chipa de la Tia', tarifaKey: 'chipaTarifaSemanal' },
    { clientKey: 'pet_shop', name: 'Pet Shop', tarifaKey: 'pet_shopTarifaViaje' },
    { clientKey: 'hanna', name: 'Hanna', tarifaKey: 'hannaTarifaViaje' },
    { clientKey: 'folc', name: 'Folc', special: 'folc' },
];

const vehicleExpenseSources = [
    { id: 'MITSUBISHI_AA015KL', nombre: 'Mitsubishi AA015KL' },
    { id: 'PARTNER_IBV358', nombre: 'Partner IBV358' },
    { id: 'KANGOO_AA057GK', nombre: 'Kangoo AA057GK' },
    { id: 'KANGOO_AA702HA', nombre: 'Kangoo AA702HA' },
];

function SaldosPage({ tarifas }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [totals, setTotals] = useState({ totalIngresos: 0, totalEgresos: 0, incomeDetails: {}, expenseDetails: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calculateTotals = async () => {
      setLoading(true);
      const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      
      let incomeDetails = {};
      let expenseDetails = {};
      let totalIngresos = 0;
      let totalEgresos = 0;

      // --- CÁLCULO DE INGRESOS ---
      // **LÓGICA SIMPLIFICADA Y CORREGIDA**
      for (const source of incomeSources) {
        const q = query(
          collection(db, source.collection),
          where(source.dateField, ">=", Timestamp.fromDate(startDate)),
          where(source.dateField, "<=", Timestamp.fromDate(endDate))
        );
        const querySnapshot = await getDocs(q);
        const sum = querySnapshot.docs.reduce((acc, doc) => acc + (doc.data()[source.amountField] || 0), 0);
        if (sum > 0) incomeDetails[source.name] = sum;
        totalIngresos += sum;
      }
      
      const remitosQuery = query(collection(db, 'remitos_archivados'), where("fechaArchivado", ">=", Timestamp.fromDate(startDate)), where("fechaArchivado", "<=", Timestamp.fromDate(endDate)));
      const remitosSnapshot = await getDocs(remitosQuery);
      const remitosTotal = remitosSnapshot.docs.reduce((acc, doc) => acc + (doc.data().total || 0), 0);
      if (remitosTotal > 0) {
        incomeDetails['Remitos Archivados'] = remitosTotal;
      }
      totalIngresos += remitosTotal;

      const monthYearIdPart = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
      for (const source of weeklyIncomeSources) {
          const docId = `${source.clientKey}-${monthYearIdPart}`;
          const docSnap = await getDocs(collection(db, "facturacion_mensual"));
          const docData = docSnap.docs.find(d => d.id === docId)?.data();
          if (docData) {
              let sum = 0;
              if (source.special === 'folc') {
                  sum = Object.values(docData).reduce((acc, day) => {
                      if (day.viajePrincipal) acc += tarifas.folcViajePrincipal || 0;
                      if (day.viajeMoreno) acc += tarifas.folcViajeMoreno || 0;
                      return acc;
                  }, 0);
              } else {
                  const tarifa = tarifas[source.tarifaKey] || 0;
                  sum = Object.values(docData).filter(Boolean).length * tarifa;
              }
              if (sum > 0) incomeDetails[source.name] = sum;
              totalIngresos += sum;
          }
      }

      // --- CÁLCULO DE EGRESOS ---
      for (const vehiculo of vehicleExpenseSources) {
          const key = `Gastos ${vehiculo.nombre}`;
          let totalVehiculo = 0;
          for (const tipoGasto of ['combustible', 'reparaciones', 'seguros']) {
              const q = query(collection(db, `vehiculos/${vehiculo.id}/${tipoGasto}`), where("date", ">=", Timestamp.fromDate(startDate)), where("date", "<=", Timestamp.fromDate(endDate)));
              const querySnapshot = await getDocs(q);
              const sum = querySnapshot.docs.reduce((acc, doc) => acc + doc.data().importe, 0);
              totalVehiculo += sum;
          }
          if (totalVehiculo > 0) expenseDetails[key] = totalVehiculo;
          totalEgresos += totalVehiculo;
      }
      
      const sueldosMonthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
      const sueldosSnap = await getDocs(collection(db, "sueldos_mensual"));
      let sueldosTotalMes = 0;
      const sueldosDoc = sueldosSnap.docs.find(d => d.id === sueldosMonthKey);
      if (sueldosDoc && sueldosDoc.exists()) {
          const data = sueldosDoc.data();
          const { sueldoGuillermoSemanal = 0, sueldoFabianSemanal = 0, sueldoDiegoMensual = 0 } = tarifas;
          if (data.guillermo) sueldosTotalMes += Object.values(data.guillermo).filter(Boolean).length * sueldoGuillermoSemanal;
          if (data.fabian) sueldosTotalMes += Object.values(data.fabian).filter(Boolean).length * sueldoFabianSemanal;
          if (data.diego && data.diego.mes) sueldosTotalMes += sueldoDiegoMensual;
      }
      if (sueldosTotalMes > 0) {
          expenseDetails['Sueldos'] = sueldosTotalMes;
          totalEgresos += sueldosTotalMes;
      }

      const qMudanzas = query(collection(db, 'mudanzas'), where("fecha", ">=", Timestamp.fromDate(startDate)), where("fecha", "<=", Timestamp.fromDate(endDate)));
      const mudanzasSnapshot = await getDocs(qMudanzas);
      const mudanzasPagado = mudanzasSnapshot.docs.reduce((acc, doc) => acc + (doc.data().pagado || 0), 0);
      if (mudanzasPagado > 0) {
        expenseDetails['Mudanzas (Pagado)'] = mudanzasPagado;
        totalEgresos += mudanzasPagado;
      }

      setTotals({ totalIngresos, totalEgresos, incomeDetails, expenseDetails });
      setLoading(false);
    };

    if(Object.keys(tarifas).length > 0) {
        calculateTotals();
    }
  }, [selectedDate, tarifas]);

  const balance = (totals.totalIngresos || 0) - (totals.totalEgresos || 0);

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-6">Balance del Mes</h1>
      
      <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedDate(d => new Date(d.setMonth(d.getMonth() - 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">‹</button>
            <h2 className="text-2xl font-semibold text-white capitalize">{selectedDate.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}</h2>
            <button onClick={() => setSelectedDate(d => new Date(d.setMonth(d.getMonth() + 1)))} className="px-3 py-1 bg-zinc-700 rounded-md hover:bg-orange-600">›</button>
          </div>
        </div>

        {loading ? (
            <p className="text-center text-zinc-400 py-10">Calculando balance...</p>
        ) : (
            <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-700"><h3 className="text-zinc-400 text-sm font-medium">Total Ingresos</h3><p className="text-3xl font-bold text-green-400 mt-2">{currencyFormatter.format(totals.totalIngresos)}</p></div>
                    <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-700"><h3 className="text-zinc-400 text-sm font-medium">Total Egresos</h3><p className="text-3xl font-bold text-red-400 mt-2">{currencyFormatter.format(totals.totalEgresos)}</p></div>
                    <div className="bg-zinc-900 p-6 rounded-xl border border-zinc-700"><h3 className="text-zinc-400 text-sm font-medium">Balance</h3><p className={`text-3xl font-bold mt-2 ${balance >= 0 ? 'text-white' : 'text-red-400'}`}>{currencyFormatter.format(balance)}</p></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h3 className="text-xl font-semibold mb-4 text-white">Detalle de Ingresos</h3>
                        <div className="space-y-2">{Object.keys(totals.incomeDetails || {}).length > 0 ? Object.keys(totals.incomeDetails).map(key => (<div key={key} className="flex justify-between p-3 bg-zinc-700/50 rounded-md"><span>{key}</span><span className="font-mono">{currencyFormatter.format(totals.incomeDetails[key])}</span></div>)) : <p className="text-zinc-500">No hay ingresos registrados este mes.</p>}</div>
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold mb-4 text-white">Detalle de Egresos</h3>
                        <div className="space-y-2">{Object.keys(totals.expenseDetails || {}).length > 0 ? Object.keys(totals.expenseDetails).map(key => (<div key={key} className="flex justify-between p-3 bg-zinc-700/50 rounded-md"><span>{key}</span><span className="font-mono">{currencyFormatter.format(totals.expenseDetails[key])}</span></div>)) : <p className="text-zinc-500">No hay egresos registrados este mes.</p>}</div>
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
}

export default SaldosPage;
