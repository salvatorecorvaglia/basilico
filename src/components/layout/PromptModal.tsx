import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../store/ui-store';
import './PromptModal.css';

export function PromptModal() {
  const { promptOptions, closePrompt } = useUIStore();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (promptOptions) {
      // Initialize form values from fields default values
      const initial: Record<string, string> = {};
      promptOptions.fields.forEach((field) => {
        initial[field.name] = field.defaultValue ?? '';
      });
      setFormValues(initial);

      // Focus the first input field
      const firstField = promptOptions.fields[0];
      if (firstField) {
        setTimeout(() => {
          const el = inputRefs.current[firstField.name];
          if (el) el.focus();
        }, 50);
      }
    } else {
      setFormValues({});
    }
  }, [promptOptions]);

  // Handle escape key to cancel prompt
  useEffect(() => {
    if (!promptOptions) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promptOptions]);

  if (!promptOptions) return null;

  const handleValueChange = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleCancel = () => {
    if (promptOptions.onCancel) {
      promptOptions.onCancel();
    }
    closePrompt();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    let valid = true;
    promptOptions.fields.forEach((field) => {
      if (field.required && !formValues[field.name]?.trim()) {
        valid = false;
      }
    });

    if (valid) {
      promptOptions.onSubmit(formValues);
      closePrompt();
    }
  };

  // Check if form is valid to submit
  const isFormValid = promptOptions.fields.every((field) => {
    if (!field.required) return true;
    return !!formValues[field.name]?.trim();
  });

  return (
    <div className="prompt-overlay animate-fade-in" onClick={handleCancel}>
      <div className="prompt-modal animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="prompt-header">
          <h3>{promptOptions.title}</h3>
          <button className="prompt-close-btn" onClick={handleCancel}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Body */}
          <div className="prompt-body">
            {promptOptions.description && (
              <p className="prompt-desc">{promptOptions.description}</p>
            )}

            <div className="prompt-fields">
              {promptOptions.fields.map((field) => (
                <div key={field.name} className="prompt-field-group">
                  <label htmlFor={`prompt-field-${field.name}`}>
                    {field.label}
                    {field.required && <span className="required-star"> *</span>}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea
                      id={`prompt-field-${field.name}`}
                      ref={(el) => { inputRefs.current[field.name] = el; }}
                      className="prompt-textarea"
                      placeholder={field.placeholder}
                      value={formValues[field.name] ?? ''}
                      onChange={(e) => handleValueChange(field.name, e.target.value)}
                      rows={4}
                      required={field.required}
                    />
                  ) : (
                    <input
                      type="text"
                      id={`prompt-field-${field.name}`}
                      ref={(el) => { inputRefs.current[field.name] = el; }}
                      className="prompt-input"
                      placeholder={field.placeholder}
                      value={formValues[field.name] ?? ''}
                      onChange={(e) => handleValueChange(field.name, e.target.value)}
                      required={field.required}
                      autoComplete="off"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="prompt-footer">
            <button
              type="button"
              className="prompt-btn prompt-btn-outline"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="prompt-btn prompt-btn-primary"
              disabled={!isFormValid}
            >
              {promptOptions.submitLabel ?? 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
