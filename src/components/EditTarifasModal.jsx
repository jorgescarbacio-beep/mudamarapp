import React, { useState, useEffect } from 'react';

function EditTarifasModal({ show, onClose, tarifas, onSave, title, fields }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (tarifas && fields) {
      const initialData = {};
      fields.forEach(field => {
        initialData[field.key] = tarifas[field.key] || 0;
      });
      setFormData(initialData);
    }
  }, [tarifas, fields]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: Number(value) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-zinc-800 p-6 rounded-lg border border-zinc-700 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(field => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                {field.label}
              </label>
              <input
                type="number"
                value={formData[field.key] || 0}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-zinc-600 hover:bg-zinc-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditTarifasModal;