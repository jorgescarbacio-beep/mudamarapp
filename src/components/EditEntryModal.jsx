import React, { useState, useEffect } from 'react';

function EditEntryModal({ show, onClose, entry, onSave, fields, title }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (entry) {
      setFormData(entry);
    } else {
      // Initialize with default values
      const defaultData = {};
      fields.forEach(field => {
        defaultData[field.key] = field.type === 'number' ? 0 : '';
      });
      setFormData(defaultData);
    }
  }, [entry, fields]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
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
                type={field.type || 'text'}
                value={formData[field.key] || ''}
                onChange={(e) => handleChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                readOnly={field.readOnly}
                className="form-input w-full rounded-lg bg-zinc-700 border-zinc-600 text-white"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg"
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

export default EditEntryModal;