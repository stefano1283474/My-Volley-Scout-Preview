/**
 * Utility Functions
 * Funzioni helper comuni per l'applicazione
 */

/**
 * Formattazione e validazione
 */
const Utils = {
    /**
     * Formatta una data in formato italiano
     */
    formatDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };
        
        const formatOptions = { ...defaultOptions, ...options };
        
        if (typeof date === 'string') {
            date = new Date(date);
        }
        
        if (!(date instanceof Date) || isNaN(date)) {
            return 'Data non valida';
        }
        
        return date.toLocaleDateString('it-IT', formatOptions);
    },

    /**
     * Formatta un orario
     */
    formatTime(date) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        
        if (!(date instanceof Date) || isNaN(date)) {
            return 'Orario non valido';
        }
        
        return date.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Formatta una durata in minuti
     */
    formatDuration(minutes) {
        if (typeof minutes !== 'number' || minutes < 0) {
            return '0 min';
        }
        
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${mins}min`;
        }
        
        return `${mins} min`;
    },

    /**
     * Capitalizza la prima lettera di una stringa
     */
    capitalize(str) {
        if (typeof str !== 'string' || str.length === 0) {
            return str;
        }
        
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    /**
     * Tronca una stringa alla lunghezza specificata
     */
    truncate(str, length = 50, suffix = '...') {
        if (typeof str !== 'string') {
            return str;
        }
        
        if (str.length <= length) {
            return str;
        }
        
        return str.substring(0, length - suffix.length) + suffix;
    },

    /**
     * Valida un indirizzo email
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * Valida una password
     */
    validatePassword(password) {
        const errors = [];
        
        if (!password || password.length < 6) {
            errors.push('La password deve essere di almeno 6 caratteri');
        }
        
        if (!/[A-Za-z]/.test(password)) {
            errors.push('La password deve contenere almeno una lettera');
        }
        
        if (!/\d/.test(password)) {
            errors.push('La password deve contenere almeno un numero');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    },

    /**
     * Genera un ID univoco
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Debounce function
     */
    debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    },

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Deep clone di un oggetto
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        
        if (obj instanceof Array) {
            return obj.map(item => this.deepClone(item));
        }
        
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });
            return cloned;
        }
    },

    /**
     * Confronta due oggetti per uguaglianza profonda
     */
    deepEqual(a, b) {
        if (a === b) return true;
        
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }
        
        if (!a || !b || (typeof a !== 'object' && typeof b !== 'object')) {
            return a === b;
        }
        
        if (a === null || a === undefined || b === null || b === undefined) {
            return false;
        }
        
        if (a.prototype !== b.prototype) return false;
        
        let keys = Object.keys(a);
        if (keys.length !== Object.keys(b).length) {
            return false;
        }
        
        return keys.every(k => this.deepEqual(a[k], b[k]));
    },

    /**
     * Converte un file in base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    },

    /**
     * Download di un file
     */
    downloadFile(content, filename, contentType = 'text/plain') {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    },

    /**
     * Copia testo negli appunti
     */
    async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback per browser più vecchi
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const result = document.execCommand('copy');
                document.body.removeChild(textArea);
                return result;
            }
        } catch (error) {
            console.error('Errore nella copia negli appunti:', error);
            return false;
        }
    },

    /**
     * Formatta un numero con separatori delle migliaia
     */
    formatNumber(num, locale = 'it-IT') {
        if (typeof num !== 'number') {
            return num;
        }
        
        return num.toLocaleString(locale);
    },

    /**
     * Calcola la percentuale
     */
    percentage(value, total, decimals = 1) {
        if (total === 0) return 0;
        return Math.round((value / total) * 100 * Math.pow(10, decimals)) / Math.pow(10, decimals);
    },

    /**
     * Ordina un array di oggetti per una proprietà
     */
    sortBy(array, property, direction = 'asc') {
        return [...array].sort((a, b) => {
            const aVal = this.getNestedProperty(a, property);
            const bVal = this.getNestedProperty(b, property);
            
            if (aVal < bVal) {
                return direction === 'asc' ? -1 : 1;
            }
            if (aVal > bVal) {
                return direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    },

    /**
     * Ottiene una proprietà annidata di un oggetto
     */
    getNestedProperty(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    },

    /**
     * Imposta una proprietà annidata di un oggetto
     */
    setNestedProperty(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        
        const target = keys.reduce((current, key) => {
            if (current[key] === undefined) {
                current[key] = {};
            }
            return current[key];
        }, obj);
        
        target[lastKey] = value;
    },

    /**
     * Filtra un array rimuovendo duplicati
     */
    unique(array, key = null) {
        if (key) {
            const seen = new Set();
            return array.filter(item => {
                const value = this.getNestedProperty(item, key);
                if (seen.has(value)) {
                    return false;
                }
                seen.add(value);
                return true;
            });
        }
        
        return [...new Set(array)];
    },

    /**
     * Raggruppa un array per una proprietà
     */
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const value = this.getNestedProperty(item, key);
            if (!groups[value]) {
                groups[value] = [];
            }
            groups[value].push(item);
            return groups;
        }, {});
    },

    /**
     * Verifica se un elemento è visibile nel viewport
     */
    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    },

    /**
     * Scorre fino a un elemento
     */
    scrollToElement(element, options = {}) {
        const defaultOptions = {
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest'
        };
        
        element.scrollIntoView({ ...defaultOptions, ...options });
    },

    /**
     * Ottiene informazioni sul dispositivo
     */
    getDeviceInfo() {
        return {
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            isTablet: /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent),
            isDesktop: !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine
        };
    },

    /**
     * Gestione del localStorage con fallback
     */
    storage: {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('Errore nel salvataggio localStorage:', error);
                return false;
            }
        },
        
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.error('Errore nel caricamento localStorage:', error);
                return defaultValue;
            }
        },
        
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error('Errore nella rimozione localStorage:', error);
                return false;
            }
        },
        
        clear() {
            try {
                localStorage.clear();
                return true;
            } catch (error) {
                console.error('Errore nella pulizia localStorage:', error);
                return false;
            }
        }
    },

    /**
     * Gestione degli errori
     */
    handleError(error, context = 'Unknown') {
        const errorInfo = {
            message: error.message || 'Errore sconosciuto',
            stack: error.stack,
            context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        console.error('Error handled:', errorInfo);
        
        // In futuro, qui si potrebbe inviare l'errore a un servizio di logging
        
        return errorInfo;
    }
};

// Esporta le utility globalmente
window.Utils = Utils;

// Esporta anche come modulo per compatibilità
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}