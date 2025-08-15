import React from 'react';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export default function InicioPage({ balanceData }) {
  return (
    <div className="p-8 flex-1">
      <h1 className="text-4xl font-bold mb-4">Bienvenido a la Gestión Mudamar</h1>
      <p className="text-zinc-400 text-lg mb-8">Selecciona una opción del menú de la izquierda para empezar.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700">
          <h3 className="text-zinc-400 text-sm font-medium">Total Facturado (Mes)</h3>
          <p className="text-3xl font-bold text-green-400 mt-2">
            {currencyFormatter.format(balanceData.totalIngresos || 0)}
          </p>
        </div>
        <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700">
          <h3 className="text-zinc-400 text-sm font-medium">Total Gastos (Mes)</h3>
          <p className="text-3xl font-bold text-red-400 mt-2">
            {currencyFormatter.format(balanceData.totalGastos || 0)}
          </p>
        </div>
        <div className="bg-zinc-800 p-6 rounded-xl border border-zinc-700">
          <h3 className="text-zinc-400 text-sm font-medium">Balance</h3>
          <p className="text-3xl font-bold mt-2">
            {currencyFormatter.format(balanceData.balance || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
