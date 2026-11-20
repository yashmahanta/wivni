import React from 'react';
import type { ModelAvailability, ModelChoice } from '../types';
import { MODEL_CHOICES, MODEL_LABELS } from '../models';

interface ModelSelectorProps {
  selected: ModelChoice;
  onChange: (model: ModelChoice) => void;
  availability: Partial<Record<ModelChoice, ModelAvailability>>;
  checking: boolean;
  disabled?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selected, onChange, availability, checking, disabled }) => (
  <div className="space-y-3">
    <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wider">
      AI Routing
    </label>
    <div className="grid grid-cols-1 gap-2">
      {MODEL_CHOICES.map(model => (
        <button
          key={model}
          type="button"
          disabled={disabled}
          aria-pressed={selected === model}
          onClick={() => onChange(model)}
          className={`py-3 px-2 rounded-lg font-bold transition-all duration-200 border-2 text-xs
            ${selected === model
              ? 'bg-amber-500 border-amber-500 text-slate-900 shadow-md'
              : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {MODEL_LABELS[model]}
        </button>
      ))}
    </div>
    <p className="text-[10px] text-slate-500 italic" aria-live="polite">
      {checking ? 'Checking available models on your gateway...' :
        availability[selected] === 'available' ? 'The website-failover combo is listed by your gateway.' :
        availability[selected] === 'not-listed' ? 'The website-failover combo is not listed by the gateway. Check API-key access and combo activation.' :
        'Gateway availability not verified yet. The failover combo will be checked when generating.'}
    </p>
  </div>
);

export default ModelSelector;
