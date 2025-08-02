/*
 * PriorityManager - Sistema profesional de prioridades
 * Gestiona niveles de prioridad automáticos y escalación
 */

class PriorityManager {
    constructor() {
        this.priorities = {
            critical: {
                level: 4,
                name: 'CRÍTICA',
                emoji: '🔴',
                color: '#FF0000',
                slaHours: 1,
                escalationMinutes: 15,
                keywords: ['down', 'caído', 'no funciona', 'critical', 'urgent', 'emergency', 'crash', 'broken', 'error fatal', 'pérdida de datos']
            },
            high: {
                level: 3,
                name: 'ALTA',
                emoji: '🟠',
                color: '#FF8C00',
                slaHours: 4,
                escalationMinutes: 60,
                keywords: ['importante', 'urgent', 'problema grave', 'bloqueo', 'blocked', 'major', 'significativo']
            },
            medium: {
                level: 2,
                name: 'MEDIA',
                emoji: '🟡',
                color: '#FFD700',
                slaHours: 24,
                escalationMinutes: 240,
                keywords: ['normal', 'consulta', 'pregunta', 'ayuda', 'duda', 'question', 'help', 'issue']
            },
            low: {
                level: 1,
                name: 'BAJA',
                emoji: '🟢',
                color: '#00FF00',
                slaHours: 72,
                escalationMinutes: 480,
                keywords: ['sugerencia', 'mejora', 'feature', 'suggestion', 'enhancement', 'nice to have']
            }
        };
    }

    /**
     * Detecta automáticamente la prioridad basada en el contenido
     * @param {string} content 
     * @param {string} category 
     * @returns {string}
     */
    detectPriority(content, category) {
        const lowerContent = content.toLowerCase();
        
        // Prioridad por categoría base
        const categoryPriority = {
            'reporte': 'high',
            'soporte': 'medium',
            'pregunta': 'low',
            'billing': 'high',
            'feature': 'low'
        };

        let detectedPriority = categoryPriority[category] || 'medium';
        let maxLevel = this.priorities[detectedPriority].level;

        // Buscar palabras clave que indiquen mayor prioridad
        for (const [priority, config] of Object.entries(this.priorities)) {
            const keywordCount = config.keywords.filter(keyword => 
                lowerContent.includes(keyword)
            ).length;

            if (keywordCount > 0 && config.level > maxLevel) {
                detectedPriority = priority;
                maxLevel = config.level;
            }
        }

        // Factores adicionales que aumentan prioridad
        if (lowerContent.includes('producción') || 
            lowerContent.includes('production') ||
            lowerContent.includes('clients') ||
            lowerContent.includes('clientes afectados')) {
            if (maxLevel < 3) {
                detectedPriority = 'high';
            }
        }

        // Detectar urgencia por cantidad de signos de exclamación
        const exclamationCount = (content.match(/!/g) || []).length;
        if (exclamationCount >= 3 && maxLevel < 3) {
            detectedPriority = 'high';
        }

        return detectedPriority;
    }

    /**
     * Obtiene la configuración de una prioridad
     * @param {string} priority 
     * @returns {Object}
     */
    getPriorityConfig(priority) {
        return this.priorities[priority] || this.priorities.medium;
    }

    /**
     * Obtiene todas las prioridades disponibles
     * @returns {Object}
     */
    getAllPriorities() {
        return this.priorities;
    }

    /**
     * Verifica si un ticket necesita escalación
     * @param {Object} ticketData 
     * @returns {boolean}
     */
    needsEscalation(ticketData) {
        if (!ticketData.createdAt || ticketData.claimedBy) {
            return false; // Ya fue reclamado
        }

        const priority = this.getPriorityConfig(ticketData.priority || 'medium');
        const timeElapsed = Date.now() - ticketData.createdAt;
        const escalationTime = priority.escalationMinutes * 60 * 1000; // Convertir a ms

        return timeElapsed > escalationTime;
    }

    /**
     * Verifica si un ticket ha violado su SLA
     * @param {Object} ticketData 
     * @returns {Object}
     */
    checkSLA(ticketData) {
        const priority = this.getPriorityConfig(ticketData.priority || 'medium');
        const createdAt = ticketData.createdAt;
        const resolvedAt = ticketData.closedAt || Date.now();
        const slaTime = priority.slaHours * 60 * 60 * 1000; // Convertir a ms
        const actualTime = resolvedAt - createdAt;

        return {
            violated: actualTime > slaTime,
            slaTime: slaTime,
            actualTime: actualTime,
            overTime: actualTime > slaTime ? actualTime - slaTime : 0,
            percentage: Math.round((actualTime / slaTime) * 100)
        };
    }

    /**
     * Genera un embed de información de prioridad
     * @param {string} priority 
     * @param {Object} additionalInfo 
     * @returns {Object}
     */
    createPriorityEmbed(priority, additionalInfo = {}) {
        const config = this.getPriorityConfig(priority);
        
        const embed = {
            title: `${config.emoji} Prioridad: ${config.name}`,
            color: config.color,
            fields: [
                {
                    name: '⏱️ SLA',
                    value: `${config.slaHours} horas`,
                    inline: true
                },
                {
                    name: '🔔 Escalación',
                    value: `${config.escalationMinutes} minutos`,
                    inline: true
                }
            ],
            timestamp: new Date().toISOString()
        };

        if (additionalInfo.slaStatus) {
            embed.fields.push({
                name: '📊 Estado SLA',
                value: additionalInfo.slaStatus.violated ? 
                    `❌ Violado (${additionalInfo.slaStatus.percentage}%)` : 
                    `✅ Cumplido (${additionalInfo.slaStatus.percentage}%)`,
                inline: true
            });
        }

        if (additionalInfo.estimatedResolution) {
            embed.fields.push({
                name: '🎯 Resolución Estimada',
                value: additionalInfo.estimatedResolution,
                inline: false
            });
        }

        return embed;
    }

    /**
     * Obtiene la siguiente prioridad más alta
     * @param {string} currentPriority 
     * @returns {string|null}
     */
    getNextHigherPriority(currentPriority) {
        const current = this.getPriorityConfig(currentPriority);
        const nextLevel = current.level + 1;
        
        for (const [priority, config] of Object.entries(this.priorities)) {
            if (config.level === nextLevel) {
                return priority;
            }
        }
        
        return null;
    }

    /**
     * Calcula métricas de prioridad para estadísticas
     * @param {Array} tickets 
     * @returns {Object}
     */
    calculatePriorityMetrics(tickets) {
        const metrics = {
            distribution: { critical: 0, high: 0, medium: 0, low: 0 },
            slaCompliance: { critical: 0, high: 0, medium: 0, low: 0 },
            avgResolutionTime: { critical: 0, high: 0, medium: 0, low: 0 },
            escalations: 0
        };

        const resolutionTimes = { critical: [], high: [], medium: [], low: [] };

        tickets.forEach(ticket => {
            const priority = ticket.priority || 'medium';
            metrics.distribution[priority]++;

            if (ticket.closedAt) {
                const resolutionTime = ticket.closedAt - ticket.createdAt;
                resolutionTimes[priority].push(resolutionTime);

                const slaCheck = this.checkSLA(ticket);
                if (!slaCheck.violated) {
                    metrics.slaCompliance[priority]++;
                }
            }

            if (ticket.escalated) {
                metrics.escalations++;
            }
        });

        // Calcular tiempos promedio
        Object.keys(resolutionTimes).forEach(priority => {
            const times = resolutionTimes[priority];
            if (times.length > 0) {
                const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
                metrics.avgResolutionTime[priority] = this.formatDuration(avgTime);
            } else {
                metrics.avgResolutionTime[priority] = 'N/A';
            }
        });

        // Calcular porcentajes de SLA
        Object.keys(metrics.slaCompliance).forEach(priority => {
            const total = metrics.distribution[priority];
            if (total > 0) {
                metrics.slaCompliance[priority] = 
                    Math.round((metrics.slaCompliance[priority] / total) * 100);
            }
        });

        return metrics;
    }

    /**
     * Formatea duración en milisegundos
     * @param {number} ms 
     * @returns {string}
     */
    formatDuration(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
}

module.exports = new PriorityManager();