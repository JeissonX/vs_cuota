/**
 * AG Pro Quota — Motor de internacionalización (es/en, extensible)
 */

import * as vscode from 'vscode';
import { es } from './es';
import { en } from './en';

export type TranslationKey = keyof typeof es;

const translations: Record<string, Record<string, string>> = { es, en };

let currentLang: string = 'es';

/**
 * Detecta el idioma efectivo según preferencia del usuario o locale del IDE.
 */
export function resolveLanguage(preference: 'auto' | 'es' | 'en'): string {
  if (preference === 'es' || preference === 'en') {
    return preference;
  }
  const locale = vscode.env.language || 'en';
  if (locale.toLowerCase().startsWith('es')) {
    return 'es';
  }
  return 'en';
}

export function setLanguage(lang: string): void {
  currentLang = lang;
}

export function getLanguage(): string {
  return currentLang;
}

/**
 * Obtiene la traducción para la clave solicitada, con fallback a inglés.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let text = translations[currentLang]?.[key] ?? translations['en']?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
