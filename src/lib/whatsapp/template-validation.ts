export interface TemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: TemplateComponent[];
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: TemplateButton[];
  example?: any;
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'OTP';
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  field: string;
  message: string;
  code: string;
}

const NAME_REGEX = /^[a-z][a-z0-9_]*$/;
const VARIABLE_REGEX = /\{\{(\d+)\}\}/g;
const WA_ME_REGEX = /wa\.me\//i;

export const LIMITS = {
  name: { min: 1, max: 512 },
  header_text: { max: 60 },
  body_text: { max: 1024 },
  footer_text: { max: 60 },
  button_text: { max: 25 },
  url_button_url: { max: 2000 },
  quick_reply_max: 3,
  url_buttons_max: 2,
  phone_buttons_max: 1,
  total_buttons_max: 10,
};

export function validateTemplateLocally(template: TemplateInput): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- Name validation ---
  if (!template.name) {
    errors.push({ field: 'name', message: 'Template name is required', code: 'NAME_REQUIRED' });
  } else {
    if (template.name.length > LIMITS.name.max) {
      errors.push({ field: 'name', message: `Name exceeds ${LIMITS.name.max} characters`, code: 'NAME_TOO_LONG' });
    }
    if (!NAME_REGEX.test(template.name)) {
      errors.push({
        field: 'name',
        message: 'Name must start with a lowercase letter and contain only lowercase letters, numbers, and underscores',
        code: 'NAME_FORMAT',
      });
    }
  }

  // --- Category validation ---
  const validCategories = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
  if (!validCategories.includes(template.category)) {
    errors.push({ field: 'category', message: `Invalid category. Must be one of: ${validCategories.join(', ')}`, code: 'INVALID_CATEGORY' });
  }

  // --- Language validation ---
  if (!template.language || template.language.length < 2) {
    errors.push({ field: 'language', message: 'Language code is required', code: 'LANGUAGE_REQUIRED' });
  }

  // --- Components validation ---
  if (!template.components || template.components.length === 0) {
    errors.push({ field: 'components', message: 'At least one component is required', code: 'COMPONENTS_REQUIRED' });
    return { valid: false, errors, warnings };
  }

  const componentTypes = template.components.map(c => c.type);
  const hasBody = componentTypes.includes('BODY');

  if (!hasBody) {
    errors.push({ field: 'components', message: 'BODY component is required', code: 'BODY_REQUIRED' });
  }

  // Check for duplicate component types (except BUTTONS can appear once)
  for (const type of ['HEADER', 'BODY', 'FOOTER'] as const) {
    if (componentTypes.filter(t => t === type).length > 1) {
      errors.push({ field: 'components', message: `Duplicate ${type} component`, code: 'DUPLICATE_COMPONENT' });
    }
  }

  for (const component of template.components) {
    switch (component.type) {
      case 'HEADER':
        validateHeader(component, errors, warnings);
        break;
      case 'BODY':
        validateBody(component, errors, warnings, template.category);
        break;
      case 'FOOTER':
        validateFooter(component, errors, warnings);
        break;
      case 'BUTTONS':
        validateButtons(component, errors, warnings);
        break;
    }
  }

  // --- Category-content mismatch warnings ---
  const bodyComponent = template.components.find(c => c.type === 'BODY');
  if (bodyComponent?.text && template.category) {
    checkCategoryContentMismatch(bodyComponent.text, template.category, warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateHeader(component: TemplateComponent, errors: ValidationIssue[], warnings: ValidationIssue[]) {
  if (component.format === 'TEXT' && component.text) {
    if (component.text.length > LIMITS.header_text.max) {
      errors.push({
        field: 'header.text',
        message: `Header text exceeds ${LIMITS.header_text.max} characters (${component.text.length})`,
        code: 'HEADER_TOO_LONG',
      });
    }
    validateVariables(component.text, 'header', errors, 1);
  }
}

function validateBody(
  component: TemplateComponent,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  category: string
) {
  if (!component.text) {
    errors.push({ field: 'body.text', message: 'Body text is required', code: 'BODY_TEXT_REQUIRED' });
    return;
  }

  if (component.text.length > LIMITS.body_text.max) {
    errors.push({
      field: 'body.text',
      message: `Body text exceeds ${LIMITS.body_text.max} characters (${component.text.length})`,
      code: 'BODY_TOO_LONG',
    });
  }

  if (component.text.trim().length === 0) {
    errors.push({ field: 'body.text', message: 'Body text cannot be empty', code: 'BODY_EMPTY' });
  }

  // Check for wa.me links (Meta rejects these)
  if (WA_ME_REGEX.test(component.text)) {
    errors.push({
      field: 'body.text',
      message: 'Body text must not contain wa.me links. Use a URL button instead.',
      code: 'WAME_LINK',
    });
  }

  validateVariables(component.text, 'body', errors);
}

function validateFooter(component: TemplateComponent, errors: ValidationIssue[], warnings: ValidationIssue[]) {
  if (component.text && component.text.length > LIMITS.footer_text.max) {
    errors.push({
      field: 'footer.text',
      message: `Footer text exceeds ${LIMITS.footer_text.max} characters (${component.text.length})`,
      code: 'FOOTER_TOO_LONG',
    });
  }
}

function validateButtons(component: TemplateComponent, errors: ValidationIssue[], warnings: ValidationIssue[]) {
  if (!component.buttons || component.buttons.length === 0) {
    errors.push({ field: 'buttons', message: 'BUTTONS component requires at least one button', code: 'NO_BUTTONS' });
    return;
  }

  if (component.buttons.length > LIMITS.total_buttons_max) {
    errors.push({
      field: 'buttons',
      message: `Maximum ${LIMITS.total_buttons_max} buttons allowed (${component.buttons.length} provided)`,
      code: 'TOO_MANY_BUTTONS',
    });
  }

  const quickReplyCount = component.buttons.filter(b => b.type === 'QUICK_REPLY').length;
  const urlCount = component.buttons.filter(b => b.type === 'URL').length;
  const phoneCount = component.buttons.filter(b => b.type === 'PHONE_NUMBER').length;

  if (quickReplyCount > LIMITS.quick_reply_max) {
    errors.push({ field: 'buttons', message: `Maximum ${LIMITS.quick_reply_max} quick reply buttons allowed`, code: 'TOO_MANY_QUICK_REPLIES' });
  }

  if (urlCount > LIMITS.url_buttons_max) {
    errors.push({ field: 'buttons', message: `Maximum ${LIMITS.url_buttons_max} URL buttons allowed`, code: 'TOO_MANY_URL_BUTTONS' });
  }

  if (phoneCount > LIMITS.phone_buttons_max) {
    errors.push({ field: 'buttons', message: `Maximum ${LIMITS.phone_buttons_max} phone number button allowed`, code: 'TOO_MANY_PHONE_BUTTONS' });
  }

  // Quick reply and other button types cannot be mixed
  if (quickReplyCount > 0 && (urlCount > 0 || phoneCount > 0)) {
    errors.push({
      field: 'buttons',
      message: 'Quick reply buttons cannot be mixed with URL or phone number buttons',
      code: 'MIXED_BUTTON_TYPES',
    });
  }

  for (let i = 0; i < component.buttons.length; i++) {
    const btn = component.buttons[i];

    if (!btn.text || btn.text.trim().length === 0) {
      errors.push({ field: `buttons[${i}].text`, message: 'Button text is required', code: 'BUTTON_TEXT_REQUIRED' });
    } else if (btn.text.length > LIMITS.button_text.max) {
      errors.push({
        field: `buttons[${i}].text`,
        message: `Button text exceeds ${LIMITS.button_text.max} characters`,
        code: 'BUTTON_TEXT_TOO_LONG',
      });
    }

    if (btn.type === 'URL' && btn.url) {
      if (btn.url.length > LIMITS.url_button_url.max) {
        errors.push({ field: `buttons[${i}].url`, message: 'URL exceeds maximum length', code: 'BUTTON_URL_TOO_LONG' });
      }
      if (!btn.url.startsWith('https://')) {
        errors.push({ field: `buttons[${i}].url`, message: 'URL must start with https://', code: 'BUTTON_URL_NOT_HTTPS' });
      }
    }
  }
}

function validateVariables(text: string, field: string, errors: ValidationIssue[], maxVars?: number) {
  const matches = [...text.matchAll(VARIABLE_REGEX)];
  if (matches.length === 0) return;

  if (maxVars !== undefined && matches.length > maxVars) {
    errors.push({
      field,
      message: `${field} allows at most ${maxVars} variable(s), found ${matches.length}`,
      code: 'TOO_MANY_VARIABLES',
    });
  }

  // Check for contiguous numbering starting from 1
  const indices = matches.map(m => parseInt(m[1], 10)).sort((a, b) => a - b);

  if (indices[0] !== 1) {
    errors.push({
      field,
      message: 'Variables must start at {{1}}',
      code: 'VARIABLE_START',
    });
  }

  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) {
      errors.push({
        field,
        message: `Variables must be contiguous. Found gap between {{${indices[i - 1]}}} and {{${indices[i]}}}`,
        code: 'VARIABLE_GAP',
      });
      break;
    }
  }
}

function checkCategoryContentMismatch(bodyText: string, category: string, warnings: ValidationIssue[]) {
  const lower = bodyText.toLowerCase();

  if (category === 'UTILITY') {
    const marketingKeywords = ['desconto', 'oferta', 'promo', 'sale', 'discount', 'compre', 'aproveite', 'imperdivel'];
    const found = marketingKeywords.filter(k => lower.includes(k));
    if (found.length >= 2) {
      warnings.push({
        field: 'category',
        message: `Template categorized as UTILITY but body contains marketing-like keywords (${found.join(', ')}). Meta may recategorize this to MARKETING, which costs more.`,
        code: 'CATEGORY_MISMATCH',
      });
    }
  }

  if (category === 'AUTHENTICATION') {
    const hasOtp = lower.includes('{{1}}') && (lower.includes('code') || lower.includes('codigo') || lower.includes('verificar'));
    if (!hasOtp) {
      warnings.push({
        field: 'category',
        message: 'AUTHENTICATION templates should contain a verification code variable. Consider using UTILITY instead.',
        code: 'AUTH_NO_CODE',
      });
    }
  }
}
