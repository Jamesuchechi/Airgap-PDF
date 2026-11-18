export type Locale = 'en' | 'es' | 'ar';

export const LOCALES: ReadonlyArray<{ code: Locale; label: string; rtl: boolean }> = [
  { code: 'en', label: 'EN', rtl: false },
  { code: 'es', label: 'ES', rtl: false },
  { code: 'ar', label: 'AR', rtl: true },
];

export const MESSAGES = {
  en: {
    'app.tagline': 'Your PDF never leaves the room.',
    'nav.openPdf': 'Open PDF',
    'nav.samplePdf': 'Load sample PDF',
    'nav.workbench': 'Workbench',
    'nav.redact': 'Redact & Verify',
    'nav.compare': 'Compare PDFs',
    'nav.scan': 'Document Scanner',
    'nav.recipes': 'Recipes',
    'trust.pill': '0 OBSERVED REQUESTS · CSP ACTIVE',
    'trust.offline': 'OFFLINE READY',
  },
  es: {
    'app.tagline': 'Tu PDF nunca sale de la sala.',
    'nav.openPdf': 'Abrir PDF',
    'nav.samplePdf': 'Cargar PDF de muestra',
    'nav.workbench': 'Mesa de trabajo',
    'nav.redact': 'Censurar y verificar',
    'nav.compare': 'Comparar PDFs',
    'nav.scan': 'Escáner de documentos',
    'nav.recipes': 'Recetas',
    'trust.pill': '0 PETICIONES OBSERVADAS · CSP ACTIVA',
    'trust.offline': 'LISTO SIN CONEXIÓN',
  },
  ar: {
    'app.tagline': 'ملف PDF الخاص بك لا يغادر الغرفة أبداً.',
    'nav.openPdf': 'فتح PDF',
    'nav.samplePdf': 'تحميل ملف تجريبي',
    'nav.workbench': 'منصة العمل',
    'nav.redact': 'تنقيح وتحقق',
    'nav.compare': 'مقارنة ملفات PDF',
    'nav.scan': 'ماسح المستندات',
    'nav.recipes': 'الوصفات',
    'trust.pill': '٠ طلبات خارجية · سياسة الأمان مفعلة',
    'trust.offline': 'جاهز دون اتصال',
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)['en'];

export function isRtlLocale(locale: Locale): boolean {
  return locale === 'ar';
}

export function t(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key] ?? MESSAGES.en[key];
}
