import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "../../store/ui-store";
import "./PromptModal.css";

export function PromptModal() {
  const { promptOptions, closePrompt } = useUIStore();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const inputRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({});

  const handleValueChange = useCallback((name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleCancel = useCallback(() => {
    if (promptOptions?.onCancel) {
      promptOptions.onCancel();
    }
    closePrompt();
  }, [promptOptions, closePrompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptOptions) return;

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
  const isFormValid =
    promptOptions?.fields.every((field) => {
      if (!field.required) return true;
      return !!formValues[field.name]?.trim();
    }) ?? false;

  useEffect(() => {
    if (promptOptions) {
      // Initialize form values from fields default values
      const initial: Record<string, string> = {};
      promptOptions.fields.forEach((field) => {
        initial[field.name] = field.defaultValue ?? "";
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

  const isOpen = !!promptOptions;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="prompt-overlay" />
        <Dialog.Content className="prompt-modal">
          {promptOptions && (
            <form onSubmit={handleSubmit}>
              {/* Header */}
              <div className="prompt-header">
                <Dialog.Title asChild>
                  <h3>{promptOptions.title}</h3>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    className="prompt-close-btn"
                    aria-label="Close dialog"
                  >
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>

              {/* Body */}
              <div className="prompt-body">
                {promptOptions.description && (
                  <Dialog.Description asChild>
                    <p className="prompt-desc">{promptOptions.description}</p>
                  </Dialog.Description>
                )}

                <div className="prompt-fields">
                  {promptOptions.fields.map((field) => (
                    <div key={field.name} className="prompt-field-group">
                      <label htmlFor={`prompt-field-${field.name}`}>
                        {field.label}
                        {field.required && (
                          <span className="required-star"> *</span>
                        )}
                      </label>

                      {field.type === "textarea" ? (
                        <textarea
                          id={`prompt-field-${field.name}`}
                          ref={(el) => {
                            inputRefs.current[field.name] = el;
                          }}
                          className="prompt-textarea"
                          placeholder={field.placeholder}
                          value={formValues[field.name] ?? ""}
                          onChange={(e) =>
                            handleValueChange(field.name, e.target.value)
                          }
                          rows={4}
                          required={field.required}
                        />
                      ) : field.type === "checkbox" ? (
                        <div className="prompt-checkbox-wrapper">
                          <input
                            type="checkbox"
                            id={`prompt-field-${field.name}`}
                            ref={(el) => {
                              inputRefs.current[field.name] =
                                el as unknown as HTMLInputElement;
                            }}
                            className="prompt-checkbox"
                            checked={formValues[field.name] === "true"}
                            onChange={(e) =>
                              handleValueChange(
                                field.name,
                                e.target.checked ? "true" : "false",
                              )
                            }
                          />
                          <label
                            htmlFor={`prompt-field-${field.name}`}
                            className="prompt-checkbox-label"
                          >
                            {field.placeholder}
                          </label>
                        </div>
                      ) : (
                        <input
                          type="text"
                          id={`prompt-field-${field.name}`}
                          ref={(el) => {
                            inputRefs.current[field.name] = el;
                          }}
                          className="prompt-input"
                          placeholder={field.placeholder}
                          value={formValues[field.name] ?? ""}
                          onChange={(e) =>
                            handleValueChange(field.name, e.target.value)
                          }
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
                  {promptOptions.submitLabel ?? "Submit"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
