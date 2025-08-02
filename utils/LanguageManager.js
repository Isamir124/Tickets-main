/*
 * LanguageManager - Sistema profesional de idiomas
 * Maneja traducciones dinámicas y detección automática de idioma
 */

const fs = require('fs');
const path = require('path');

class LanguageManager {
    constructor() {
        this.languages = new Map();
        this.guildLanguages = new Map();
        this.userLanguages = new Map();
        this.defaultLanguage = 'es';
        this.supportedLanguages = ['es', 'en', 'fr', 'de', 'pt', 'it', 'ru', 'ja'];
        
        this.loadLanguages();
    }

    /**
     * Carga todos los archivos de idioma
     */
    loadLanguages() {
        const localesPath = path.join(__dirname, '../locales');
        
        try {
            const files = fs.readdirSync(localesPath);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const lang = file.replace('.json', '');
                    const langPath = path.join(localesPath, file);
                    const translations = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
                    
                    this.languages.set(lang, translations);
                    console.log(`✅ Idioma cargado: ${lang}`);
                }
            }
        } catch (error) {
            console.error('Error cargando idiomas:', error);
        }
    }

    /**
     * Obtiene el idioma de un servidor o usuario
     * @param {string} guildId 
     * @param {string} userId 
     * @returns {string}
     */
    getLanguage(guildId, userId = null) {
        // Prioridad: Usuario > Servidor > Predeterminado
        if (userId && this.userLanguages.has(userId)) {
            return this.userLanguages.get(userId);
        }
        
        if (guildId && this.guildLanguages.has(guildId)) {
            return this.guildLanguages.get(guildId);
        }
        
        return this.defaultLanguage;
    }

    /**
     * Establece el idioma de un servidor
     * @param {string} guildId 
     * @param {string} language 
     */
    setGuildLanguage(guildId, language) {
        if (this.supportedLanguages.includes(language)) {
            this.guildLanguages.set(guildId, language);
            this.saveLanguageSettings();
            return true;
        }
        return false;
    }

    /**
     * Establece el idioma de un usuario
     * @param {string} userId 
     * @param {string} language 
     */
    setUserLanguage(userId, language) {
        if (this.supportedLanguages.includes(language)) {
            this.userLanguages.set(userId, language);
            this.saveLanguageSettings();
            return true;
        }
        return false;
    }

    /**
     * Obtiene una traducción
     * @param {string} key - Clave de traducción (ej: 'tickets.created')
     * @param {string} guildId 
     * @param {string} userId 
     * @param {Object} replacements - Variables para reemplazar
     * @returns {string}
     */
    get(key, guildId, userId = null, replacements = {}) {
        const language = this.getLanguage(guildId, userId);
        const translations = this.languages.get(language) || this.languages.get(this.defaultLanguage);
        
        if (!translations) {
            return `[MISSING TRANSLATION: ${key}]`;
        }
        
        // Navegar por la estructura anidada
        const keys = key.split('.');
        let value = translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return `[MISSING KEY: ${key}]`;
            }
        }
        
        if (typeof value !== 'string') {
            return `[INVALID VALUE: ${key}]`;
        }
        
        // Reemplazar variables
        let result = value;
        for (const [placeholder, replacement] of Object.entries(replacements)) {
            result = result.replace(new RegExp(`{${placeholder}}`, 'g'), replacement);
        }
        
        return result;
    }

    /**
     * Obtiene todas las traducciones de una sección
     * @param {string} section 
     * @param {string} guildId 
     * @param {string} userId 
     * @returns {Object}
     */
    getSection(section, guildId, userId = null) {
        const language = this.getLanguage(guildId, userId);
        const translations = this.languages.get(language) || this.languages.get(this.defaultLanguage);
        
        return translations?.[section] || {};
    }

    /**
     * Detecta automáticamente el idioma basado en la ubicación del servidor
     * @param {Guild} guild 
     */
    detectLanguage(guild) {
        // Mapeo de regiones de Discord a idiomas
        const regionLanguageMap = {
            'us-west': 'en',
            'us-east': 'en',
            'us-central': 'en',
            'us-south': 'en',
            'eu-west': 'en',
            'eu-central': 'de',
            'london': 'en',
            'amsterdam': 'en',
            'frankfurt': 'de',
            'russia': 'ru',
            'hongkong': 'en',
            'sydney': 'en',
            'japan': 'ja',
            'singapore': 'en',
            'southafrica': 'en',
            'brazil': 'pt',
            'dubai': 'en',
            'india': 'en'
        };

        const preferredLocale = guild.preferredLocale;
        const localeLanguageMap = {
            'en-US': 'en',
            'en-GB': 'en',
            'es-ES': 'es',
            'fr': 'fr',
            'de': 'de',
            'pt-BR': 'pt',
            'it': 'it',
            'ru': 'ru',
            'ja': 'ja'
        };

        // Prioridad: Locale preferido > Región > Predeterminado
        const detectedLanguage = localeLanguageMap[preferredLocale] || 
                                regionLanguageMap[guild.region] || 
                                this.defaultLanguage;

        if (!this.guildLanguages.has(guild.id)) {
            this.setGuildLanguage(guild.id, detectedLanguage);
            console.log(`🌍 Idioma detectado para ${guild.name}: ${detectedLanguage}`);
        }
    }

    /**
     * Obtiene la lista de idiomas soportados
     * @returns {Array}
     */
    getSupportedLanguages() {
        return this.supportedLanguages.map(lang => {
            const translations = this.languages.get(lang);
            return {
                code: lang,
                name: translations?.system?.name || lang.toUpperCase(),
                flag: this.getLanguageFlag(lang)
            };
        });
    }

    /**
     * Obtiene la bandera emoji de un idioma
     * @param {string} language 
     * @returns {string}
     */
    getLanguageFlag(language) {
        const flags = {
            'es': '🇪🇸',
            'en': '🇺🇸',
            'fr': '🇫🇷',
            'de': '🇩🇪',
            'pt': '🇧🇷',
            'it': '🇮🇹',
            'ru': '🇷🇺',
            'ja': '🇯🇵'
        };
        
        return flags[language] || '🌍';
    }

    /**
     * Guarda la configuración de idiomas
     */
    saveLanguageSettings() {
        try {
            const settings = {
                guildLanguages: Object.fromEntries(this.guildLanguages),
                userLanguages: Object.fromEntries(this.userLanguages)
            };
            
            const settingsPath = path.join(__dirname, '../data/language_settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch (error) {
            console.error('Error guardando configuración de idiomas:', error);
        }
    }

    /**
     * Carga la configuración de idiomas
     */
    loadLanguageSettings() {
        try {
            const settingsPath = path.join(__dirname, '../data/language_settings.json');
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                
                this.guildLanguages = new Map(Object.entries(settings.guildLanguages || {}));
                this.userLanguages = new Map(Object.entries(settings.userLanguages || {}));
            }
        } catch (error) {
            console.error('Error cargando configuración de idiomas:', error);
        }
    }
}

// Instancia global del gestor de idiomas
const languageManager = new LanguageManager();
languageManager.loadLanguageSettings();

module.exports = languageManager;