import { useState, useRef } from 'react';

export type CardFieldType =
  | 'input-text'
  | 'input-tel'
  | 'input-email'
  | 'input-number'
  | 'input-date'
  | 'input-radio'
  | 'input-choice'
  | 'input-checklist'
  | 'input-toggle'
  | 'input-tagselect';

export interface CardElementDef {
  id: string;
  type: CardFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  allowCustom?: boolean;
  customPlaceholder?: string;
  choices?: Array<{ title: string; value: string }>;
}

export interface CardFormData {
  title: string;
  desc: string;
  submitText: string;
  fields: CardElementDef[];
}

export interface AdaptiveCardFormEditorProps {
  nodeId: string;
  nodeTitle?: string;
  initialFieldsJson?: string;
  onChange?: (fieldsJson: string) => void;
  onSave?: (fieldsJson: string) => void;
  isEmbedded?: boolean;
}

export const INSURANCE_PRESETS: Record<string, CardFormData> = {
  'contact-info': {
    title: '📇 Contact Information',
    desc: 'Please provide your contact details so our insurance agent can prepare your personalized quote.',
    submitText: '✅ Submit Information',
    fields: [
      { id: 'full_name', type: 'input-text', label: 'Full Name', placeholder: 'Enter your full name', required: true },
      { id: 'phone_number', type: 'input-tel', label: 'Phone Number', placeholder: '(555) 019-2834', required: true },
      { id: 'email_address', type: 'input-email', label: 'Email Address', placeholder: 'name@example.com', required: false },
      { id: 'date_of_birth', type: 'input-date', label: 'Date of Birth', placeholder: 'YYYY-MM-DD', required: true },
      { id: 'street_address', type: 'input-text', label: 'Street Address', placeholder: '123 Main St', required: true },
      { id: 'city', type: 'input-text', label: 'City', placeholder: 'Denver', required: true },
      { id: 'state', type: 'input-text', label: 'State', placeholder: 'CO', required: true },
      { id: 'zip_code', type: 'input-text', label: 'ZIP Code', placeholder: '80202', required: true },
      { id: 'consent_contact', type: 'input-toggle', label: 'I consent to receive quotes via phone/email', required: true },
    ],
  },
  'coverage-intent': {
    title: '🎯 Coverage Intent',
    desc: 'Select the insurance coverage type and budget that suits your needs.',
    submitText: '➡️ Next Step',
    fields: [
      {
        id: 'coverage_type',
        type: 'input-tagselect',
        label: 'What type of coverage are you interested in?',
        required: true,
        choices: [
          { title: 'Term Life', value: 'term_life' },
          { title: 'Whole Life', value: 'whole_life' },
          { title: 'Universal Life', value: 'universal_life' },
          { title: 'Final Expense', value: 'final_expense' },
        ],
      },
      {
        id: 'coverage_amount',
        type: 'input-tagselect',
        label: 'Target Coverage Amount',
        required: true,
        choices: [
          { title: '$100,000', value: '100k' },
          { title: '$250,000', value: '250k' },
          { title: '$500,000', value: '500k' },
          { title: '$1,000,000+', value: '1m_plus' },
        ],
      },
      {
        id: 'monthly_budget',
        type: 'input-tagselect',
        label: 'Estimated Monthly Budget',
        required: false,
        choices: [
          { title: '< $50/mo', value: 'under_50' },
          { title: '$50 - $100/mo', value: '50_to_100' },
          { title: '$100 - $200/mo', value: '100_to_200' },
          { title: '$200+/mo', value: '200_plus' },
        ],
      },
      {
        id: 'timeframe',
        type: 'input-tagselect',
        label: 'When do you need coverage active?',
        required: false,
        choices: [
          { title: 'Immediately', value: 'immediately' },
          { title: 'Within 30 Days', value: 'within_30' },
          { title: 'Just Researching', value: 'researching' },
        ],
      },
    ],
  },
  'health-info': {
    title: '🏥 Health & Lifestyle Information',
    desc: 'Underwriting health assessment for life and disability policies.',
    submitText: 'Continue Assessment ➡️',
    fields: [
      {
        id: 'nicotine_use',
        type: 'input-radio',
        label: 'Have you used tobacco or nicotine products in the last 36 months?',
        required: true,
        choices: [
          { title: 'No, Never', value: 'never' },
          { title: 'Past user (>12 months quit)', value: 'quit' },
          { title: 'Active cigarette smoker', value: 'cigarettes' },
          { title: 'Vape / Cigars / Chewing tobacco', value: 'other_tobacco' },
        ],
      },
      {
        id: 'health_conditions',
        type: 'input-checklist',
        label: 'Check any diagnosed medical conditions (select all that apply):',
        required: false,
        choices: [
          { title: 'High Blood Pressure (Hypertension)', value: 'hypertension' },
          { title: 'High Cholesterol', value: 'cholesterol' },
          { title: 'Type 1 or Type 2 Diabetes', value: 'diabetes' },
          { title: 'Heart Disease or Stroke', value: 'cardiovascular' },
          { title: 'Cancer or Malignancy', value: 'cancer' },
          { title: 'Asthma or Respiratory Conditions', value: 'respiratory' },
          { title: 'None of the above', value: 'none' },
        ],
      },
      { id: 'height_inches', type: 'input-number', label: 'Height (inches)', placeholder: '70', min: 36, max: 96, required: true },
      { id: 'weight_lbs', type: 'input-number', label: 'Weight (lbs)', placeholder: '175', min: 50, max: 500, required: true },
      {
        id: 'family_history',
        type: 'input-choice',
        label: 'Family history of cardiovascular disease before age 60?',
        required: true,
        choices: [
          { title: 'No family history', value: 'none' },
          { title: 'One parent or sibling', value: 'one_relative' },
          { title: 'Multiple immediate relatives', value: 'multiple_relatives' },
        ],
      },
    ],
  },
  'employment': {
    title: '💼 Employment & Financial Profile',
    desc: 'Verify eligibility and calculate income replacement guidelines.',
    submitText: 'Save Financial Profile',
    fields: [
      {
        id: 'employment_status',
        type: 'input-tagselect',
        label: 'Current Employment Status',
        required: true,
        choices: [
          { title: 'Employed Full-Time', value: 'employed_ft' },
          { title: 'Employed Part-Time', value: 'employed_pt' },
          { title: 'Self-Employed / Business Owner', value: 'self_employed' },
          { title: 'Retired', value: 'retired' },
          { title: 'Homemaker / Student', value: 'homemaker' },
        ],
      },
      { id: 'occupation_title', type: 'input-text', label: 'Job Title / Occupation', placeholder: 'e.g. Software Engineer', required: true },
      { id: 'annual_income', type: 'input-number', label: 'Annual Household Income ($USD)', placeholder: '85000', min: 0, required: true },
      { id: 'household_dependents', type: 'input-number', label: 'Number of Financial Dependents', placeholder: '2', min: 0, max: 20, required: true },
    ],
  },
  'radio-demo': {
    title: '📻 Radio Button Validation Demo',
    desc: 'Reference card showcasing required single-select radio button choices with validation.',
    submitText: 'Submit Answer',
    fields: [
      {
        id: 'has_existing_insurance',
        type: 'input-radio',
        label: 'Do you currently have insurance?',
        required: true,
        choices: [
          { title: 'Yes, I have insurance', value: 'yes' },
          { title: 'No, I do not have insurance', value: 'no' },
        ],
      },
      {
        id: 'preferred_contact_method',
        type: 'input-radio',
        label: 'Preferred Contact Method',
        required: true,
        choices: [
          { title: 'Telephone Call', value: 'phone' },
          { title: 'SMS Text Message', value: 'sms' },
          { title: 'Email Notification', value: 'email' },
        ],
      },
    ],
  },
  'ccpa': {
    title: '🔒 California Privacy (CCPA) Notice',
    desc: 'Mandatory California Consumer Privacy Act disclosure acknowledgment.',
    submitText: 'Acknowledge & Proceed',
    fields: [
      {
        id: 'california_resident',
        type: 'input-radio',
        label: 'Are you a resident of the State of California?',
        required: true,
        choices: [
          { title: 'Yes, I reside in California', value: 'yes' },
          { title: 'No, I reside outside California', value: 'no' },
        ],
      },
      {
        id: 'do_not_sell_info',
        type: 'input-choice',
        label: 'Personal Information Sharing Preference',
        required: true,
        choices: [
          { title: 'Standard Service Sharing', value: 'standard' },
          { title: 'Do Not Sell My Personal Information', value: 'do_not_sell' },
          { title: 'Limit Use of Sensitive Personal Data', value: 'limit_sensitive' },
        ],
      },
      { id: 'ccpa_authorized_rep', type: 'input-text', label: 'Authorized Representative Name (if applicable)', placeholder: 'Leave blank if self', required: false },
    ],
  },
  'beneficiary': {
    title: '👤 Beneficiary Information',
    desc: 'Designate the primary beneficiary for policy distributions.',
    submitText: 'Save Beneficiary Details',
    fields: [
      { id: 'beneficiary_name', type: 'input-text', label: 'Primary Beneficiary Full Name', placeholder: 'Jane Doe', required: true },
      {
        id: 'beneficiary_relationship',
        type: 'input-choice',
        label: 'Relationship to Insured',
        required: true,
        choices: [
          { title: 'Spouse', value: 'spouse' },
          { title: 'Child', value: 'child' },
          { title: 'Parent', value: 'parent' },
          { title: 'Sibling', value: 'sibling' },
          { title: 'Trust / Estate', value: 'trust' },
          { title: 'Other', value: 'other' },
        ],
      },
      { id: 'beneficiary_dob', type: 'input-date', label: "Beneficiary's Date of Birth", placeholder: 'YYYY-MM-DD', required: true },
      { id: 'beneficiary_percentage', type: 'input-number', label: 'Beneficiary Percentage (%)', placeholder: '100', min: 1, max: 100, required: true },
    ],
  },
};

export function toPascalCase(str: string): string {
  return (
    str
      .replace(/[^a-zA-Z0-9_]/g, ' ')
      .split(/[\s_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('') || 'Property'
  );
}

export function getCSharpType(type: CardFieldType): string {
  switch (type) {
    case 'input-checklist':
      return 'List<string>?';
    case 'input-number':
      return 'int?';
    case 'input-date':
      return 'DateTime?';
    case 'input-toggle':
      return 'bool?';
    default:
      return 'string?';
  }
}

export function deduceCSharpModel(nodeId: string, fields: CardElementDef[]): string {
  const props = fields
    .map((el) => {
      const propName = toPascalCase(el.id);
      const propType = getCSharpType(el.type);
      const lines: string[] = [];
      if (el.required) {
        lines.push(`    [Required(ErrorMessage = "${el.label.replace(/"/g, '')} is required.")]`);
      }
      lines.push(`    [JsonPropertyName("${el.id}")]`);
      lines.push(`    public ${propType} ${propName} { get; set; }\n`);
      return lines.join('\n');
    })
    .join('\n');

  return `/// <summary>
/// Automatically deduced form model from your card canvas!
/// Inherits from BaseCardModel for auto-synchronization with TopicWorkflowContext.
/// </summary>
public class ${toPascalCase(nodeId)}Model : BaseCardModel
{
${props || '    // Tap "+ Add Question" on the form canvas to add fields\n'}
}`;
}

export function generateAdaptiveCardJson(formData: CardFormData): string {
  const bodyElements: Array<Record<string, unknown>> = [];
  if (formData.title) {
    bodyElements.push({ type: 'TextBlock', text: formData.title, weight: 'Bolder', size: 'Medium', wrap: true });
  }
  if (formData.desc) {
    bodyElements.push({ type: 'TextBlock', text: formData.desc, wrap: true, isSubtle: true });
  }

  formData.fields.forEach((f) => {
    if (f.type === 'input-radio') {
      bodyElements.push({
        type: 'Input.ChoiceSet',
        id: f.id,
        label: f.label,
        style: 'expanded',
        isMultiSelect: false,
        isRequired: f.required,
        choices: f.choices || [],
      });
    } else if (f.type === 'input-checklist') {
      bodyElements.push({
        type: 'Input.ChoiceSet',
        id: f.id,
        label: f.label,
        style: 'expanded',
        isMultiSelect: true,
        isRequired: f.required,
        choices: f.choices || [],
      });
    } else if (f.type === 'input-choice') {
      bodyElements.push({
        type: 'Input.ChoiceSet',
        id: f.id,
        label: f.label,
        style: 'compact',
        isRequired: f.required,
        choices: f.choices || [],
      });
    } else if (f.type === 'input-tagselect') {
      bodyElements.push({
        type: 'Input.TagSelect',
        id: f.id,
        label: f.label,
        choices: f.choices || [],
        allowCustom: f.allowCustom ?? false,
        customPlaceholder: f.customPlaceholder || undefined,
        isRequired: f.required,
      });
    } else if (f.type === 'input-toggle') {
      bodyElements.push({
        type: 'Input.Toggle',
        id: f.id,
        title: f.label,
        isRequired: f.required,
        valueOn: 'true',
        valueOff: 'false',
      });
    } else if (f.type === 'input-number') {
      bodyElements.push({
        type: 'Input.Number',
        id: f.id,
        label: f.label,
        placeholder: f.placeholder,
        min: f.min,
        max: f.max,
        isRequired: f.required,
      });
    } else if (f.type === 'input-date') {
      bodyElements.push({
        type: 'Input.Date',
        id: f.id,
        label: f.label,
        placeholder: f.placeholder,
        isRequired: f.required,
      });
    } else {
      bodyElements.push({
        type: 'Input.Text',
        id: f.id,
        label: f.label,
        placeholder: f.placeholder,
        style: f.type === 'input-tel' ? 'Tel' : f.type === 'input-email' ? 'Email' : undefined,
        isRequired: f.required,
      });
    }
  });

  const cardJson = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: bodyElements,
    actions: [{ type: 'Action.Submit', title: formData.submitText || 'Submit', style: 'positive' }],
  };

  return JSON.stringify(cardJson, null, 2);
}

export function AdaptiveCardFormEditor({
  nodeId: _nodeId,
  nodeTitle = 'User Form',
  initialFieldsJson,
  onChange,
  onSave,
  isEmbedded: _isEmbedded = true,
}: AdaptiveCardFormEditorProps) {
  const [formData, setFormData] = useState<CardFormData>(() => {
    if (initialFieldsJson) {
      try {
        const parsed = JSON.parse(initialFieldsJson);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.fields)) {
          return parsed as CardFormData;
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          return {
            title: nodeTitle || 'User Form',
            desc: '',
            submitText: 'Submit',
            fields: parsed,
          };
        }
      } catch {
        /* fallback */
      }
    }
    return {
      title: nodeTitle || 'User Form',
      desc: '',
      submitText: 'Submit',
      fields: [],
    };
  });

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [previewSubmitted, setPreviewSubmitted] = useState<Record<string, any> | null>(null);

  const prevSerializedRef = useRef<string>('');

  const updateFormData = (updater: (prev: CardFormData) => CardFormData) => {
    setFormData((prev) => {
      const next = updater(prev);
      const serialized = JSON.stringify(next, null, 2);
      if (serialized !== prevSerializedRef.current) {
        prevSerializedRef.current = serialized;
        onChange?.(serialized);
        onSave?.(serialized);
      }
      return next;
    });
  };

  const startBlankCard = () => {
    updateFormData(() => ({
      title: nodeTitle || 'User Form',
      desc: '',
      submitText: 'Submit',
      fields: [],
    }));
    setShowPresetsMenu(false);
    setShowAddMenu(true);
  };

  const loadPreset = (presetKey: string) => {
    const preset = INSURANCE_PRESETS[presetKey];
    if (preset) {
      updateFormData(() => JSON.parse(JSON.stringify(preset)));
    }
    setShowPresetsMenu(false);
  };

  const addField = (type: CardFieldType) => {
    const count = formData.fields.length + 1;
    let label = 'Text Question';
    let placeholder = 'Enter answer...';

    if (type === 'input-tel') {
      label = 'Phone Number';
      placeholder = '(555) 000-0000';
    } else if (type === 'input-email') {
      label = 'Email Address';
      placeholder = 'name@example.com';
    } else if (type === 'input-number') {
      label = 'Age / Amount';
      placeholder = '0';
    } else if (type === 'input-date') {
      label = 'Date of Birth';
      placeholder = 'YYYY-MM-DD';
    } else if (type === 'input-radio') {
      label = 'Select One Option (Radio)';
    } else if (type === 'input-choice') {
      label = 'Select Option (Dropdown)';
    } else if (type === 'input-checklist') {
      label = 'Select All That Apply (Checklist)';
    } else if (type === 'input-tagselect') {
      label = 'Select Category (Pills)';
    } else if (type === 'input-toggle') {
      label = 'I agree to the terms';
    }

    const newField: CardElementDef = {
      id: `field_${count}`,
      type,
      label,
      placeholder,
      required: false,
    };

    if (type === 'input-radio' || type === 'input-choice' || type === 'input-checklist' || type === 'input-tagselect') {
      newField.choices = [
        { title: 'Option 1', value: 'option_1' },
        { title: 'Option 2', value: 'option_2' },
      ];
      if (type === 'input-tagselect') {
        newField.allowCustom = false;
        newField.customPlaceholder = 'Other custom value...';
      }
    } else if (type === 'input-number') {
      newField.min = 0;
      newField.max = 100;
    }

    updateFormData((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setShowAddMenu(false);
  };

  const removeField = (index: number) => {
    updateFormData((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    updateFormData((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.fields.length) return prev;
      const nextFields = [...prev.fields];
      const temp = nextFields[index];
      nextFields[index] = nextFields[target];
      nextFields[target] = temp;
      return { ...prev, fields: nextFields };
    });
  };

  const toggleRequired = (index: number) => {
    updateFormData((prev) => {
      const nextFields = [...prev.fields];
      nextFields[index] = { ...nextFields[index], required: !nextFields[index].required };
      return { ...prev, fields: nextFields };
    });
  };

  const updateFieldProp = <K extends keyof CardElementDef>(index: number, prop: K, val: CardElementDef[K]) => {
    updateFormData((prev) => {
      const nextFields = [...prev.fields];
      nextFields[index] = { ...nextFields[index], [prop]: val };
      return { ...prev, fields: nextFields };
    });
  };

  const addChoice = (fieldIndex: number) => {
    updateFormData((prev) => {
      const nextFields = [...prev.fields];
      const f = nextFields[fieldIndex];
      const count = (f.choices || []).length + 1;
      f.choices = [...(f.choices || []), { title: `Option ${count}`, value: `option_${count}` }];
      return { ...prev, fields: nextFields };
    });
  };

  const updateChoice = (fieldIndex: number, choiceIndex: number, title: string) => {
    updateFormData((prev) => {
      const nextFields = [...prev.fields];
      const f = nextFields[fieldIndex];
      if (f.choices && f.choices[choiceIndex]) {
        f.choices = f.choices.map((c, i) =>
          i === choiceIndex
            ? { title, value: title.toLowerCase().replace(/[^a-z0-9_]/g, '_') }
            : c,
        );
      }
      return { ...prev, fields: nextFields };
    });
  };

  const removeChoice = (fieldIndex: number, choiceIndex: number) => {
    updateFormData((prev) => {
      const nextFields = [...prev.fields];
      const f = nextFields[fieldIndex];
      if (f.choices) {
        f.choices = f.choices.filter((_, i) => i !== choiceIndex);
      }
      return { ...prev, fields: nextFields };
    });
  };

  const getFieldIcon = (type: CardFieldType) => {
    switch (type) {
      case 'input-tel':
        return '📞';
      case 'input-email':
        return '📧';
      case 'input-number':
        return '🔢';
      case 'input-date':
        return '📅';
      case 'input-radio':
        return '🔘';
      case 'input-choice':
        return '📋';
      case 'input-checklist':
        return '☑️';
      case 'input-tagselect':
        return '🏷️';
      case 'input-toggle':
        return '🔲';
      default:
        return '✍️';
    }
  };

  const getFieldTypeName = (type: CardFieldType) => {
    switch (type) {
      case 'input-tel':
        return 'Phone (Tel)';
      case 'input-email':
        return 'Email Address';
      case 'input-number':
        return 'Number / Currency';
      case 'input-date':
        return 'Date Picker';
      case 'input-radio':
        return 'Radio Buttons';
      case 'input-choice':
        return 'Dropdown Select';
      case 'input-checklist':
        return 'Checklist';
      case 'input-tagselect':
        return 'Pill TagSelect';
      case 'input-toggle':
        return 'Toggle Switch';
      default:
        return 'Short Text';
    }
  };

  const renderInteractivePreview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Preview Info Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          color: '#166534',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>👁️</span>
          <strong>Interactive Card Preview</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            setPreviewValues({});
            setPreviewErrors({});
            setPreviewSubmitted(null);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#15803d',
            fontSize: 10.5,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Reset Inputs
        </button>
      </div>

      {/* Title & Description */}
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
          {formData.title || 'User Form'}
        </h3>
        {formData.desc && (
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
            {formData.desc}
          </p>
        )}
      </div>

      {/* Fields */}
      {formData.fields.length === 0 ? (
        <div
          data-testid="preview-empty-card"
          style={{
            border: '1px dashed #cbd5e1',
            borderRadius: 8,
            padding: '28px 16px',
            textAlign: 'center',
            color: '#64748b',
            fontSize: 12,
            background: '#f8fafc',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>✨</div>
          <div style={{ fontWeight: 600, color: '#334155' }}>This card has no questions yet</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Switch to <strong>Edit</strong> mode to add questions.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {formData.fields.map((f) => {
            const hasError = !!previewErrors[f.id];
            const val = previewValues[f.id];

            return (
              <div
                key={f.id}
                data-testid={`preview-field-${f.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {/* Label */}
                {f.type !== 'input-toggle' && (
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: hasError ? '#dc2626' : '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{f.label}</span>
                    {f.required && <span style={{ color: '#dc2626' }}>*</span>}
                  </label>
                )}

                {/* Field Input Widget based on type */}
                {f.type === 'input-radio' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                    {(f.choices || []).map((choice) => (
                      <label
                        key={choice.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: '#1f2937',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name={`preview-${f.id}`}
                          value={choice.value}
                          checked={val === choice.value}
                          onChange={() => {
                            setPreviewValues((prev) => ({ ...prev, [f.id]: choice.value }));
                            setPreviewErrors((prev) => {
                              const next = { ...prev };
                              delete next[f.id];
                              return next;
                            });
                          }}
                          style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                        />
                        <span>{choice.title}</span>
                      </label>
                    ))}
                  </div>
                ) : f.type === 'input-checklist' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                    {(f.choices || []).map((choice) => {
                      const selectedArr = Array.isArray(val) ? val : [];
                      const isChecked = selectedArr.includes(choice.value);
                      return (
                        <label
                          key={choice.value}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            color: '#1f2937',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            value={choice.value}
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selectedArr, choice.value]
                                : selectedArr.filter((x: string) => x !== choice.value);
                              setPreviewValues((prev) => ({ ...prev, [f.id]: next }));
                              if (next.length > 0) {
                                setPreviewErrors((prev) => {
                                  const errs = { ...prev };
                                  delete errs[f.id];
                                  return errs;
                                });
                              }
                            }}
                            style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                          />
                          <span>{choice.title}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : f.type === 'input-tagselect' ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {(f.choices || []).map((choice) => {
                      const selectedArr = Array.isArray(val) ? val : [];
                      const isSelected = selectedArr.includes(choice.value);
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          onClick={() => {
                            const next = isSelected
                              ? selectedArr.filter((x: string) => x !== choice.value)
                              : [...selectedArr, choice.value];
                            setPreviewValues((prev) => ({ ...prev, [f.id]: next }));
                            if (next.length > 0) {
                              setPreviewErrors((prev) => {
                                const errs = { ...prev };
                                delete errs[f.id];
                                return errs;
                              });
                            }
                          }}
                          style={{
                            background: isSelected ? '#2563eb' : '#f3f4f6',
                            color: isSelected ? '#ffffff' : '#374151',
                            border: isSelected ? '1px solid #2563eb' : '1px solid #e5e7eb',
                            borderRadius: 14,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: isSelected ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {choice.title}
                        </button>
                      );
                    })}
                  </div>
                ) : f.type === 'input-choice' ? (
                  <select
                    value={val ?? ''}
                    onChange={(e) => {
                      setPreviewValues((prev) => ({ ...prev, [f.id]: e.target.value }));
                      if (e.target.value) {
                        setPreviewErrors((prev) => {
                          const errs = { ...prev };
                          delete errs[f.id];
                          return errs;
                        });
                      }
                    }}
                    style={{
                      height: 32,
                      padding: '0 8px',
                      borderRadius: 4,
                      border: hasError ? '1.5px solid #dc2626' : '1px solid #d1d5db',
                      background: '#ffffff',
                      color: '#111827',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  >
                    <option value="">-- Select an option --</option>
                    {(f.choices || []).map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'input-toggle' ? (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      color: hasError ? '#dc2626' : '#374151',
                      cursor: 'pointer',
                      padding: '2px 0',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!val}
                      onChange={(e) => {
                        setPreviewValues((prev) => ({ ...prev, [f.id]: e.target.checked }));
                        if (e.target.checked || !f.required) {
                          setPreviewErrors((prev) => {
                            const errs = { ...prev };
                            delete errs[f.id];
                            return errs;
                          });
                        }
                      }}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
                    />
                    <span>
                      {f.label} {f.required && <span style={{ color: '#dc2626' }}>*</span>}
                    </span>
                  </label>
                ) : (
                  <input
                    type={
                      f.type === 'input-tel'
                        ? 'tel'
                        : f.type === 'input-email'
                        ? 'email'
                        : f.type === 'input-date'
                        ? 'date'
                        : f.type === 'input-number'
                        ? 'number'
                        : 'text'
                    }
                    value={val ?? ''}
                    min={f.min}
                    max={f.max}
                    placeholder={f.placeholder}
                    onChange={(e) => {
                      setPreviewValues((prev) => ({ ...prev, [f.id]: e.target.value }));
                      if (e.target.value.trim()) {
                        setPreviewErrors((prev) => {
                          const errs = { ...prev };
                          delete errs[f.id];
                          return errs;
                        });
                      }
                    }}
                    style={{
                      height: 32,
                      padding: '0 8px',
                      borderRadius: 4,
                      border: hasError ? '1.5px solid #dc2626' : '1px solid #d1d5db',
                      background: '#ffffff',
                      color: '#111827',
                      fontSize: 12,
                      outline: 'none',
                    }}
                  />
                )}

                {/* Error Message */}
                {hasError && (
                  <span style={{ fontSize: 10.5, color: '#dc2626', fontWeight: 500 }}>
                    ⚠️ {previewErrors[f.id]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Button */}
      {formData.fields.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            data-testid="preview-submit-btn"
            onClick={() => {
              const errors: Record<string, string> = {};
              formData.fields.forEach((f) => {
                if (f.required) {
                  const v = previewValues[f.id];
                  if (f.type === 'input-checklist' || f.type === 'input-tagselect') {
                    if (!Array.isArray(v) || v.length === 0) {
                      errors[f.id] = `${f.label} requires at least one selection.`;
                    }
                  } else if (f.type === 'input-toggle') {
                    if (!v) {
                      errors[f.id] = `${f.label} must be checked.`;
                    }
                  } else {
                    if (v === undefined || v === null || String(v).trim() === '') {
                      errors[f.id] = `${f.label} is required.`;
                    }
                  }
                }
              });

              if (Object.keys(errors).length > 0) {
                setPreviewErrors(errors);
                setPreviewSubmitted(null);
              } else {
                setPreviewErrors({});
                setPreviewSubmitted({ ...previewValues });
              }
            }}
            style={{
              width: '100%',
              height: 38,
              background: '#107c41',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(16,124,65,0.2)',
            }}
          >
            {formData.submitText || 'Submit'}
          </button>
        </div>
      )}

      {/* Submission Result Banner */}
      {previewSubmitted && (
        <div
          data-testid="preview-submission-banner"
          style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 6,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#065f46', fontWeight: 600, fontSize: 11.5 }}>
            <span>✅</span>
            <span>Simulated Card Submission Succeeded!</span>
          </div>
          <pre
            style={{
              margin: 0,
              background: '#ffffff',
              border: '1px solid #d1fae5',
              borderRadius: 4,
              padding: 6,
              fontSize: 10,
              fontFamily: 'Consolas, monospace',
              color: '#1f2937',
              overflowX: 'auto',
            }}
          >
            {JSON.stringify(previewSubmitted, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );

  return (
    <div
      data-testid="adaptive-card-form-editor"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
      }}
    >
      {/* Phone / Card Simulated Viewport */}
      <div
        style={{
          width: '100%',
          background: '#ffffff',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          color: '#1f2937',
          boxSizing: 'border-box',
        }}
      >
        {/* Header Row: Title on Left, Edit / Preview Toggle on Right */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1 }}>
            {viewMode === 'edit' ? (
              <input
                type="text"
                value={formData.title}
                onChange={(e) => updateFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="User Form (Title)"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111827',
                  border: '1px solid transparent',
                  borderRadius: 4,
                  padding: '2px 4px',
                  width: '100%',
                  outline: 'none',
                  background: 'transparent',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111827',
                  padding: '2px 4px',
                }}
              >
                {formData.title || 'User Form'}
              </div>
            )}
          </div>

          {/* Top-Right Corner Edit / Preview Toggle */}
          <div
            style={{
              display: 'flex',
              background: '#f1f5f9',
              borderRadius: 6,
              padding: 2,
              border: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              data-testid="mode-edit-btn"
              onClick={() => setViewMode('edit')}
              style={{
                background: viewMode === 'edit' ? '#0e639c' : 'transparent',
                color: viewMode === 'edit' ? '#ffffff' : '#64748b',
                border: 'none',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
              }}
            >
              <span>✏️</span>
              <span>Edit</span>
            </button>
            <button
              type="button"
              data-testid="mode-preview-btn"
              onClick={() => {
                setViewMode('preview');
                setPreviewErrors({});
                setPreviewSubmitted(null);
              }}
              style={{
                background: viewMode === 'preview' ? '#0e639c' : 'transparent',
                color: viewMode === 'preview' ? '#ffffff' : '#64748b',
                border: 'none',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 10.5,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s ease',
              }}
            >
              <span>👁️</span>
              <span>Preview</span>
            </button>
          </div>
        </div>

        {/* Subtitle / Description */}
        {viewMode === 'edit' ? (
          <textarea
            rows={2}
            value={formData.desc}
            onChange={(e) => updateFormData((prev) => ({ ...prev, desc: e.target.value }))}
            placeholder="Description / subtitle..."
            style={{
              fontSize: 11.5,
              color: '#6b7280',
              border: '1px solid transparent',
              borderRadius: 4,
              padding: '2px 4px',
              width: '100%',
              outline: 'none',
              background: 'transparent',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        ) : formData.desc ? (
          <div
            style={{
              fontSize: 11.5,
              color: '#6b7280',
              padding: '0 4px',
              lineHeight: 1.4,
            }}
          >
            {formData.desc}
          </div>
        ) : null}

        {/* Toolbar: Blank Card & Reference Presets */}
        {viewMode === 'edit' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                data-testid="new-blank-card-btn"
                onClick={startBlankCard}
                style={{
                  background: '#f8fafc',
                  color: '#334155',
                  border: '1px solid #e2e8f0',
                  borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
                title="Start a fresh blank card from scratch"
              >
                <span>✨ Blank</span>
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  data-testid="presets-menu-btn"
                  onClick={() => setShowPresetsMenu((prev) => !prev)}
                  style={{
                    background: '#f8fafc',
                    color: '#334155',
                    border: '1px solid #e2e8f0',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <span>📋 Presets ▾</span>
                </button>

                {showPresetsMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 24,
                      left: 0,
                      width: 250,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      padding: '4px 0',
                      zIndex: 100,
                    }}
                  >
                    <button
                      type="button"
                      data-testid="preset-blank-btn"
                      onClick={startBlankCard}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 10px',
                        background: 'transparent',
                        border: 'none',
                        color: '#0284c7',
                        cursor: 'pointer',
                        fontSize: 11,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        borderBottom: '1px solid #f1f5f9',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontWeight: 600 }}>✨ Blank Card (From Scratch)</span>
                      <span style={{ fontSize: 9.5, color: '#64748b' }}>Clean empty form</span>
                    </button>

                    <div style={{ padding: '4px 10px 2px', fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      Reference Presets
                    </div>
                    {[
                      { key: 'contact-info', title: '📇 Contact Information', sub: 'Text, Tel, Email, Date, Toggle' },
                      { key: 'coverage-intent', title: '🎯 Coverage Intent', sub: '4x TagSelect Pills' },
                      { key: 'health-info', title: '🏥 Health Information', sub: 'Radio, Checklist, Number, Choice' },
                      { key: 'employment', title: '💼 Employment & Income', sub: 'TagSelect, Number, Text' },
                      { key: 'radio-demo', title: '📻 Radio Button Demo', sub: 'ChoiceSet (expanded single)' },
                      { key: 'ccpa', title: '🔒 CCPA Notice', sub: 'ChoiceSet (compact), Text' },
                      { key: 'beneficiary', title: '👤 Beneficiary Information', sub: 'Text, Dropdown, Date, Number' },
                    ].map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => loadPreset(preset.key)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '5px 10px',
                          background: 'transparent',
                          border: 'none',
                          color: '#1e293b',
                          cursor: 'pointer',
                          fontSize: 11,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontWeight: 600 }}>{preset.title}</span>
                        <span style={{ fontSize: 9.5, color: '#64748b' }}>{preset.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
              10 Field Types
            </span>
          </div>
        )}

        {/* Viewport Content */}
        {viewMode === 'preview' ? (
          renderInteractivePreview()
        ) : (
          <>
            {/* Form Fields List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {formData.fields.length === 0 && (
                <div
                  data-testid="empty-card-prompt"
                  style={{
                    border: '2px dashed #cbd5e1',
                    borderRadius: 8,
                    padding: '24px 16px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 26 }}>✨</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                      Blank Card Canvas
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, maxWidth: 300, lineHeight: 1.4 }}>
                      Your card currently has no questions. Tap <strong>+ Add Question</strong> below to add your first question, or pick a reference preset.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button
                      type="button"
                      data-testid="empty-add-field-btn"
                      onClick={() => setShowAddMenu(true)}
                      style={{
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 5,
                        padding: '6px 12px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      + Add First Question
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPresetsMenu(true)}
                      style={{
                        background: '#ffffff',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        borderRadius: 5,
                        padding: '6px 12px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      📋 Load Reference Preset
                    </button>
                  </div>
                </div>
              )}

              {formData.fields.map((f, idx) => (
                <div
                  key={f.id + idx}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    padding: '10px 12px',
                    background: '#fafafa',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {/* Meta bar: Label + Type badge + Required Toggle + Reorder/Delete */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13 }}>{getFieldIcon(f.type)}</span>
                      <input
                        type="text"
                        value={f.label}
                        onChange={(e) => updateFieldProp(idx, 'label', e.target.value)}
                        title="Click to edit field question / label"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#1f2937',
                          border: '1px solid transparent',
                          borderRadius: 3,
                          padding: '2px 4px',
                          outline: 'none',
                          background: 'transparent',
                          width: '100%',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {/* Type Badge */}
                      <span
                        style={{
                          fontSize: 9.5,
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '1px 5px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        {getFieldTypeName(f.type)}
                      </span>

                      {/* Required Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleRequired(idx)}
                        style={{
                          background: f.required ? '#fef2f2' : '#f3f4f6',
                          color: f.required ? '#dc2626' : '#6b7280',
                          border: f.required ? '1px solid #fecaca' : '1px solid #e5e7eb',
                          borderRadius: 4,
                          padding: '1px 5px',
                          fontSize: 9.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title={f.required ? 'Field is required' : 'Field is optional'}
                      >
                        {f.required ? '* Required' : 'Optional'}
                      </button>

                      {/* Reorder Arrows */}
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveField(idx, -1)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: idx === 0 ? '#d1d5db' : '#6b7280',
                          cursor: idx === 0 ? 'default' : 'pointer',
                          padding: '0 2px',
                          fontSize: 10,
                        }}
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === formData.fields.length - 1}
                        onClick={() => moveField(idx, 1)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: idx === formData.fields.length - 1 ? '#d1d5db' : '#6b7280',
                          cursor: idx === formData.fields.length - 1 ? 'default' : 'pointer',
                          padding: '0 2px',
                          fontSize: 10,
                        }}
                        title="Move Down"
                      >
                        ▼
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeField(idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '0 2px',
                          fontSize: 12,
                        }}
                        title="Delete Question"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Field Input Mockup (Direct-on-canvas preview/editor) */}
                  {f.type === 'input-radio' || f.type === 'input-checklist' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 6 }}>
                      {(f.choices || []).map((choice, cIdx) => (
                        <div key={choice.value + cIdx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>{f.type === 'input-radio' ? '🔘' : '☑️'}</span>
                          <input
                            type="text"
                            value={choice.title}
                            onChange={(e) => updateChoice(idx, cIdx, e.target.value)}
                            style={{
                              fontSize: 11.5,
                              color: '#374151',
                              border: '1px solid #e5e7eb',
                              borderRadius: 4,
                              padding: '2px 6px',
                              background: '#ffffff',
                              flex: 1,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeChoice(idx, cIdx)}
                            style={{ border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 11 }}
                            title="Remove Choice"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addChoice(idx)}
                        style={{
                          alignSelf: 'flex-start',
                          background: 'transparent',
                          border: 'none',
                          color: '#2563eb',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px',
                        }}
                      >
                        + Add Choice
                      </button>
                    </div>
                  ) : f.type === 'input-tagselect' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(f.choices || []).map((choice, cIdx) => (
                          <div
                            key={choice.value + cIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: 12,
                              padding: '2px 8px',
                            }}
                          >
                            <input
                              type="text"
                              value={choice.title}
                              onChange={(e) => updateChoice(idx, cIdx, e.target.value)}
                              style={{
                                fontSize: 11,
                                color: '#1e293b',
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                width: Math.max(choice.title.length * 7, 40),
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => removeChoice(idx, cIdx)}
                              style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 11, padding: 0 }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addChoice(idx)}
                        style={{
                          alignSelf: 'flex-start',
                          background: 'transparent',
                          border: 'none',
                          color: '#2563eb',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px',
                        }}
                      >
                        + Add Pill Option
                      </button>
                    </div>
                  ) : f.type === 'input-choice' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(f.choices || []).map((choice, cIdx) => (
                          <div key={choice.value + cIdx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="text"
                              value={choice.title}
                              onChange={(e) => updateChoice(idx, cIdx, e.target.value)}
                              style={{
                                fontSize: 11,
                                color: '#374151',
                                border: '1px solid #e5e7eb',
                                borderRadius: 4,
                                padding: '2px 6px',
                                background: '#ffffff',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => removeChoice(idx, cIdx)}
                              style={{ border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 11 }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => addChoice(idx)}
                        style={{
                          alignSelf: 'flex-start',
                          background: 'transparent',
                          border: 'none',
                          color: '#2563eb',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px',
                        }}
                      >
                        + Add Dropdown Option
                      </button>
                    </div>
                  ) : f.type === 'input-toggle' ? (
                    <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                      Renders as an interactive switch toggle checkbox.
                    </div>
                  ) : (
                    <input
                      type="text"
                      disabled
                      placeholder={f.placeholder || 'Placeholder text...'}
                      style={{
                        height: 28,
                        padding: '0 8px',
                        borderRadius: 4,
                        border: '1px solid #e5e7eb',
                        background: '#ffffff',
                        color: '#9ca3af',
                        fontSize: 11.5,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* + Add Question / Form Field Button */}
            <div style={{ position: 'relative', marginTop: 4 }}>
              <button
                type="button"
                data-testid="add-field-btn"
                onClick={() => setShowAddMenu((prev) => !prev)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 6,
                  color: '#2563eb',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
              >
                <span>+</span> Add Question / Form Field
              </button>

              {/* 10 Field Types Popover Menu */}
              {showAddMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    right: 0,
                    marginBottom: 6,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
                    padding: 8,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 6,
                    zIndex: 100,
                  }}
                >
                  {[
                    { type: 'input-text', icon: '✍️', title: 'Short Text', sub: 'Single line text' },
                    { type: 'input-tel', icon: '📞', title: 'Phone Number', sub: 'Phone format' },
                    { type: 'input-email', icon: '📧', title: 'Email Address', sub: 'Email format' },
                    { type: 'input-number', icon: '🔢', title: 'Number', sub: 'Numeric value' },
                    { type: 'input-date', icon: '📅', title: 'Date Picker', sub: 'Calendar date' },
                    { type: 'input-radio', icon: '🔘', title: 'Radio Buttons', sub: 'Single choice' },
                    { type: 'input-choice', icon: '📋', title: 'Dropdown', sub: 'Select box' },
                    { type: 'input-checklist', icon: '☑️', title: 'Checklist', sub: 'Multi-select' },
                    { type: 'input-tagselect', icon: '🏷️', title: 'Pill Tags', sub: 'Clickable pills' },
                    { type: 'input-toggle', icon: '🔲', title: 'Toggle Switch', sub: 'Yes/No switch' },
                  ].map((opt) => (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => addField(opt.type as CardFieldType)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 5,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#eef2ff')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    >
                      <span style={{ fontSize: 14 }}>{opt.icon}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>{opt.title}</div>
                        <div style={{ fontSize: 9.5, color: '#64748b' }}>{opt.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div style={{ marginTop: 6 }}>
              <input
                type="text"
                value={formData.submitText}
                onChange={(e) => updateFormData((prev) => ({ ...prev, submitText: e.target.value }))}
                placeholder="Submit Button Text"
                style={{
                  background: '#107c41',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '9px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'center',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
