/**
 * UI Components
 * Componenti dell'interfaccia utente riutilizzabili
 */

class UIComponents {
    constructor() {
        this.notifications = [];
        this.modals = new Map();
        
        this.init();
    }

    /**
     * Inizializza i componenti UI
     */
    init() {
        this.createNotificationContainer();
        this.setupGlobalEventListeners();
        console.log('UIComponents inizializzato');
    }

    /**
     * Crea il container per le notifiche
     */
    createNotificationContainer() {
        if (document.getElementById('notifications-container')) return;
        
        const container = document.createElement('div');
        container.id = 'notifications-container';
        container.className = 'notifications-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1060;
            pointer-events: none;
        `;
        
        document.body.appendChild(container);
    }

    /**
     * Configura gli event listeners globali
     */
    setupGlobalEventListeners() {
        // Gestione tasti di scelta rapida
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTopModal();
            }
        });
        
        // Gestione click fuori dai modal
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                this.closeTopModal();
            }
        });
    }

    /**
     * Mostra una notifica
     */
    showNotification(message, type = 'info', duration = 5000) {
        const id = 'notification-' + Date.now();
        const notification = this.createNotificationElement(id, message, type);
        
        const container = document.getElementById('notifications-container');
        container.appendChild(notification);
        
        // Animazione di entrata
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });
        
        // Auto-rimozione
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(id);
            }, duration);
        }
        
        this.notifications.push({ id, element: notification, type });
        
        return id;
    }

    /**
     * Crea l'elemento notifica
     */
    createNotificationElement(id, message, type) {
        const notification = document.createElement('div');
        notification.id = id;
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border-left: 4px solid var(--${this.getTypeColor(type)});
            pointer-events: auto;
            transform: translateX(100%);
            transition: transform 0.3s ease, opacity 0.3s ease;
            opacity: 0;
            max-width: 400px;
            word-wrap: break-word;
        `;
        
        const icon = this.getTypeIcon(type);
        
        notification.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="color: var(--${this.getTypeColor(type)}); flex-shrink: 0;">
                    ${icon}
                </div>
                <div style="flex: 1; font-size: 14px; line-height: 1.4;">
                    ${message}
                </div>
                <button onclick="uiComponents.removeNotification('${id}')" 
                        style="background: none; border: none; color: #666; cursor: pointer; padding: 0; font-size: 18px; line-height: 1;">
                    ×
                </button>
            </div>
        `;
        
        // Classe per animazione
        notification.classList.add('notification-enter');
        
        return notification;
    }

    /**
     * Ottiene il colore per il tipo di notifica
     */
    getTypeColor(type) {
        const colors = {
            success: 'success',
            error: 'error',
            warning: 'warning',
            info: 'primary-600'
        };
        return colors[type] || colors.info;
    }

    /**
     * Ottiene l'icona per il tipo di notifica
     */
    getTypeIcon(type) {
        const icons = {
            success: '✓',
            error: '⚠',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    /**
     * Rimuove una notifica
     */
    removeNotification(id) {
        const notification = document.getElementById(id);
        if (!notification) return;
        
        // Animazione di uscita
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            
            // Rimuovi dalla lista
            this.notifications = this.notifications.filter(n => n.id !== id);
        }, 300);
    }

    /**
     * Crea un modal
     */
    createModal(id, options = {}) {
        const defaultOptions = {
            title: '',
            content: '',
            size: 'medium', // small, medium, large, fullscreen
            closable: true,
            backdrop: true,
            keyboard: true
        };
        
        const config = { ...defaultOptions, ...options };
        
        // Rimuovi modal esistente con lo stesso ID
        this.removeModal(id);
        
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1050;
            display: none;
        `;
        
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        const dialog = document.createElement('div');
        dialog.className = `modal-dialog modal-${config.size}`;
        dialog.style.cssText = `
            position: relative;
            margin: 20px auto;
            max-width: ${this.getModalWidth(config.size)};
            transform: translateY(-50px);
            transition: transform 0.3s ease;
        `;
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        `;
        
        let headerHTML = '';
        if (config.title || config.closable) {
            headerHTML = `
                <div class="modal-header" style="padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${config.title}</h3>
                    ${config.closable ? `<button onclick="uiComponents.closeModal('${id}')" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>` : ''}
                </div>
            `;
        }
        
        content.innerHTML = `
            ${headerHTML}
            <div class="modal-body" style="padding: 20px;">
                ${config.content}
            </div>
        `;
        
        dialog.appendChild(content);
        modal.appendChild(backdrop);
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        
        this.modals.set(id, { element: modal, config });
        
        return modal;
    }

    /**
     * Ottiene la larghezza del modal in base alla dimensione
     */
    getModalWidth(size) {
        const sizes = {
            small: '400px',
            medium: '600px',
            large: '800px',
            fullscreen: '95vw'
        };
        return sizes[size] || sizes.medium;
    }

    /**
     * Mostra un modal
     */
    showModal(id) {
        const modalData = this.modals.get(id);
        if (!modalData) return false;
        
        const modal = modalData.element;
        const backdrop = modal.querySelector('.modal-backdrop');
        const dialog = modal.querySelector('.modal-dialog');
        
        modal.style.display = 'block';
        
        requestAnimationFrame(() => {
            backdrop.style.opacity = '1';
            dialog.style.transform = 'translateY(0)';
        });
        
        // Gestione focus
        const firstFocusable = modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }
        
        return true;
    }

    /**
     * Chiude un modal
     */
    closeModal(id) {
        const modalData = this.modals.get(id);
        if (!modalData) return false;
        
        const modal = modalData.element;
        const backdrop = modal.querySelector('.modal-backdrop');
        const dialog = modal.querySelector('.modal-dialog');
        
        backdrop.style.opacity = '0';
        dialog.style.transform = 'translateY(-50px)';
        
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
        
        return true;
    }

    /**
     * Rimuove un modal
     */
    removeModal(id) {
        const modalData = this.modals.get(id);
        if (!modalData) return false;
        
        const modal = modalData.element;
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
        
        this.modals.delete(id);
        return true;
    }

    /**
     * Chiude il modal in cima allo stack
     */
    closeTopModal() {
        const visibleModals = Array.from(this.modals.entries())
            .filter(([id, data]) => data.element.style.display === 'block');
        
        if (visibleModals.length > 0) {
            const [topModalId] = visibleModals[visibleModals.length - 1];
            this.closeModal(topModalId);
        }
    }

    /**
     * Crea un loader
     */
    showLoader(message = 'Caricamento...') {
        const loaderId = 'global-loader';
        
        if (document.getElementById(loaderId)) {
            return loaderId;
        }
        
        const loader = document.createElement('div');
        loader.id = loaderId;
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1070;
            flex-direction: column;
            gap: 16px;
        `;
        
        loader.innerHTML = `
            <div style="width: 40px; height: 40px; border: 4px solid #e0e0e0; border-top: 4px solid #2196f3; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div style="color: #666; font-size: 16px;">${message}</div>
        `;
        
        // Aggiungi animazione CSS se non esiste
        if (!document.getElementById('loader-styles')) {
            const style = document.createElement('style');
            style.id = 'loader-styles';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(loader);
        
        return loaderId;
    }

    /**
     * Nasconde il loader
     */
    hideLoader(loaderId = 'global-loader') {
        const loader = document.getElementById(loaderId);
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }

    /**
     * Crea un tooltip
     */
    createTooltip(element, text, position = 'top') {
        let tooltip = element.querySelector('.tooltip');
        
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1060;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            `;
            
            element.style.position = 'relative';
            element.appendChild(tooltip);
        }
        
        tooltip.textContent = text;
        
        // Posizionamento
        const positions = {
            top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '5px' },
            bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '5px' },
            left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '5px' },
            right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '5px' }
        };
        
        Object.assign(tooltip.style, positions[position] || positions.top);
        
        // Event listeners
        element.addEventListener('mouseenter', () => {
            tooltip.style.opacity = '1';
        });
        
        element.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
        });
    }

    /**
     * Utility per animazioni
     */
    animate(element, keyframes, options = {}) {
        const defaultOptions = {
            duration: 300,
            easing: 'ease',
            fill: 'forwards'
        };
        
        const animationOptions = { ...defaultOptions, ...options };
        
        if (element.animate) {
            return element.animate(keyframes, animationOptions);
        } else {
            // Fallback per browser più vecchi
            console.warn('Web Animations API non supportata');
            return null;
        }
    }

    /**
     * Utility per gestire le classi CSS
     */
    toggleClass(element, className, force = null) {
        if (force !== null) {
            element.classList.toggle(className, force);
        } else {
            element.classList.toggle(className);
        }
    }

    /**
     * Utility per gestire gli attributi
     */
    setAttributes(element, attributes) {
        Object.keys(attributes).forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
    }
}

// Inizializza i componenti UI
let uiComponents;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        uiComponents = new UIComponents();
        window.uiComponents = uiComponents;
    });
} else {
    uiComponents = new UIComponents();
    window.uiComponents = uiComponents;
}

// Esporta per compatibilità
window.UIComponents = UIComponents;